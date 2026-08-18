const redisService = require('./redisService');

const ORDER_PREFIX = 'order:';
const ORDER_TTL_SECONDS = 7 * 24 * 60 * 60;

const persist = async (order) => {
  await redisService.client.set(`${ORDER_PREFIX}${order.id}`, JSON.stringify(order));
  await redisService.client.expire(`${ORDER_PREFIX}${order.id}`, ORDER_TTL_SECONDS);
  return order;
};

const createOrder = async ({ id, plan, type, amount, currency }) => {
  const order = {
    id,
    plan,
    type,
    amount,
    currency,
    status: 'pending',
    licenseKey: null,
    createdAt: Date.now(),
  };
  return persist(order);
};

const getOrder = async (orderId) => {
  if (!orderId) {
    return null;
  }
  const raw = await redisService.client.get(`${ORDER_PREFIX}${orderId}`);
  return raw ? JSON.parse(raw) : null;
};

const markOrderPaid = async (orderId, licenseKey, extra = {}) => {
  let order = await getOrder(orderId);
  if (!order) {
    order = {
      id: orderId,
      status: 'pending',
      createdAt: Date.now(),
    };
  }
  order.status = 'paid';
  order.licenseKey = licenseKey;
  order.paidAt = Date.now();
  if (extra.apiKey) {
    order.apiKey = extra.apiKey;
    order.apiKeyRemainingDays = extra.apiKeyRemainingDays;
    order.apiKeyExpiresAt = extra.apiKeyExpiresAt;
  }
  return persist(order);
};

/**
 * Remembers which callback the order last acted on. WayForPay replays a callback until it is
 * acknowledged, so a queue of replays can outlive the status it describes, and the transaction's
 * own processing date is the only thing that orders them.
 *
 * An order that is not there is left alone rather than created: a callback can name an order that
 * checkout never stored or that has since expired, and inventing one would leave a pending order
 * behind for the metrics collector to count.
 */
const markCallbackApplied = async (orderId, processingDate) => {
  const order = await getOrder(orderId);
  if (!order) {
    return null;
  }
  order.lastCallbackProcessingDate = processingDate;
  return persist(order);
};

module.exports = {
  createOrder,
  getOrder,
  markOrderPaid,
  markCallbackApplied,
};
