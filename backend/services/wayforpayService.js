/**
 * WayForPay merchant API: HMAC-MD5 signatures, checkout payload, webhook status.
 * Docs: https://wiki.wayforpay.com/en/view/852102
 *
 * Paddle can be added later as a separate processor; do not chain payment providers here.
 */

const crypto = require('crypto');
const config = require('../config/config');

const PAYMENT_URL = 'https://secure.wayforpay.com/pay';

const returnUrlWithOrder = (base, orderReference) => {
  const url = new URL(base);
  url.searchParams.set('orderReference', orderReference);
  return url.toString();
};

// Single source of truth for what a licence type and plan combination costs, so the amount
// stored on the order always equals the amount inside the signed WayForPay payload.
const PRODUCTS = {
  pro: {
    monthly: {
      productName: 'Hide Mail Pro Monthly',
      regularMode: 'monthly',
      amountKey: 'monthlyAmount',
      usdKey: 'monthlyUsdDisplay',
    },
    yearly: {
      productName: 'Hide Mail Pro Yearly',
      regularMode: 'yearly',
      amountKey: 'yearlyAmount',
      usdKey: 'yearlyUsdDisplay',
    },
  },
  api: {
    monthly: {
      productName: 'Hide Mail API Monthly',
      regularMode: 'monthly',
      amountKey: 'apiAmount',
      usdKey: 'apiUsdDisplay',
    },
  },
};

const resolveProduct = (type, plan) => {
  const product = PRODUCTS[type] && PRODUCTS[type][plan];
  if (!product) {
    throw new Error(`Unsupported ${type} plan: ${plan}`);
  }
  return {
    productName: product.productName,
    regularMode: product.regularMode,
    amount: config.billing[product.amountKey],
    usdDisplay: config.billing[product.usdKey],
  };
};

// HMAC-MD5 is the only signature algorithm WayForPay accepts, so it cannot be upgraded
// here. MD5 collisions do not break HMAC authentication, and comparisons are timing safe.
const hmacMd5 = (secret, value) =>
  crypto.createHmac('md5', secret).update(String(value), 'utf8').digest('hex');

const timingSafeEqualHex = (expected, actual) => {
  if (typeof expected !== 'string' || typeof actual !== 'string') {
    return false;
  }
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(actual, 'hex');
  if (expectedBuf.length === 0 || expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
};

const purchaseSignatureString = (payload) => {
  const names = payload.productName || [];
  const counts = payload.productCount || [];
  const prices = payload.productPrice || [];
  return [
    payload.merchantAccount,
    payload.merchantDomainName,
    payload.orderReference,
    String(payload.orderDate),
    String(payload.amount),
    payload.currency,
    ...names,
    ...counts.map(String),
    ...prices.map(String),
  ].join(';');
};

const callbackSignatureString = (payload) =>
  [
    payload.merchantAccount,
    payload.orderReference,
    String(payload.amount),
    payload.currency,
    payload.authCode,
    payload.cardPan,
    payload.transactionStatus,
    String(payload.reasonCode),
  ].join(';');

const signPurchase = (payload, secretKey) => hmacMd5(secretKey, purchaseSignatureString(payload));

const signCallback = (payload, secretKey) => hmacMd5(secretKey, callbackSignatureString(payload));

const verifyCallbackSignature = (payload, secretKey) => {
  if (!payload || !payload.merchantSignature) {
    return false;
  }
  const expected = signCallback(payload, secretKey);
  return timingSafeEqualHex(expected, payload.merchantSignature.toLowerCase());
};

const buildCheckoutPayload = ({ type, plan, orderReference, orderDate, dateNext }) => {
  const product = resolveProduct(type, plan);
  const amount = product.amount;
  const payload = {
    merchantAccount: config.wayforpay.merchantAccount,
    merchantAuthType: 'SimpleSignature',
    merchantDomainName: config.wayforpay.domainName,
    merchantTransactionSecureType: 'AUTO',
    orderReference,
    orderDate,
    amount,
    currency: config.billing.currency,
    productName: [product.productName],
    productCount: [1],
    productPrice: [amount],
    serviceUrl: config.wayforpay.serviceUrl,
    returnUrl: returnUrlWithOrder(config.wayforpay.returnUrl, orderReference),
    regularMode: product.regularMode,
    regularOn: 1,
    regularBehavior: 'preset',
    dateNext,
    language: 'EN',
    paymentUrl: PAYMENT_URL,
  };

  payload.merchantSignature = signPurchase(payload, config.wayforpay.secretKey);
  return payload;
};

const classifyTransactionStatus = (status) => {
  switch (status) {
    case 'Approved':
      return 'activate';
    case 'Refunded':
    case 'Voided':
      return 'revoke';
    case 'Declined':
    case 'Expired':
    case 'Pending':
    case 'InProcessing':
    case 'WaitingAuthComplete':
      return 'ignore';
    default:
      throw new Error(`Unsupported transactionStatus: ${status}`);
  }
};

const acknowledgeWebhook = (orderReference, time, secretKey) => ({
  orderReference,
  status: 'accept',
  time,
  signature: hmacMd5(secretKey, `${orderReference};accept;${time}`),
});

module.exports = {
  resolveProduct,
  signPurchase,
  signCallback,
  verifyCallbackSignature,
  buildCheckoutPayload,
  classifyTransactionStatus,
  acknowledgeWebhook,
  PAYMENT_URL,
};
