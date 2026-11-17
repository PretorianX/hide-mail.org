import { filterActivityMessages } from './filterActivityMessages';
import type { ActivityMessage } from '@/api/types';

const base = (overrides: Partial<ActivityMessage>): ActivityMessage => ({
  id: 'm1',
  accountId: 'a1',
  domain: 'mail.example.com',
  recipient: 'to@example.org',
  reference: null,
  subject: null,
  from: null,
  envelopeFrom: null,
  clientIp: null,
  sendKeyName: null,
  status: 'delivered',
  createdAt: 1,
  lastEventAt: 2,
  lastResponse: 'accepted by postfix',
  ...overrides,
});

describe('filterActivityMessages', () => {
  const messages = [
    base({
      id: 'm1',
      subject: 'Invoice 42',
      recipient: 'billing@acme.test',
      from: { name: 'Finance', email: 'finance@mail.example.com' },
      envelopeFrom: 'b-m1@hm-bounce.mail.example.com',
      clientIp: '203.0.113.9',
      sendKeyName: 'prod',
      reference: 'inv-42',
    }),
    base({
      id: 'm2',
      subject: 'Welcome',
      recipient: 'user@other.test',
      status: 'bounced',
      lastResponse: '550 5.1.1',
      sendKeyName: 'ci',
    }),
  ];

  it('returns all messages when query is empty or whitespace', () => {
    expect(filterActivityMessages(messages, '')).toEqual(messages);
    expect(filterActivityMessages(messages, '   ')).toEqual(messages);
  });

  it('matches subject, recipient, from, envelope, ip, key, status, and response', () => {
    expect(filterActivityMessages(messages, 'invoice').map((m) => m.id)).toEqual(['m1']);
    expect(filterActivityMessages(messages, 'other.test').map((m) => m.id)).toEqual(['m2']);
    expect(filterActivityMessages(messages, 'Finance').map((m) => m.id)).toEqual(['m1']);
    expect(filterActivityMessages(messages, 'hm-bounce').map((m) => m.id)).toEqual(['m1']);
    expect(filterActivityMessages(messages, '203.0.113').map((m) => m.id)).toEqual(['m1']);
    expect(filterActivityMessages(messages, 'ci').map((m) => m.id)).toEqual(['m2']);
    expect(filterActivityMessages(messages, 'bounced').map((m) => m.id)).toEqual(['m2']);
    expect(filterActivityMessages(messages, '5.1.1').map((m) => m.id)).toEqual(['m2']);
    expect(filterActivityMessages(messages, 'inv-42').map((m) => m.id)).toEqual(['m1']);
  });

  it('is case-insensitive', () => {
    expect(filterActivityMessages(messages, 'WELCOME').map((m) => m.id)).toEqual(['m2']);
  });
});
