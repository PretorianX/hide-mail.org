/**
 * WayForPay merchant API: HMAC-MD5 signatures, checkout payload, webhook status.
 * Docs: https://wiki.wayforpay.com/en/view/852102
 *
 * Paddle can be added later as a separate processor; do not chain payment providers here.
 */

const crypto = require('crypto');
const config = require('../config/config');

const PAYMENT_URL = 'https://secure.wayforpay.com/pay';
const WAYFORPAY_API_URL = 'https://api.wayforpay.com/api';
const CHECK_STATUS_TIMEOUT_MS = 8000;

// WayForPay POSTs the payer back to returnUrl, and static hosting answers a POST with 405, so
// the customer returns through the API, which redirects the browser on to the Pro page.
const CUSTOMER_RETURN_PATH = '/api/billing/return';

const customerReturnUrl = (proPageUrl, orderReference) => {
  const url = new URL(CUSTOMER_RETURN_PATH, proPageUrl);
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
    },
    yearly: {
      productName: 'Hide Mail Pro Yearly',
      regularMode: 'yearly',
    },
  },
  api: {
    monthly: {
      productName: 'Hide Mail API Monthly',
      regularMode: 'monthly',
    },
  },
  suite: {
    monthly: {
      productName: 'Hide Mail Deliverability Suite Monthly',
      regularMode: 'monthly',
    },
  },
  grade: {
    monthly: {
      productName: 'Mail Grade API Monthly',
      regularMode: 'monthly',
    },
  },
  sender: {
    monthly: {
      productName: 'Sender Check API Monthly',
      regularMode: 'monthly',
    },
  },
  reports: {
    monthly: {
      productName: 'DMARC Reports API Monthly',
      regularMode: 'monthly',
    },
  },
  bounce: {
    monthly: {
      productName: 'Bounce Read API Monthly',
      regularMode: 'monthly',
    },
  },
  complaint: {
    monthly: {
      productName: 'Complaint Read API Monthly',
      regularMode: 'monthly',
    },
  },
  tls: {
    monthly: {
      productName: 'TLS Reports API Monthly',
      regularMode: 'monthly',
    },
  },
  access: {
    monthly: {
      productName: 'Access Check API Monthly',
      regularMode: 'monthly',
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
  // The callback is unauthenticated until this returns true, so the signature field is treated
  // as arbitrary JSON: anything other than a string is simply not a signature.
  if (!payload || typeof payload.merchantSignature !== 'string') {
    return false;
  }
  const expected = signCallback(payload, secretKey);
  return timingSafeEqualHex(expected, payload.merchantSignature.toLowerCase());
};

const buildCheckoutPayload = ({
  type,
  plan,
  orderReference,
  orderDate,
  dateNext,
  amount,
  alternativeAmount,
  alternativeCurrency,
}) => {
  const product = resolveProduct(type, plan);
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
    returnUrl: customerReturnUrl(config.wayforpay.returnUrl, orderReference),
    regularMode: product.regularMode,
    regularOn: 1,
    regularBehavior: 'preset',
    dateNext,
    language: 'EN',
    paymentUrl: PAYMENT_URL,
  };

  // alternativeAmount is not in the HMAC purchase string; only USD/EUR are valid values.
  if (alternativeCurrency && alternativeAmount !== undefined) {
    payload.alternativeAmount = alternativeAmount;
    payload.alternativeCurrency = alternativeCurrency;
  }

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

const checkTransactionStatus = async (orderReference) => {
  const merchantAccount = config.wayforpay.merchantAccount;
  const secretKey = config.wayforpay.secretKey;
  if (!merchantAccount || !secretKey) {
    throw new Error('WayForPay merchant is not configured');
  }
  const merchantSignature = hmacMd5(secretKey, `${merchantAccount};${orderReference}`);
  const response = await fetch(WAYFORPAY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiVersion: 1,
      transactionType: 'CHECK_STATUS',
      merchantAccount,
      orderReference,
      merchantSignature,
    }),
    signal: AbortSignal.timeout(CHECK_STATUS_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`CHECK_STATUS HTTP ${response.status}`);
  }
  return response.json();
};

module.exports = {
  hmacMd5,
  resolveProduct,
  signPurchase,
  signCallback,
  verifyCallbackSignature,
  buildCheckoutPayload,
  classifyTransactionStatus,
  acknowledgeWebhook,
  checkTransactionStatus,
  PAYMENT_URL,
};
