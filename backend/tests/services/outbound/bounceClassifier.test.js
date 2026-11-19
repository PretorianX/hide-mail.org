const {
  classifyDeliveryResponse,
  shouldSuppress,
} = require('../../../services/outbound/bounceClassifier');

describe('outbound bounceClassifier', () => {
  it('suppresses 5.1.1 unknown_recipient hard bounces', () => {
    const result = classifyDeliveryResponse('550 5.1.1 User unknown');
    expect(result).toMatchObject({
      class: 'hard',
      category: 'unknown_recipient',
      shouldSuppress: true,
    });
    expect(shouldSuppress(result)).toBe(true);
  });

  it('suppresses 5.7.1 policy hard bounces (5xx)', () => {
    const result = classifyDeliveryResponse('550 5.7.1 Delivery not authorized');
    expect(result).toMatchObject({
      class: 'hard',
      category: 'policy',
      shouldSuppress: true,
    });
  });

  it('suppresses 5.2.2 mailbox full hard bounces (5xx)', () => {
    const result = classifyDeliveryResponse('550 5.2.2 Mailbox full');
    expect(result).toMatchObject({
      class: 'hard',
      category: 'mailbox',
      shouldSuppress: true,
    });
  });

  it('suppresses 550 5.0.0 unrouteable address hard bounces (5xx)', () => {
    const result = classifyDeliveryResponse('550 5.0.0 550 Unrouteable address');
    expect(result).toMatchObject({
      class: 'hard',
      category: 'other',
      shouldSuppress: true,
    });
  });

  it('never suppresses Domain held responses', () => {
    const result = classifyDeliveryResponse('451 Domain held 5.1.1');
    expect(result).toEqual({ class: 'soft', category: 'held', shouldSuppress: false });
  });

  it('falls back to bare SMTP code when no enhanced status is present', () => {
    expect(classifyDeliveryResponse('550 No such user')).toMatchObject({
      class: 'hard',
      category: 'other',
      shouldSuppress: true,
    });
    expect(classifyDeliveryResponse('450 Try later')).toMatchObject({
      class: 'soft',
      category: 'other',
      shouldSuppress: false,
    });
  });
});
