export type FeatureDef = {
  type: string;
  label: string;
  description: string;
  issuesApiKey: boolean;
  issuesSendKey: boolean;
};

/** Site products ops can mint in one click. */
export const FEATURE_CATALOG: FeatureDef[] = [
  {
    type: 'api',
    label: 'QA Mailboxes',
    description: 'Disposable QA inboxes + webhooks',
    issuesApiKey: true,
    issuesSendKey: false,
  },
  {
    type: 'grade',
    label: 'Mail Grade',
    description: 'Score raw MIME deliverability',
    issuesApiKey: true,
    issuesSendKey: false,
  },
  {
    type: 'sender',
    label: 'Sender Check',
    description: 'From-domain authentication check',
    issuesApiKey: true,
    issuesSendKey: false,
  },
  {
    type: 'reports',
    label: 'DMARC Reports',
    description: 'Aggregate DMARC XML reader',
    issuesApiKey: true,
    issuesSendKey: false,
  },
  {
    type: 'bounce',
    label: 'Bounce Read',
    description: 'Classify delivery-status reports',
    issuesApiKey: true,
    issuesSendKey: false,
  },
  {
    type: 'complaint',
    label: 'Complaint Read',
    description: 'Parse abuse feedback reports',
    issuesApiKey: true,
    issuesSendKey: false,
  },
  {
    type: 'tls',
    label: 'TLS Reports',
    description: 'SMTP TLS reporting',
    issuesApiKey: true,
    issuesSendKey: false,
  },
  {
    type: 'suite',
    label: 'Deliverability Suite',
    description: 'All deliverability APIs + QA',
    issuesApiKey: true,
    issuesSendKey: false,
  },
  {
    type: 'outbound',
    label: 'Outbound Send',
    description: 'Send portal licence + send key',
    issuesApiKey: false,
    issuesSendKey: true,
  },
  {
    type: 'pro',
    label: 'Pro Inbox',
    description: 'Pro inbox licence',
    issuesApiKey: false,
    issuesSendKey: false,
  },
];
