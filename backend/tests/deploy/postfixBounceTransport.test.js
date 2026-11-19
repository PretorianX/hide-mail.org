const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const TRANSPORT_PATH = path.join(REPO_ROOT, 'deploy/postfix/transport');
const INIT_SCRIPT_PATH = path.join(
  REPO_ROOT,
  'deploy/postfix/docker-init.d/10-bounce-internal-transport.sh'
);
const NEXTHOP = 'bounce_internal:[backend]:2525';

const extractRegexpRules = (contents) => {
  const rules = [];
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const match = trimmed.match(/^(\/.+\/[a-z]*)\s+(\S+)\s*$/i);
    if (!match) {
      throw new Error(`Invalid transport line: ${line}`);
    }
    rules.push({ patternSource: match[1], nexthop: match[2] });
  }
  return rules;
};

const compilePattern = (patternSource) => {
  const match = patternSource.match(/^\/(.+)\/([a-z]*)$/i);
  if (!match) {
    throw new Error(`Not a regexp pattern: ${patternSource}`);
  }
  return new RegExp(match[1], match[2]);
};

describe('postfix bounce transport map', () => {
  it('routes VERP bounce recipients to bounce_internal:[backend]:2525', () => {
    const contents = fs.readFileSync(TRANSPORT_PATH, 'utf8');
    const rules = extractRegexpRules(contents);
    expect(rules.length).toBeGreaterThanOrEqual(2);
    expect(rules.every((r) => r.nexthop === NEXTHOP)).toBe(true);

    const patterns = rules.map((r) => compilePattern(r.patternSource));
    const matchesAny = (addr) => patterns.some((re) => re.test(addr));

    expect(matchesAny('b-479bad37-0df6-4ed8-9a93-79b6cfb445bb@hm-bounce.ecabinet.tax')).toBe(
      true
    );
    expect(matchesAny('b-abc@rp.hide-mail.org')).toBe(true);
    expect(matchesAny('noreply@hide-mail.org')).toBe(false);
    expect(matchesAny('user@gmail.com')).toBe(false);
  });

  it('registers a TLS-off bounce_internal master.cf transport', () => {
    const script = fs.readFileSync(INIT_SCRIPT_PATH, 'utf8');
    expect(script).toContain('bounce_internal');
    expect(script).toContain('smtp_tls_security_level=none');
    expect(script).toContain('smtp_tls_wrappermode=no');
  });

  it('wires transport_maps into prod and dev compose', () => {
    for (const file of ['docker-compose.yml', 'docker-compose-dev.yml']) {
      const yaml = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
      expect(yaml).toContain('POSTFIX_transport_maps=regexp:/etc/postfix/transport');
      expect(yaml).toContain('./deploy/postfix/transport:/etc/postfix/transport:ro');
      expect(yaml).toContain('./deploy/postfix/docker-init.d:/docker-init.d:ro');
    }
  });
});
