const redisService = require('./redisService');
const { v4: uuidv4 } = require('uuid');

const ORDER_PREFIX = 'order:';
const ORDER_TTL_SECONDS = 7 * 24 * 60 * 60;
const HANDOFF_PREFIX = 'order_handoff:';
const HANDOFF_TTL_SECONDS = 5 * 60;

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
 * The mark only ever moves forward. Two callbacks for one order can be in flight together, and each
 * awaits Redis, so the older one can be the last to write; letting it lower the mark would make a
 * stale replay look current again. It is written after the callback is applied rather than before,
 * because claiming it up front would turn a transient failure mid-apply into a payment that is
 * never applied at all: WayForPay retries with the same processing date.
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

  const applied = order.lastCallbackProcessingDate;
  if (typeof applied === 'number' && processingDate <= applied) {
    return order;
  }

  order.lastCallbackProcessingDate = processingDate;
  return persist(order);
};

const createHandoffToken = async (orderId, ttlSeconds = HANDOFF_TTL_SECONDS) => {
  const token = uuidv4();
  const key = `${HANDOFF_PREFIX}${token}`;
  await redisService.client.set(key, orderId, 'EX', ttlSeconds);
  return token;
};

const resolveHandoffToken = async (token) => {
  if (!token || typeof token !== 'string') {
    return null;
  }
  const key = `${HANDOFF_PREFIX}${token}`;
  const result = await redisService.client.get(key);
  return result || null;
};

const consumeHandoffToken = async (token) => {
  if (!token || typeof token !== 'string') {
    return null;
  }
  const key = `${HANDOFF_PREFIX}${token}`;
  const result = await redisService.client.get(key);
  if (result) {
    await redisService.client.del(key);
  }
  return result || null;
};

module.exports = {
  createOrder,
  getOrder,
  markOrderPaid,
  markCallbackApplied,
  createHandoffToken,
  resolveHandoffToken,
  consumeHandoffToken,
};
