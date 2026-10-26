/**
 * Read the published MX, SPF, and DMARC records. Includes and redirects are not
 * followed: the report describes the record at this name.
 */

const { SenderCheckError } = require('./errors');

const flattenTxt = (records) => {
  if (!Array.isArray(records)) {
    throw new SenderCheckError('DNS_UNAVAILABLE', 'The DNS lookup did not answer. Try again.');
  }
  return records.map((chunks) => {
    if (!Array.isArray(chunks) || chunks.some((part) => typeof part !== 'string')) {
      throw new SenderCheckError('DNS_UNAVAILABLE', 'The DNS lookup did not answer. Try again.');
    }
    return chunks.join('');
  });
};

const recordOf = (id, name, status, detail, record, parsed = null) => ({
  id,
  name,
  status,
  detail,
  record: record || null,
  ...(parsed ? { parsed } : {}),
});

const isNullExchange = (exchange) => {
  const host = String(exchange || '').trim();
  return host === '' || host === '.';
};

const detectMailProvider = (hosts) => {
  const joined = hosts.join(' ').toLowerCase();
  if (!joined) return null;
  if (/google\.com|googlemail\.com/.test(joined)) return 'Google Workspace';
  if (/outlook\.com/.test(joined)) return 'Microsoft 365';
  if (/protonmail\.ch|pm\.me/.test(joined)) return 'Proton Mail';
  if (/cloudflare\.net/.test(joined)) return 'Cloudflare Email Routing';
  if (/messagingengine\.com/.test(joined)) return 'Fastmail';
  if (/amazonses\.com|awsapps\.com/.test(joined)) return 'Amazon SES';
  if (/pphosted\.com/.test(joined)) return 'Proofpoint';
  if (/mimecast\.com/.test(joined)) return 'Mimecast';
  if (/zoho\.(com|eu|in)/.test(joined)) return 'Zoho Mail';
  if (/registrar-servers\.com|privateemail\.com/.test(joined)) return 'Namecheap Private Email';
  if (/yahoodns\.net/.test(joined)) return 'Yahoo Mail';
  if (/icloud\.com/.test(joined)) return 'Apple iCloud Mail';
  return 'Custom / Self-hosted';
};

const interpretMx = (records) => {
  if (!Array.isArray(records) || records.length === 0) {
    return recordOf('mx', 'MX', 'warn', 'No MX record is published.', null, {
      exchangeCount: 0,
      nullMx: false,
      provider: null,
      exchanges: [],
    });
  }
  if (records.length === 1 && isNullExchange(records[0].exchange)) {
    return recordOf('mx', 'MX', 'warn', 'This domain publishes a null MX, so it accepts no mail.', '.', {
      exchangeCount: 0,
      nullMx: true,
      provider: 'Null MX (RFC 7505 — no inbound mail)',
      exchanges: [{ priority: Number(records[0].priority || 0), exchange: '.' }],
    });
  }
  const sorted = records
    .slice()
    .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0))
    .map((row) => ({
      priority: Number(row.priority || 0),
      exchange: String(row.exchange || '').replace(/\.$/, ''),
    }))
    .filter((row) => row.exchange && row.exchange !== '.');
  const hosts = sorted.map((row) => row.exchange);
  if (hosts.length === 0) {
    return recordOf('mx', 'MX', 'warn', 'No MX record is published.', null, {
      exchangeCount: 0,
      nullMx: false,
      provider: null,
      exchanges: [],
    });
  }
  const shown = hosts.slice(0, 3).join(', ');
  const extra = hosts.length > 3 ? ` and ${hosts.length - 3} more` : '';
  return recordOf('mx', 'MX', 'pass', `Mail hosts are published: ${shown}${extra}.`, shown, {
    exchangeCount: hosts.length,
    nullMx: false,
    provider: detectMailProvider(hosts),
    exchanges: sorted,
  });
};

const spfTokens = (record) => record.trim().split(/\s+/).slice(1);

const parseSpfMechanism = (rawToken) => {
  const qualMatch = rawToken.match(/^([+\-~?])?(.*)$/);
  const qualifier = qualMatch[1] || '+';
  const body = qualMatch[2] || rawToken;
  const lower = body.toLowerCase();

  const qualLabel = {
    '+': 'Pass',
    '-': 'HardFail (Reject)',
    '~': 'SoftFail (Mark)',
    '?': 'Neutral',
  }[qualifier] || 'Pass';

  if (lower === 'all') {
    return {
      token: rawToken,
      qualifier,
      qualifierLabel: qualLabel,
      type: 'all',
      value: 'all',
      lookups: 0,
      description: qualifier === '-'
        ? 'Rejects all other unlisted sending servers (-all).'
        : qualifier === '~'
          ? 'Soft-fails unlisted sending servers (~all).'
          : qualifier === '?'
            ? 'Leaves unlisted servers neutral (?all).'
            : 'Allows any server on the internet to send (+all).',
    };
  }

  const colonIdx = body.indexOf(':');
  const eqIdx = body.indexOf('=');
  if (eqIdx !== -1 && (colonIdx === -1 || eqIdx < colonIdx)) {
    const modName = body.slice(0, eqIdx).toLowerCase();
    const modVal = body.slice(eqIdx + 1);
    const lookups = modName === 'redirect' ? 1 : 0;
    return {
      token: rawToken,
      qualifier: '',
      qualifierLabel: 'Modifier',
      type: modName,
      value: modVal,
      lookups,
      description: modName === 'redirect'
        ? `Redirects SPF evaluation to ${modVal} (1 DNS lookup).`
        : `SPF modifier ${modName}=${modVal}.`,
    };
  }

  const mechType = (colonIdx !== -1 ? body.slice(0, colonIdx) : body.split('/')[0]).toLowerCase();
  const mechVal = colonIdx !== -1 ? body.slice(colonIdx + 1) : (body.includes('/') ? body.slice(mechType.length) : '');
  const lookupTypes = new Set(['include', 'a', 'mx', 'ptr', 'exists']);
  const lookups = lookupTypes.has(mechType) ? 1 : 0;

  const descriptions = {
    include: `Authorizes senders matching ${mechVal}'s SPF record (1 DNS lookup).`,
    ip4: `Authorizes IPv4 address or CIDR range ${mechVal} (0 DNS lookups).`,
    ip6: `Authorizes IPv6 address or CIDR range ${mechVal} (0 DNS lookups).`,
    a: `Authorizes the A/AAAA records of ${mechVal || 'this domain'} (1 DNS lookup).`,
    mx: `Authorizes the MX servers of ${mechVal || 'this domain'} (1 DNS lookup).`,
    ptr: `Uses reverse DNS PTR matching (${mechVal || 'domain'}) — deprecated by RFC 7208 (1 DNS lookup).`,
    exists: `Checks A record existence for macro ${mechVal} (1 DNS lookup).`,
  };

  return {
    token: rawToken,
    qualifier,
    qualifierLabel: qualLabel,
    type: mechType,
    value: mechVal || null,
    lookups,
    description: descriptions[mechType] || `Mechanism ${rawToken}.`,
  };
};

const interpretSpf = (txtRecords) => {
  const spf = flattenTxt(txtRecords)
    .map((text) => text.trim())
    .filter((text) => text.toLowerCase().startsWith('v=spf1'));

  if (spf.length === 0) {
    return recordOf('spf', 'SPF', 'fail', 'No SPF record is published.', null, {
      recordCount: 0,
      allQualifier: null,
      dnsLookupCount: 0,
      totalDnsLookups: 0,
      dnsLookupLimit: 10,
      overLookupLimit: false,
      mechanisms: [],
      includeTree: [],
    });
  }
  if (spf.length > 1) {
    return recordOf(
      'spf',
      'SPF',
      'fail',
      'More than one SPF record is published, which receivers treat as an error.',
      spf[0],
      {
        recordCount: spf.length,
        allQualifier: null,
        dnsLookupCount: 0,
        totalDnsLookups: 0,
        dnsLookupLimit: 10,
        overLookupLimit: false,
        mechanisms: [],
        includeTree: [],
      }
    );
  }

  const published = spf[0];
  const tokens = spfTokens(published);
  const mechanisms = tokens.map(parseSpfMechanism);
  const dnsLookupCount = mechanisms.reduce((sum, item) => sum + item.lookups, 0);
  const all = tokens.find((token) => /^(?:\+|-|~|\?)?all$/i.test(token));
  const qualifier = all ? all.toLowerCase() : '';
  const normalizedAll = qualifier === 'all' ? '+all' : (qualifier || null);

  const parsed = {
    recordCount: 1,
    allQualifier: normalizedAll,
    dnsLookupCount,
    totalDnsLookups: dnsLookupCount,
    dnsLookupLimit: 10,
    overLookupLimit: dnsLookupCount > 10,
    mechanisms,
    includeTree: [],
  };

  if (qualifier === 'all' || qualifier === '+all') {
    return recordOf('spf', 'SPF', 'fail', 'SPF ends in +all, so any server may send as this domain.', published, parsed);
  }
  if (qualifier === '-all') {
    return recordOf('spf', 'SPF', 'pass', 'SPF names the servers that may send and rejects the rest.', published, parsed);
  }
  if (qualifier === '~all') {
    return recordOf('spf', 'SPF', 'pass', 'SPF names the servers that may send and soft-fails the rest.', published, parsed);
  }
  if (qualifier === '?all') {
    return recordOf('spf', 'SPF', 'warn', 'SPF ends in ?all, so it does not tell receivers what to do.', published, parsed);
  }
  return recordOf('spf', 'SPF', 'warn', 'SPF does not end in an all mechanism.', published, parsed);
};

const dmarcTags = (record) => {
  const tags = new Map();
  record.split(';').forEach((part) => {
    const piece = part.trim();
    if (!piece) {
      return;
    }
    const splitAt = piece.indexOf('=');
    if (splitAt === -1) {
      return;
    }
    tags.set(piece.slice(0, splitAt).trim().toLowerCase(), piece.slice(splitAt + 1).trim());
  });
  return tags;
};

const DMARC_TAG_INFO = {
  v: { label: 'Version', explain: (val) => `Protocol version (${val}).` },
  p: {
    label: 'Domain Policy',
    explain: (val) => {
      const v = val.toLowerCase();
      if (v === 'reject') return 'Enforced: receivers reject unaligned messages.';
      if (v === 'quarantine') return 'Enforced: receivers quarantine (spam-folder) unaligned messages.';
      if (v === 'none') return 'Monitor-only: receivers deliver unaligned mail and only send reports.';
      return `Policy value ${val}.`;
    },
  },
  sp: {
    label: 'Subdomain Policy',
    explain: (val) => `Policy applied to subdomains (${val.toLowerCase()}).`,
  },
  pct: {
    label: 'Sampling Percentage',
    explain: (val) => `${val}% of mail is subject to the DMARC policy.`,
  },
  rua: {
    label: 'Aggregate Reports (rua)',
    explain: (val) => `Daily XML aggregate reports sent to ${val}.`,
  },
  ruf: {
    label: 'Forensic Reports (ruf)',
    explain: (val) => `Per-message failure reports sent to ${val}.`,
  },
  adkim: {
    label: 'DKIM Alignment',
    explain: (val) => (val.toLowerCase() === 's' ? 'Strict DKIM organizational domain alignment.' : 'Relaxed DKIM alignment (subdomains allowed).'),
  },
  aspf: {
    label: 'SPF Alignment',
    explain: (val) => (val.toLowerCase() === 's' ? 'Strict SPF domain alignment.' : 'Relaxed SPF alignment (subdomains allowed).'),
  },
  fo: {
    label: 'Failure Reporting Options',
    explain: (val) => `Forensic trigger mode (${val}).`,
  },
  ri: {
    label: 'Report Interval',
    explain: (val) => `Requested aggregate reporting interval (${val} seconds).`,
  },
};

const interpretDmarc = (txtRecords) => {
  const dmarc = flattenTxt(txtRecords)
    .map((text) => text.trim())
    .filter((text) => text.toLowerCase().startsWith('v=dmarc1'));

  if (dmarc.length === 0) {
    return recordOf('dmarc', 'DMARC', 'fail', 'No DMARC record is published.', null, {
      recordCount: 0,
      policy: null,
      subdomainPolicy: null,
      pct: null,
      adkim: 'r',
      aspf: 'r',
      rua: [],
      ruf: [],
      tags: [],
    });
  }
  if (dmarc.length > 1) {
    return recordOf('dmarc', 'DMARC', 'fail', 'More than one DMARC record is published.', dmarc[0], {
      recordCount: dmarc.length,
      policy: null,
      subdomainPolicy: null,
      pct: null,
      adkim: 'r',
      aspf: 'r',
      rua: [],
      ruf: [],
      tags: [],
    });
  }

  const published = dmarc[0];
  const rawTags = dmarcTags(published);
  const policy = (rawTags.get('p') || '').toLowerCase() || null;
  const subdomainPolicy = (rawTags.get('sp') || '').toLowerCase() || policy;
  const pctRaw = rawTags.get('pct');
  const pct = pctRaw !== undefined && /^\d+$/.test(pctRaw) ? Number(pctRaw) : 100;
  const adkim = (rawTags.get('adkim') || 'r').toLowerCase();
  const aspf = (rawTags.get('aspf') || 'r').toLowerCase();
  const rua = (rawTags.get('rua') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ruf = (rawTags.get('ruf') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const tags = [...rawTags.entries()].map(([tag, value]) => {
    const info = DMARC_TAG_INFO[tag];
    return {
      tag,
      value,
      label: info ? info.label : tag.toUpperCase(),
      explanation: info ? info.explain(value) : `Tag ${tag}=${value}.`,
    };
  });

  const parsed = {
    recordCount: 1,
    policy,
    subdomainPolicy,
    pct,
    adkim,
    aspf,
    rua,
    ruf,
    tags,
  };

  if (policy === 'reject') {
    return recordOf('dmarc', 'DMARC', 'pass', 'DMARC asks receivers to reject mail that fails alignment.', published, parsed);
  }
  if (policy === 'quarantine') {
    return recordOf('dmarc', 'DMARC', 'pass', 'DMARC asks receivers to quarantine mail that fails alignment.', published, parsed);
  }
  if (policy === 'none') {
    return recordOf('dmarc', 'DMARC', 'warn', 'DMARC is published with p=none, so receivers are asked not to enforce it.', published, parsed);
  }
  return recordOf('dmarc', 'DMARC', 'fail', 'DMARC has no usable policy.', published, parsed);
};

const COMMON_DKIM_SELECTORS = [
  'default',
  'google',
  's1',
  's2',
  'k1',
  'selector1',
  'selector2',
  'mail',
];

const estimateRsaBitsFromBase64 = (base64Key) => {
  const clean = String(base64Key || '').replace(/\s+/g, '');
  if (!clean) return 0;
  try {
    const der = Buffer.from(clean, 'base64');
    const byteLen = der.length;
    if (byteLen === 0) return 0;
    if (byteLen >= 520) return 4096;
    if (byteLen >= 390) return 3072;
    if (byteLen >= 260) return 2048;
    if (byteLen >= 135) return 1024;
    if (byteLen >= 70) return 512;
    return byteLen * 8;
  } catch {
    return 0;
  }
};

const interpretDkimSelector = (selector, domain, txtRecords) => {
  const fqdn = `${selector}._domainkey.${domain}`;
  const flattened = flattenTxt(txtRecords)
    .map((text) => text.trim())
    .filter((text) => text.length > 0);
  const dkimCandidates = flattened.filter(
    (text) => /v\s*=\s*dkim1/i.test(text) || /(?:^|;)\s*p\s*=/i.test(text)
  );

  if (dkimCandidates.length === 0) {
    return {
      selector,
      fqdn,
      status: 'missing',
      keyType: null,
      keyBits: null,
      revoked: false,
      strictMode: false,
      testing: false,
      detail: `No DKIM public key published at ${fqdn}.`,
      record: null,
    };
  }

  const published = dkimCandidates[0];
  const tags = dmarcTags(published);
  const version = tags.get('v') || 'DKIM1';
  const keyType = (tags.get('k') || 'rsa').toLowerCase();
  const pubKey = (tags.get('p') ?? '').replace(/\s+/g, '');
  const flags = (tags.get('t') || '')
    .split(':')
    .map((f) => f.trim().toLowerCase())
    .filter(Boolean);
  const testing = flags.includes('y');
  const strictMode = flags.includes('s');

  if (!pubKey) {
    return {
      selector,
      fqdn,
      version,
      status: 'fail',
      keyType,
      keyBits: 0,
      revoked: true,
      strictMode,
      testing,
      detail: `DKIM selector ${selector} has an empty p= tag (key is revoked).`,
      record: published,
    };
  }

  if (keyType === 'ed25519') {
    return {
      selector,
      fqdn,
      version,
      status: 'pass',
      keyType: 'ed25519',
      keyBits: 256,
      revoked: false,
      strictMode,
      testing,
      detail: `Ed25519 (256-bit) public key published for selector ${selector}.`,
      record: published,
    };
  }

  const keyBits = estimateRsaBitsFromBase64(pubKey);
  if (keyBits >= 2048) {
    return {
      selector,
      fqdn,
      version,
      status: 'pass',
      keyType,
      keyBits,
      revoked: false,
      strictMode,
      testing,
      detail: `RSA ~${keyBits}-bit public key published for selector ${selector}.`,
      record: published,
    };
  }
  if (keyBits >= 1024) {
    return {
      selector,
      fqdn,
      version,
      status: 'warn',
      keyType,
      keyBits,
      revoked: false,
      strictMode,
      testing,
      detail: `RSA ${keyBits}-bit key on selector ${selector} is weak; upgrade to 2048-bit RSA.`,
      record: published,
    };
  }
  return {
    selector,
    fqdn,
    version,
    status: 'fail',
    keyType,
    keyBits,
    revoked: false,
    strictMode,
    testing,
    detail: `RSA ${keyBits}-bit key on selector ${selector} is below the 1024-bit minimum.`,
    record: published,
  };
};

const interpretBimi = (domain, txtRecords) => {
  const fqdn = `default._bimi.${domain}`;
  const bimi = flattenTxt(txtRecords)
    .map((text) => text.trim())
    .filter((text) => text.toLowerCase().startsWith('v=bimi1'));

  if (bimi.length === 0) {
    return recordOf('bimi', 'BIMI', 'missing', `No BIMI record published at ${fqdn}.`, null, {
      fqdn,
      version: null,
      logoUrl: null,
      authorityUrl: null,
    });
  }

  const published = bimi[0];
  const tags = dmarcTags(published);
  const version = tags.get('v') || 'BIMI1';
  const logoUrl = tags.get('l') || null;
  const authorityUrl = tags.get('a') || null;
  const parsed = { fqdn, version, logoUrl, authorityUrl };

  if (!logoUrl) {
    return recordOf('bimi', 'BIMI', 'warn', 'BIMI record is present without an l= SVG logo URL.', published, parsed);
  }
  return recordOf(
    'bimi',
    'BIMI',
    'pass',
    authorityUrl
      ? 'BIMI brand logo and VMC authority certificate URL are published.'
      : 'BIMI brand logo URL is published (no VMC certificate URL).',
    published,
    parsed
  );
};

const interpretMtaSts = (domain, txtRecords) => {
  const fqdn = `_mta-sts.${domain}`;
  const sts = flattenTxt(txtRecords)
    .map((text) => text.trim())
    .filter((text) => text.toLowerCase().startsWith('v=stsv1'));

  if (sts.length === 0) {
    return recordOf('mta_sts', 'MTA-STS', 'missing', `No MTA-STS TXT record published at ${fqdn}.`, null, {
      fqdn,
      version: null,
      policyId: null,
    });
  }

  const published = sts[0];
  const tags = dmarcTags(published);
  const version = tags.get('v') || 'STSv1';
  const policyId = tags.get('id') || null;
  const parsed = { fqdn, version, policyId };

  if (!policyId) {
    return recordOf('mta_sts', 'MTA-STS', 'warn', 'MTA-STS record is missing an id= policy version tag.', published, parsed);
  }
  return recordOf('mta_sts', 'MTA-STS', 'pass', `MTA-STS TXT policy published (id=${policyId}).`, published, parsed);
};

const interpretTlsRpt = (domain, txtRecords) => {
  const fqdn = `_smtp._tls.${domain}`;
  const rpt = flattenTxt(txtRecords)
    .map((text) => text.trim())
    .filter((text) => text.toLowerCase().startsWith('v=tlsrptv1'));

  if (rpt.length === 0) {
    return recordOf('tls_rpt', 'TLS-RPT', 'missing', `No SMTP TLS Reporting record published at ${fqdn}.`, null, {
      fqdn,
      version: null,
      rua: [],
    });
  }

  const published = rpt[0];
  const tags = dmarcTags(published);
  const version = tags.get('v') || 'TLSRPTv1';
  const rua = (tags.get('rua') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const parsed = { fqdn, version, rua };

  if (rua.length === 0) {
    return recordOf('tls_rpt', 'TLS-RPT', 'warn', 'TLS-RPT record is missing a rua= reporting URI.', published, parsed);
  }
  return recordOf('tls_rpt', 'TLS-RPT', 'pass', `SMTP TLS Reporting enabled (${rua.join(', ')}).`, published, parsed);
};

const verdictFor = (records) => {
  if (records.some((record) => record.status === 'fail')) {
    return 'Blocked';
  }
  if (records.some((record) => record.status === 'warn')) {
    return 'Gaps';
  }
  return 'Ready';
};

const summaryFor = (domain, verdict, domainMissing) => {
  if (domainMissing) {
    return `${domain} is not in DNS.`;
  }
  if (verdict === 'Ready') {
    return `Receivers can enforce a sender policy for ${domain}.`;
  }
  if (verdict === 'Gaps') {
    return `A sender policy is published for ${domain}, with gaps receivers will not fully enforce.`;
  }
  return `Receivers cannot enforce a sender policy for ${domain}.`;
};

const buildRecommendations = (domain, records, extras = {}) => {
  const recommendations = [];
  const mx = records.find((r) => r.id === 'mx');
  const spf = records.find((r) => r.id === 'spf');
  const dmarc = records.find((r) => r.id === 'dmarc');
  const dkimSelectors = extras?.dkim?.selectors || [];

  if (mx && mx.status !== 'pass') {
    if (mx.parsed?.nullMx) {
      recommendations.push({
        id: 'mx_null',
        severity: 'low',
        title: 'Null MX is active (RFC 7505)',
        detail: `${domain} explicitly declares that it accepts no inbound mail. Keep this only if the domain never receives replies or bounces.`,
        suggestedRecord: null,
      });
    } else {
      recommendations.push({
        id: 'mx_missing',
        severity: 'medium',
        title: 'Publish an MX record or explicit Null MX',
        detail: `Without MX records, senders cannot deliver mail to ${domain}. If the domain never receives mail, publish a Null MX record to prevent fallback A-record delivery attempts.`,
        suggestedRecord: `${domain}. IN MX 0 .`,
      });
    }
  }

  if (spf) {
    if (spf.status === 'fail' && !spf.record) {
      recommendations.push({
        id: 'spf_missing',
        severity: 'high',
        title: 'Publish an SPF TXT record',
        detail: `Publish a single v=spf1 TXT record at ${domain} listing your authorized outbound mail servers and ending with -all.`,
        suggestedRecord: 'v=spf1 mx -all',
      });
    } else if (spf.parsed?.recordCount > 1) {
      recommendations.push({
        id: 'spf_multiple',
        severity: 'high',
        title: 'Merge multiple SPF records into one',
        detail: 'RFC 7208 §3.2 requires at most one v=spf1 TXT record per domain. Combine all include: and ip4:/ip6: mechanisms into a single record.',
        suggestedRecord: null,
      });
    } else if (spf.parsed?.allQualifier === '+all' || spf.parsed?.allQualifier === '?all' || !spf.parsed?.allQualifier) {
      recommendations.push({
        id: 'spf_weak_all',
        severity: 'high',
        title: 'End SPF with -all or ~all',
        detail: 'Replace +all or ?all with -all (hard fail) or ~all (soft fail) so unauthorized servers cannot impersonate your domain.',
        suggestedRecord: spf.record ? spf.record.replace(/(?:\+|\?)?all$/i, '-all') : 'v=spf1 -all',
      });
    }
    if (spf.parsed?.overLookupLimit) {
      const lookupTotal = spf.parsed.totalDnsLookups ?? spf.parsed.dnsLookupCount;
      recommendations.push({
        id: 'spf_lookup_limit',
        severity: 'high',
        title: 'Reduce SPF DNS lookups to 10 or fewer',
        detail: `Your SPF record uses ${lookupTotal} DNS-querying mechanisms (including nested includes), exceeding the RFC 7208 limit of 10 and causing SPF PermError at receivers.`,
        suggestedRecord: null,
      });
    }
  }

  if (dmarc) {
    if (dmarc.status === 'fail' && !dmarc.record) {
      recommendations.push({
        id: 'dmarc_missing',
        severity: 'high',
        title: `Publish a DMARC record at _dmarc.${domain}`,
        detail: 'Start with p=quarantine or p=reject and an aggregate reporting address (rua=) so receivers enforce alignment.',
        suggestedRecord: `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@${domain}; adkim=r; aspf=r`,
      });
    } else if (dmarc.parsed?.policy === 'none') {
      recommendations.push({
        id: 'dmarc_p_none',
        severity: 'medium',
        title: 'Upgrade DMARC policy from p=none to enforcement',
        detail: 'p=none only monitors traffic and does not block spoofing. Once legitimate senders align in DMARC Reports, step up to p=quarantine and then p=reject.',
        suggestedRecord: `v=DMARC1; p=quarantine; rua=${(dmarc.parsed.rua && dmarc.parsed.rua[0]) || `mailto:dmarc-reports@${domain}`}`,
      });
    }
    if (dmarc.record && (!dmarc.parsed?.rua || dmarc.parsed.rua.length === 0)) {
      recommendations.push({
        id: 'dmarc_no_rua',
        severity: 'low',
        title: 'Add an aggregate report destination (rua=)',
        detail: 'Adding rua=mailto:... lets mailbox providers send daily XML alignment reports that you can inspect in DMARC Reports.',
        suggestedRecord: `${dmarc.record.replace(/;\s*$/, '')}; rua=mailto:dmarc-reports@${domain}`,
      });
    }
  }

  const weakDkim = dkimSelectors.find((s) => s.status === 'warn' || (s.status === 'fail' && s.record));
  if (weakDkim) {
    recommendations.push({
      id: 'dkim_weak_key',
      severity: weakDkim.status === 'fail' ? 'high' : 'medium',
      title: `Upgrade DKIM key for selector "${weakDkim.selector}" to 2048-bit RSA or Ed25519`,
      detail: weakDkim.detail,
      suggestedRecord: null,
    });
  }

  return recommendations;
};

const notInDns = (domain) => {
  const detail = 'This domain is not in DNS.';
  const records = [
    recordOf('mx', 'MX', 'fail', detail),
    recordOf('spf', 'SPF', 'fail', detail),
    recordOf('dmarc', 'DMARC', 'fail', detail),
  ];
  const emptyDkim = {
    mode: 'probed',
    probedSelectors: COMMON_DKIM_SELECTORS,
    selectors: [],
  };
  return {
    domain,
    verdict: 'Blocked',
    summary: summaryFor(domain, 'Blocked', true),
    stored: false,
    records,
    dkim: emptyDkim,
    transportAndBrand: {
      dkim: emptyDkim,
      bimi: recordOf('bimi', 'BIMI', 'missing', detail, null, {
        fqdn: `default._bimi.${domain}`,
        version: null,
        logoUrl: null,
        authorityUrl: null,
      }),
      mtaSts: recordOf('mta_sts', 'MTA-STS', 'missing', detail, null, {
        fqdn: `_mta-sts.${domain}`,
        version: null,
        policyId: null,
      }),
      tlsRpt: recordOf('tls_rpt', 'TLS-RPT', 'missing', detail, null, {
        fqdn: `_smtp._tls.${domain}`,
        version: null,
        rua: [],
      }),
    },
    recommendations: [
      {
        id: 'domain_nxdomain',
        severity: 'high',
        title: 'Register or publish DNS zone records',
        detail: `${domain} returned NXDOMAIN. Publish authoritative NS, A/MX, SPF, and DMARC records before sending mail.`,
        suggestedRecord: null,
      },
    ],
  };
};

module.exports = {
  COMMON_DKIM_SELECTORS,
  flattenTxt,
  spfTokens,
  parseSpfMechanism,
  interpretMx,
  interpretSpf,
  interpretDmarc,
  interpretDkimSelector,
  interpretBimi,
  interpretMtaSts,
  interpretTlsRpt,
  estimateRsaBitsFromBase64,
  verdictFor,
  summaryFor,
  buildRecommendations,
  notInDns,
};
