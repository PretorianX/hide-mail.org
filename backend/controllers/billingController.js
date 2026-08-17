/**
 * WayForPay checkout + webhook. Issues or revokes Redis license keys.
 * POST /api/billing/webhook must skip origin verification (server-to-server).
 */

const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitize');
const wayforpayService = require('../services/wayforpayService');
const licenseService = require('../services/licenseService');
const orderService = require('../services/orderService');
const entitlementService = require('../services/entitlementService');
const metrics = require('../services/metricsService');

const licenseTtlForPlan = (plan) => {
  if (plan === 'yearly') {
    return config.billing.yearlyTtlSeconds;
  }
  return config.billing.monthlyTtlSeconds;
};

const formatDateNext = (plan, from = new Date()) => {
  const next = new Date(from.getTime());
  if (plan === 'yearly') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  const dd = String(next.getDate()).padStart(2, '0');
  const mm = String(next.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${next.getFullYear()}`;
};

const checkout = async (req, res, next) => {
  try {
    const plan = req.body?.plan;
    const type = req.body?.type === 'api' ? 'api' : 'pro';

    let product;
    try {
      product = wayforpayService.resolveProduct(type, plan);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: type === 'api' ? 'API plan must be monthly' : 'plan must be monthly or yearly',
        code: 'INVALID_PLAN',
      });
    }

    if (!config.wayforpay.merchantAccount || !config.wayforpay.secretKey || !config.wayforpay.returnUrl) {
      return res.status(503).json({
        success: false,
        error: 'WayForPay is not configured',
        code: 'PAYMENTS_NOT_CONFIGURED',
      });
    }

    const orderReference = `${type}-${plan}-${uuidv4()}`;
    const orderDate = Math.floor(Date.now() / 1000);

    await orderService.createOrder({
      id: orderReference,
      plan,
      type,
      amount: product.amount,
      currency: config.billing.currency,
    });

    const payload = wayforpayService.buildCheckoutPayload({
      type,
      plan,
      orderReference,
      orderDate,
      dateNext: formatDateNext(plan),
    });

    const checkout = {
      ...payload,
      displayUsd: product.usdDisplay,
    };

    metrics.billingCheckoutsTotal.inc({ type, plan });

    return res.status(200).json({
      success: true,
      checkout,
      data: checkout,
    });
  } catch (error) {
    logger.error(`Billing checkout error: ${sanitizeForLog(error.message)}`);
    return next(error);
  }
};

/**
 * A recurring charge arrives with a fresh orderReference, so an existing license is
 * matched by recToken and simply extended. A first payment must match an order that
 * checkout stored, and plan, type and price come from that order rather than from the
 * callback, so a caller cannot ask for a plan it did not pay for.
 */
/**
 * Revenue is booked from the price we hold server-side, never from the callback, so the
 * figure on the dashboard matches what we actually charge for the plan.
 */
const recordSale = ({ type, plan }) => {
  const { amount } = wayforpayService.resolveProduct(type, plan);
  metrics.billingRevenueTotal.inc({ currency: config.billing.currency, type, plan }, amount);
};

const activateLicense = async ({ orderReference, recToken, amount, currency }) => {
  const existing = (await licenseService.findByRecToken(recToken))
    || (await licenseService.findByOrderReference(orderReference));

  if (existing) {
    const license = await licenseService.renewByPayment({
      orderReference,
      recToken,
      ttlSeconds: licenseTtlForPlan(existing.plan),
    });
    await orderService.markOrderPaid(orderReference, license.key);
    recordSale(existing);
    metrics.billingWebhookEventsTotal.inc({ result: 'license_renewed' });
    return;
  }

  const order = await orderService.getOrder(orderReference);
  if (!order) {
    metrics.billingWebhookEventsTotal.inc({ result: 'unknown_order' });
    logger.warn(`WayForPay webhook for unknown order=${sanitizeForLog(orderReference)}`);
    return;
  }
  if (Number(amount) !== Number(order.amount) || currency !== order.currency) {
    metrics.billingWebhookEventsTotal.inc({ result: 'amount_mismatch' });
    logger.warn(`WayForPay webhook amount mismatch order=${sanitizeForLog(orderReference)}`);
    return;
  }

  const license = await licenseService.createLicense({
    type: order.type,
    plan: order.plan,
    orderReference,
    recToken,
    ttlSeconds: licenseTtlForPlan(order.plan),
  });

  const extra = {};
  if (license.type === 'api') {
    extra.apiKey = await licenseService.createApiKey(license.key);
    const issued = await licenseService.validateApiKey(extra.apiKey);
    extra.apiKeyRemainingDays = issued.remainingDays;
    extra.apiKeyExpiresAt = issued.expiresAt;
  }
  await orderService.markOrderPaid(orderReference, license.key, extra);
  recordSale(order);
  metrics.billingWebhookEventsTotal.inc({ result: 'license_created' });
};

const webhook = async (req, res, next) => {
  try {
    const callback = req.body;
    if (!callback || typeof callback !== 'object') {
      return res.status(400).json({ error: 'JSON body required' });
    }

    const valid = wayforpayService.verifyCallbackSignature(callback, config.wayforpay.secretKey);
    if (!valid) {
      metrics.billingWebhookEventsTotal.inc({ result: 'invalid_signature' });
      logger.warn('WayForPay webhook signature mismatch');
      return res.status(400).json({ error: 'Invalid merchantSignature' });
    }

    let action;
    try {
      action = wayforpayService.classifyTransactionStatus(callback.transactionStatus);
    } catch (error) {
      metrics.billingWebhookEventsTotal.inc({ result: 'unsupported_status' });
      logger.warn(
        `WayForPay webhook unsupported status=${sanitizeForLog(callback.transactionStatus)}`
      );
      return res.status(400).json({ error: 'Unsupported transactionStatus' });
    }

    const { orderReference, recToken } = callback;

    if (action === 'activate') {
      await activateLicense({
        orderReference,
        recToken,
        amount: callback.amount,
        currency: callback.currency,
      });
    } else if (action === 'revoke') {
      const revoked = await licenseService.revokeByPayment({ orderReference, recToken });
      metrics.billingWebhookEventsTotal.inc({
        result: revoked ? 'license_revoked' : 'revoke_no_license',
      });
    } else {
      // ignore: Declined / Expired / in-progress — payment is not a completed sale
      metrics.billingWebhookEventsTotal.inc({ result: 'ignored' });
    }

    const ack = wayforpayService.acknowledgeWebhook(
      orderReference,
      Math.floor(Date.now() / 1000),
      config.wayforpay.secretKey
    );
    return res.status(200).json(ack);
  } catch (error) {
    logger.error(`Billing webhook error: ${sanitizeForLog(error.message)}`);
    return next(error);
  }
};

/**
 * WayForPay sends the payer back with a POST, which static hosting answers with 405, so the
 * browser lands here and is redirected to the page that turns the order reference into a key.
 */
const customerReturn = (req, res) => {
  const target = new URL(config.wayforpay.returnUrl);
  const { orderReference } = req.query || {};
  if (typeof orderReference === 'string' && orderReference) {
    target.searchParams.set('orderReference', orderReference);
  }
  return res.redirect(302, target.toString());
};

const validateLicense = async (req, res, next) => {
  try {
    const key = req.body?.key || req.query?.key;
    const result = await licenseService.validateLicense(key);
    if (!result.active) {
      return res.status(404).json({
        success: false,
        error: 'License not found',
      });
    }
    const stored = await licenseService.getLicense(key);
    const entitlements = entitlementService.getEntitlements(stored);
    return res.status(200).json({
      success: true,
      license: result,
      entitlements,
      data: {
        ...result,
        entitlements,
      },
    });
  } catch (error) {
    logger.error(`License validate error: ${sanitizeForLog(error.message)}`);
    return next(error);
  }
};

/**
 * API keys deliberately live for 30 days while the licence runs for a month or a year, and the
 * post-payment handoff window closes after an hour. Without this route an API subscriber whose
 * key expired — or who lost it — would have no way back in short of buying again.
 */
const issueApiKey = async (req, res, next) => {
  try {
    const key = req.body?.key;
    const license = await licenseService.getLicense(key);

    if (!licenseService.isActive(license)) {
      return res.status(404).json({ success: false, error: 'License not found' });
    }
    if (license.type !== 'api') {
      return res.status(403).json({
        success: false,
        error: 'API keys are only issued for the QA API plan',
        code: 'API_PLAN_REQUIRED',
      });
    }

    const apiKey = await licenseService.createApiKey(license.key);
    const issued = await licenseService.validateApiKey(apiKey);
    logger.info(`API key reissued license=${licenseService.maskKey(license.key)}`);

    return res.status(200).json({
      success: true,
      apiKey,
      expiresAt: issued.expiresAt,
      remainingDays: issued.remainingDays,
    });
  } catch (error) {
    logger.error(`API key reissue error: ${sanitizeForLog(error.message)}`);
    return next(error);
  }
};

const getOrder = async (req, res, next) => {
  try {
    const order = await orderService.getOrder(req.params.orderReference);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const handoffOpen = Boolean(order.paidAt)
      && Date.now() - order.paidAt <= config.billing.keyHandoffSeconds * 1000;
    if (!handoffOpen) {
      const { licenseKey, apiKey, ...safe } = order;
      return res.status(200).json({ success: true, data: safe, licenseKey: null, apiKey: null });
    }

    return res.status(200).json({
      success: true,
      data: order,
      licenseKey: order.licenseKey,
      apiKey: order.apiKey || null,
      apiKeyRemainingDays: order.apiKeyRemainingDays || null,
    });
  } catch (error) {
    logger.error(`Get order error: ${sanitizeForLog(error.message)}`);
    return next(error);
  }
};

const CATALOG = [
  { id: 'monthly', type: 'pro', plan: 'monthly' },
  { id: 'yearly', type: 'pro', plan: 'yearly' },
  { id: 'api', type: 'api', plan: 'monthly' },
];

const listPlans = (req, res) => {
  res.status(200).json({
    success: true,
    currency: config.billing.currency,
    plans: CATALOG.map(({ id, type, plan }) => {
      const product = wayforpayService.resolveProduct(type, plan);
      return {
        id,
        type,
        plan,
        amount: product.amount,
        usdDisplay: product.usdDisplay,
      };
    }),
    tiers: entitlementService.describeTiers(),
  });
};

module.exports = {
  checkout,
  webhook,
  customerReturn,
  validateLicense,
  issueApiKey,
  getOrder,
  listPlans,
  getPricing: listPlans,
  createCheckout: checkout,
  wayforpayWebhook: webhook,
  restoreLicense: validateLicense,
  getPaidOrder: getOrder,
};
