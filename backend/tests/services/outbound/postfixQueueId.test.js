const { parsePostfixQueueId } = require('../../../services/outbound/postfixQueueId');

describe('parsePostfixQueueId', () => {
  it('parses classic queued-as queue ids', () => {
    expect(parsePostfixQueueId('250 2.0.0 Ok: queued as C95E96B727')).toBe('C95E96B727');
  });

  it('parses long base52 queue ids', () => {
    expect(parsePostfixQueueId('250 2.0.0 Ok: queued as 4jV74M63RlzHxK3')).toBe('4jV74M63RlzHxK3');
  });

  it('returns null for missing or garbage responses', () => {
    expect(parsePostfixQueueId('')).toBeNull();
    expect(parsePostfixQueueId(null)).toBeNull();
    expect(parsePostfixQueueId('250 OK')).toBeNull();
  });
});
