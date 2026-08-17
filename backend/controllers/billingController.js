/**
 * WayForPay checkout + webhook. Issues or revokes Redis license keys.
 * POST /api/billing/webhook must skip origin verification (server-to-server).
 */

const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const logger = require('../utils/logger');
const wayforpayService = require('../services/wayforpayService');
const licenseService = require('../services/licenseService');
const orderService = require('../services/orderService');
const entitlementService = require('../services/entitlementService');

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
    if (plan !== 'monthly' && plan !== 'yearly') {
      return res.status(400).json({
        success: false,
        error: 'plan must be monthly or yearly',
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

    const type = req.body?.type === 'api' ? 'api' : 'pro';
    const amount = plan === 'yearly' ? config.billing.yearlyAmount : config.billing.monthlyAmount;
    const orderReference = `${type}-${plan}-${uuidv4()}`;
    const orderDate = Math.floor(Date.now() / 1000);

    await orderService.createOrder({
      id: orderReference,
      plan,
      type,
      amount,
      currency: config.billing.currency,
    });

    const payload = wayforpayService.buildCheckoutPayload({
      plan,
      orderReference,
      orderDate,
      dateNext: formatDateNext(plan),
    });

    const checkout = {
      ...payload,
      displayUsd: plan === 'yearly'
        ? config.billing.yearlyUsdDisplay
        : config.billing.monthlyUsdDisplay,
    };

    return res.status(200).json({
      success: true,
      checkout,
      data: checkout,
    });
  } catch (error) {
    logger.error('Billing checkout error', error);
    return next(error);
  }
};

const webhook = async (req, res, next) => {
  try {
    const callback = req.body;
    if (!callback || typeof callback !== 'object') {
      return res.status(400).json({ error: 'JSON body required' });
    }

    const valid = wayforpayService.verifyCallbackSignature(callback, config.wayforpay.secretKey);
    if (!valid) {
      logger.warn('WayForPay webhook signature mismatch');
      return res.status(400).json({ error: 'Invalid merchantSignature' });
    }

    let action;
    try {
      action = wayforpayService.classifyTransactionStatus(callback.transactionStatus);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const { orderReference, recToken } = callback;

    if (action === 'activate') {
      const existing = (await licenseService.findByRecToken(recToken))
        || (await licenseService.findByOrderReference(orderReference));
      let license;
      let extra = {};
      if (existing) {
        license = await licenseService.renewByPayment({
          orderReference,
          recToken,
          ttlSeconds: licenseTtlForPlan(existing.plan),
        });
      } else {
        const { type, plan } = wayforpayService.parsePlanFromOrderReference(orderReference);
        license = await licenseService.createLicense({
          type,
          plan,
          orderReference,
          recToken,
          ttlSeconds: licenseTtlForPlan(plan),
        });
        if (license.type === 'api') {
          extra.apiKey = await licenseService.createApiKey(license.key);
          const issued = await licenseService.validateApiKey(extra.apiKey);
          extra.apiKeyRemainingDays = issued.remainingDays;
          extra.apiKeyExpiresAt = issued.expiresAt;
        }
      }
      await orderService.markOrderPaid(orderReference, license.key, extra);
    } else if (action === 'revoke') {
      await licenseService.revokeByPayment({ orderReference, recToken });
    }
    // ignore: Declined / Expired / in-progress — payment is not a completed sale

    const ack = wayforpayService.acknowledgeWebhook(
      orderReference,
      Math.floor(Date.now() / 1000),
      config.wayforpay.secretKey
    );
    return res.status(200).json(ack);
  } catch (error) {
    logger.error('Billing webhook error', error);
    return next(error);
  }
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
    logger.error('License validate error', error);
    return next(error);
  }
};

const getOrder = async (req, res, next) => {
  try {
    const order = await orderService.getOrder(req.params.orderReference);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    return res.status(200).json({
      success: true,
      data: order,
      licenseKey: order.licenseKey,
      apiKey: order.apiKey || null,
      apiKeyRemainingDays: order.apiKeyRemainingDays || null,
    });
  } catch (error) {
    logger.error('Get order error', error);
    return next(error);
  }
};

const listPlans = (req, res) => {
  res.status(200).json({
    success: true,
    currency: config.billing.currency,
    plans: [
      {
        id: 'monthly',
        type: 'pro',
        amount: config.billing.monthlyAmount,
        usdDisplay: config.billing.monthlyUsdDisplay,
      },
      {
        id: 'yearly',
        type: 'pro',
        amount: config.billing.yearlyAmount,
        usdDisplay: config.billing.yearlyUsdDisplay,
      },
      {
        id: 'api',
        type: 'api',
        amount: config.billing.apiAmount,
        usdDisplay: config.billing.apiUsdDisplay || '19',
      },
    ],
    data: {
      currency: config.billing.currency,
      monthly: {
        amount: config.billing.monthlyAmount,
        usdDisplay: config.billing.monthlyUsdDisplay,
      },
      yearly: {
        amount: config.billing.yearlyAmount,
        usdDisplay: config.billing.yearlyUsdDisplay,
      },
    },
  });
};

module.exports = {
  checkout,
  webhook,
  validateLicense,
  getOrder,
  listPlans,
  getPricing: listPlans,
  createCheckout: checkout,
  wayforpayWebhook: webhook,
  restoreLicense: validateLicense,
  getPaidOrder: getOrder,
};
