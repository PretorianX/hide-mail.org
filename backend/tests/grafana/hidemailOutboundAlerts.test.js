const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ALERTS_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'grafana',
  'hidemail-outbound-alerts.yml'
);

const REQUIRED_ALERTS = [
  'OutboundBounceRateHigh',
  'OutboundDeferralRateHigh',
  'OutboundVolumeSpike',
  'OutboundSuppressionSpike',
  'OutboundDomainBroken',
  'OutboundOperatorDnsFailing',
  'OutboundQueueDepthHigh',
  'OutboundEventConsumerLag',
  'OutboundCapNearLimit',
];

describe('hidemail-outbound-alerts.yml', () => {
  it('documents thresholds and includes every required alert rule', () => {
    expect(fs.existsSync(ALERTS_PATH)).toBe(true);
    const raw = fs.readFileSync(ALERTS_PATH, 'utf8');
    expect(raw).toMatch(/bounce_rate:\s*0\.05/);
    expect(raw).toMatch(/deferral_rate:\s*0\.20/);
    expect(raw).toContain('0.05');
    expect(raw).toContain('0.20');

    const doc = yaml.load(raw);
    expect(doc.groups).toBeTruthy();
    const group = doc.groups.find((g) => g.name === 'hidemail-outbound');
    expect(group).toBeTruthy();
    const names = group.rules.map((r) => r.alert);
    for (const name of REQUIRED_ALERTS) {
      expect(names).toContain(name);
    }

    const bounce = group.rules.find((r) => r.alert === 'OutboundBounceRateHigh');
    expect(bounce.expr).toContain('0.05');
    const deferral = group.rules.find((r) => r.alert === 'OutboundDeferralRateHigh');
    expect(deferral.expr).toContain('0.20');
  });
});
