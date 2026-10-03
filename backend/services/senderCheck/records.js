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

const recordOf = (id, name, status, detail, record) => ({
  id,
  name,
  status,
  detail,
  record: record || null,
});

const isNullExchange = (exchange) => {
  const host = String(exchange || '').trim();
  return host === '' || host === '.';
};

const interpretMx = (records) => {
  if (!Array.isArray(records) || records.length === 0) {
    return recordOf('mx', 'MX', 'warn', 'No MX record is published.');
  }
  if (records.length === 1 && isNullExchange(records[0].exchange)) {
    return recordOf('mx', 'MX', 'warn', 'This domain publishes a null MX, so it accepts no mail.', '.');
  }
  const hosts = records
    .map((row) => String(row.exchange || '').replace(/\.$/, ''))
    .filter((host) => host && host !== '.');
  if (hosts.length === 0) {
    return recordOf('mx', 'MX', 'warn', 'No MX record is published.');
  }
  const shown = hosts.slice(0, 3).join(', ');
  const extra = hosts.length > 3 ? ` and ${hosts.length - 3} more` : '';
  return recordOf('mx', 'MX', 'pass', `Mail hosts are published: ${shown}${extra}.`, shown);
};

const spfTokens = (record) => record.trim().split(/\s+/).slice(1);

const interpretSpf = (txtRecords) => {
  const spf = flattenTxt(txtRecords)
    .map((text) => text.trim())
    .filter((text) => text.toLowerCase().startsWith('v=spf1'));

  if (spf.length === 0) {
    return recordOf('spf', 'SPF', 'fail', 'No SPF record is published.');
  }
  if (spf.length > 1) {
    return recordOf(
      'spf',
      'SPF',
      'fail',
      'More than one SPF record is published, which receivers treat as an error.',
      spf[0]
    );
  }

  const published = spf[0];
  const all = spfTokens(published).find((token) => /^(?:\+|-|~|\?)?all$/i.test(token));
  const qualifier = all ? all.toLowerCase() : '';

  if (qualifier === 'all' || qualifier === '+all') {
    return recordOf('spf', 'SPF', 'fail', 'SPF ends in +all, so any server may send as this domain.', published);
  }
  if (qualifier === '-all') {
    return recordOf('spf', 'SPF', 'pass', 'SPF names the servers that may send and rejects the rest.', published);
  }
  if (qualifier === '~all') {
    return recordOf('spf', 'SPF', 'pass', 'SPF names the servers that may send and soft-fails the rest.', published);
  }
  if (qualifier === '?all') {
    return recordOf('spf', 'SPF', 'warn', 'SPF ends in ?all, so it does not tell receivers what to do.', published);
  }
  return recordOf('spf', 'SPF', 'warn', 'SPF does not end in an all mechanism.', published);
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
    tags.set(piece.slice(0, splitAt).trim().toLowerCase(), piece.slice(splitAt + 1).trim().toLowerCase());
  });
  return tags;
};

const interpretDmarc = (txtRecords) => {
  const dmarc = flattenTxt(txtRecords)
    .map((text) => text.trim())
    .filter((text) => text.toLowerCase().startsWith('v=dmarc1'));

  if (dmarc.length === 0) {
    return recordOf('dmarc', 'DMARC', 'fail', 'No DMARC record is published.');
  }
  if (dmarc.length > 1) {
    return recordOf('dmarc', 'DMARC', 'fail', 'More than one DMARC record is published.', dmarc[0]);
  }

  const published = dmarc[0];
  const policy = dmarcTags(published).get('p');
  if (policy === 'reject') {
    return recordOf('dmarc', 'DMARC', 'pass', 'DMARC asks receivers to reject mail that fails alignment.', published);
  }
  if (policy === 'quarantine') {
    return recordOf('dmarc', 'DMARC', 'pass', 'DMARC asks receivers to quarantine mail that fails alignment.', published);
  }
  if (policy === 'none') {
    return recordOf('dmarc', 'DMARC', 'warn', 'DMARC is published with p=none, so receivers are asked not to enforce it.', published);
  }
  return recordOf('dmarc', 'DMARC', 'fail', 'DMARC has no usable policy.', published);
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

const notInDns = (domain) => {
  const detail = 'This domain is not in DNS.';
  const records = [
    recordOf('mx', 'MX', 'fail', detail),
    recordOf('spf', 'SPF', 'fail', detail),
    recordOf('dmarc', 'DMARC', 'fail', detail),
  ];
  return {
    domain,
    verdict: 'Blocked',
    summary: summaryFor(domain, 'Blocked', true),
    stored: false,
    records,
  };
};

module.exports = {
  interpretMx,
  interpretSpf,
  interpretDmarc,
  verdictFor,
  summaryFor,
  notInDns,
};
