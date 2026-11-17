export type DomainState = 'pending' | 'verified' | 'broken';

export type DnsNameserverResult = {
  nameserver: string;
  value: string[] | string | null;
  matched?: boolean;
  reason?: string;
};

export type DomainRecord = {
  id?: string;
  purpose?: string;
  type?: string;
  host?: string;
  value?: string | null;
  expected?: string | null;
  required?: boolean;
  status?: 'pass' | 'fail' | 'no_answer' | string;
  reason?: string | null;
  nameserverAnswers?: DnsNameserverResult[];
  nameservers?: DnsNameserverResult[];
};

export type Domain = {
  domain: string;
  state: DomainState;
  suspended: boolean;
  dailyLimit: number | null;
  selector?: string;
  records?: DomainRecord[];
  lastCheckedAt?: number | null;
};

export type DomainSummary = {
  domain: string;
  state: DomainState;
  suspended: boolean;
  dailyLimit: number | null;
  sentToday: number;
  delivered: number;
  deferred: number;
  bounced: number;
  delivered24h: number;
  deferred24h: number;
  bounced24h: number;
  delivered7d: number;
  deferred7d: number;
  bounced7d: number;
};

export type AccountSummary = {
  success: boolean;
  ratePerMinute: number;
  domains: DomainSummary[];
};

export type ActivityMessage = {
  id: string;
  accountId: string;
  domain: string;
  recipient: string;
  reference: string | null;
  subject?: string | null;
  from?: { name: string | null; email: string } | null;
  envelopeFrom?: string | null;
  clientIp?: string | null;
  sendKeyName?: string | null;
  status: string;
  createdAt: number;
  lastEventAt: number | null;
  lastResponse: string | null;
};

export type Suppression = {
  email: string;
  reason: string;
  addedAt?: number;
  added_at?: number;
};

export type SendKeyMeta = {
  name: string;
  createdAt: number;
  maskedKey: string;
};

export type ScrapeConfig = {
  job_name: string;
  metrics_path: string;
  scheme: string;
  static_configs: Array<{ targets: string[] }>;
  authorization?: { type: string; credentials: string };
  bearerTokenHeader?: string;
};
