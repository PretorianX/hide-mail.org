const fs = require('fs');
const path = require('path');

const DASHBOARD_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'grafana',
  'hidemail-outbound-dashboard.json'
);

const SERIES = [
  'hidemail_outbound_accepted_total',
  'hidemail_outbound_delivered_total',
  'hidemail_outbound_deferred_total',
  'hidemail_outbound_held_total',
  'hidemail_outbound_bounced_total',
  'hidemail_outbound_rejected_total',
  'hidemail_outbound_suppressions',
  'hidemail_outbound_daily_sent',
  'hidemail_outbound_daily_limit',
  'hidemail_outbound_domain_verified',
  'hidemail_outbound_queued',
];

describe('hidemail-outbound-dashboard.json', () => {
  it('exists with required uid, templates, and §5.8 series references', () => {
    expect(fs.existsSync(DASHBOARD_PATH)).toBe(true);
    const dash = JSON.parse(fs.readFileSync(DASHBOARD_PATH, 'utf8'));
    expect(dash.uid).toBe('hidemail-outbound');
    expect(dash.title).toBe('Hide Mail - Outbound Send');

    const varNames = (dash.templating?.list || []).map((v) => v.name);
    expect(varNames).toEqual(expect.arrayContaining(['datasource', 'account', 'domain']));

    const blob = JSON.stringify(dash);
    for (const series of SERIES) {
      expect(blob).toContain(series);
    }
  });
});
