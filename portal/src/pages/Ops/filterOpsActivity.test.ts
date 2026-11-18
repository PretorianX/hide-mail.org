import { filterOpsActivity } from './filterOpsActivity';
import type { AdminActivityMessage } from '@/api/admin';

const base = (overrides: Partial<AdminActivityMessage>): AdminActivityMessage => ({
  id: 'm1',
  accountId: 'a1',
  accountLabel: 'acme',
  domain: 'mail.example.com',
  recipient: 'to@example.org',
  reference: null,
  subject: 'Invoice',
  from: { name: 'Billing', email: 'billing@mail.example.com' },
  envelopeFrom: 'b-m1@hm-bounce.mail.example.com',
  clientIp: '203.0.113.9',
  sendKeyName: 'prod',
  status: 'delivered',
  createdAt: 1,
  lastEventAt: 2,
  lastResponse: 'accepted by postfix',
  ...overrides,
});

describe('filterOpsActivity', () => {
  const messages = [
    base({ id: 'm1', accountLabel: 'acme', status: 'delivered', domain: 'a.example.com' }),
    base({
      id: 'm2',
      accountLabel: 'beta',
      status: 'bounced',
      domain: 'b.example.com',
      subject: 'Welcome',
      recipient: 'user@other.test',
      sendKeyName: 'ci',
    }),
  ];

  it('returns all when filters are empty', () => {
    expect(
      filterOpsActivity(messages, { query: '', status: 'all', domain: 'all', account: 'all' }),
    ).toEqual(messages);
  });

  it('filters by search, status, domain, and account label', () => {
    expect(
      filterOpsActivity(messages, {
        query: 'welcome',
        status: 'all',
        domain: 'all',
        account: 'all',
      }).map((m) => m.id),
    ).toEqual(['m2']);
    expect(
      filterOpsActivity(messages, {
        query: '',
        status: 'bounced',
        domain: 'all',
        account: 'all',
      }).map((m) => m.id),
    ).toEqual(['m2']);
    expect(
      filterOpsActivity(messages, {
        query: '',
        status: 'all',
        domain: 'a.example.com',
        account: 'all',
      }).map((m) => m.id),
    ).toEqual(['m1']);
    expect(
      filterOpsActivity(messages, {
        query: '',
        status: 'all',
        domain: 'all',
        account: 'beta',
      }).map((m) => m.id),
    ).toEqual(['m2']);
    expect(
      filterOpsActivity(messages, {
        query: '203.0.113',
        status: 'all',
        domain: 'all',
        account: 'all',
      }).map((m) => m.id),
    ).toEqual(['m1', 'm2']);
  });
});
