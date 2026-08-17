process.env.VALID_DOMAINS = process.env.VALID_DOMAINS || 'hide-mail.org';

const orderService = require('../../services/orderService');
const redisService = require('../../services/redisService');

describe('orderService', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('creates a pending order for a billed plan', async () => {
    const order = await orderService.createOrder({
      id: 'pro-yearly-1',
      plan: 'yearly',
      type: 'pro',
      amount: 1079,
      currency: 'UAH',
    });

    expect(order.id).toBe('pro-yearly-1');
    expect(order.status).toBe('pending');
    expect(order.plan).toBe('yearly');
    expect(order.amount).toBe(1079);
    expect(order.currency).toBe('UAH');
  });

  it('loads an order by id', async () => {
    const created = await orderService.createOrder({
      id: 'pro-monthly-1',
      plan: 'monthly',
      type: 'pro',
      amount: 149,
      currency: 'UAH',
    });

    const loaded = await orderService.getOrder(created.id);
    expect(loaded.plan).toBe('monthly');
    expect(loaded.status).toBe('pending');
  });

  it('marks an order paid and stores the license key', async () => {
    const created = await orderService.createOrder({
      id: 'pro-monthly-2',
      plan: 'monthly',
      type: 'pro',
      amount: 149,
      currency: 'UAH',
    });

    const paid = await orderService.markOrderPaid(created.id, 'HM-TEST-KEY1-KEY2-KEY3');
    expect(paid.status).toBe('paid');
    expect(paid.licenseKey).toBe('HM-TEST-KEY1-KEY2-KEY3');
  });
});
