/**
 * Sender Check looks up MX, SPF (including nested includes), DMARC, DKIM, BIMI,
 * MTA-STS, and TLS-RPT for one domain and returns a report. The domain is not stored.
 */

const dns = require('node:dns').promises;
const { SenderCheckError } = require('./senderCheck/errors');
const { normalizeDomain } = require('./senderCheck/domainName');
const {
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
  verdictFor,
  summaryFor,
  buildRecommendations,
  notInDns,
} = require('./senderCheck/records');

const ABSENT = new Set(['ENOTFOUND', 'ENODATA', 'ENONAME']);
const SELECTOR_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,61}[a-z0-9])?$/i;

const defaultResolver = {
  resolveMx: (name) => dns.resolveMx(name),
  resolveTxt: (name) => dns.resolveTxt(name),
};

const extractResolverAndOptions = (optionsOrResolver) => {
  if (!optionsOrResolver || typeof optionsOrResolver !== 'object') {
    return { resolver: defaultResolver, dkimSelector: null };
  }
  if (typeof optionsOrResolver.resolveTxt === 'function' || typeof optionsOrResolver.resolveMx === 'function') {
    return { resolver: optionsOrResolver, dkimSelector: null };
  }
  const resolver = optionsOrResolver.resolver || optionsOrResolver.dns || defaultResolver;
  const rawSelector = typeof optionsOrResolver.dkimSelector === 'string'
    ? optionsOrResolver.dkimSelector.trim().toLowerCase()
    : '';
  return {
    resolver,
    dkimSelector: rawSelector || null,
  };
};

const query = async (resolver, method, name) => {
  try {
    const records = await resolver[method](name);
    return { records: records || [] };
  } catch (error) {
    if (error && ABSENT.has(error.code)) {
      return { records: [], nxdomain: error.code === 'ENOTFOUND' };
    }
    throw new SenderCheckError('DNS_UNAVAILABLE', 'The DNS lookup did not answer. Try again.');
  }
};

const queryOptionalTxt = async (resolver, name, timeoutMs = 1500) => {
  if (typeof resolver.resolveTxt !== 'function') {
    return { records: [] };
  }
  let timer = null;
  try {
    const lookupPromise = Promise.resolve(resolver.resolveTxt(name));
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error('ETIMEOUT');
        err.code = 'ETIMEOUT';
        reject(err);
      }, timeoutMs);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    });
    const records = await Promise.race([lookupPromise, timeoutPromise]);
    return { records: Array.isArray(records) ? records : [] };
  } catch {
    return { records: [] };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const extractChildTargets = (mechanisms) => mechanisms
  .filter((m) => (m.type === 'include' || m.type === 'redirect') && m.value)
  .map((m) => ({ type: m.type, target: String(m.value).trim().toLowerCase().replace(/\.$/, '') }))
  .filter((item) => item.target.length > 0);

const resolveSpfIncludeTree = async (rootDomain, spfRecord, resolver) => {
  if (!spfRecord || !spfRecord.parsed || spfRecord.parsed.recordCount !== 1) {
    return;
  }

  const maxDepth = 3;
  const maxQueries = 12;
  let queriesUsed = 0;
  let additionalLookups = 0;
  const includeTree = [];
  const rootTargets = extractChildTargets(spfRecord.parsed.mechanisms || []);

  const walk = async (targetDomain, depth, ancestry) => {
    if (ancestry.has(targetDomain)) {
      includeTree.push({
        domain: targetDomain,
        record: null,
        lookups: 0,
        depth,
        error: `Recursive SPF cycle detected (${targetDomain})`,
      });
      return;
    }
    if (depth > maxDepth) {
      includeTree.push({
        domain: targetDomain,
        record: null,
        lookups: 0,
        depth,
        error: `Max SPF recursion depth (${maxDepth}) reached`,
      });
      return;
    }
    if (queriesUsed >= maxQueries) {
      includeTree.push({
        domain: targetDomain,
        record: null,
        lookups: 0,
        depth,
        error: `Max SPF query budget (${maxQueries}) reached`,
      });
      return;
    }

    queriesUsed += 1;
    const res = await queryOptionalTxt(resolver, targetDomain);
    let spfTexts = [];
    try {
      spfTexts = flattenTxt(res.records)
        .map((t) => t.trim())
        .filter((t) => t.toLowerCase().startsWith('v=spf1'));
    } catch {
      spfTexts = [];
    }

    if (spfTexts.length === 0) {
      includeTree.push({
        domain: targetDomain,
        record: null,
        lookups: 0,
        depth,
        error: 'No SPF record found at included domain',
      });
      return;
    }

    const published = spfTexts[0];
    const mechanisms = spfTokens(published).map(parseSpfMechanism);
    const ownLookups = mechanisms.reduce((sum, item) => sum + item.lookups, 0);
    additionalLookups += ownLookups;

    includeTree.push({
      domain: targetDomain,
      record: published,
      lookups: ownLookups,
      depth,
    });

    const nextAncestry = new Set(ancestry);
    nextAncestry.add(targetDomain);
    const children = extractChildTargets(mechanisms);
    for (const child of children) {
      await walk(child.target, depth + 1, nextAncestry);
    }
  };

  const initialAncestry = new Set([rootDomain]);
  for (const item of rootTargets) {
    await walk(item.target, 1, initialAncestry);
  }

  const totalDnsLookups = spfRecord.parsed.dnsLookupCount + additionalLookups;
  spfRecord.parsed.totalDnsLookups = totalDnsLookups;
  spfRecord.parsed.overLookupLimit = totalDnsLookups > (spfRecord.parsed.dnsLookupLimit || 10);
  spfRecord.parsed.includeTree = includeTree;
};

const inspectDkim = async (domain, dkimSelector, resolver) => {
  if (dkimSelector) {
    if (!SELECTOR_PATTERN.test(dkimSelector)) {
      throw new SenderCheckError('DKIM_SELECTOR_INVALID', 'Enter a valid DKIM selector name (e.g. google, s1).');
    }
    const fqdn = `${dkimSelector}._domainkey.${domain}`;
    const res = await queryOptionalTxt(resolver, fqdn);
    const entry = interpretDkimSelector(dkimSelector, domain, res.records);
    return {
      mode: 'explicit',
      probedSelectors: [dkimSelector],
      selectors: [entry],
    };
  }

  const probed = await Promise.all(
    COMMON_DKIM_SELECTORS.map(async (sel) => {
      const fqdn = `${sel}._domainkey.${domain}`;
      const res = await queryOptionalTxt(resolver, fqdn);
      return interpretDkimSelector(sel, domain, res.records);
    })
  );

  return {
    mode: 'probed',
    probedSelectors: COMMON_DKIM_SELECTORS,
    selectors: probed.filter((entry) => entry.status !== 'missing'),
  };
};

const checkDomain = async (input, options = {}) => {
  const domain = normalizeDomain(input);
  const { resolver, dkimSelector } = extractResolverAndOptions(options);

  const mx = await query(resolver, 'resolveMx', domain);
  if (mx.nxdomain) {
    return notInDns(domain);
  }

  const [txt, dmarc, bimiRes, mtaStsRes, tlsRptRes, dkim] = await Promise.all([
    query(resolver, 'resolveTxt', domain),
    query(resolver, 'resolveTxt', `_dmarc.${domain}`),
    queryOptionalTxt(resolver, `default._bimi.${domain}`),
    queryOptionalTxt(resolver, `_mta-sts.${domain}`),
    queryOptionalTxt(resolver, `_smtp._tls.${domain}`),
    inspectDkim(domain, dkimSelector, resolver),
  ]);

  const mxRecord = interpretMx(mx.records);
  const spfRecord = interpretSpf(txt.records);
  const dmarcRecord = interpretDmarc(dmarc.records);

  await resolveSpfIncludeTree(domain, spfRecord, resolver);

  const records = [mxRecord, spfRecord, dmarcRecord];
  const verdict = verdictFor(records);

  const bimi = interpretBimi(domain, bimiRes.records);
  const mtaSts = interpretMtaSts(domain, mtaStsRes.records);
  const tlsRpt = interpretTlsRpt(domain, tlsRptRes.records);
  const transportAndBrand = {
    dkim,
    bimi,
    mtaSts,
    tlsRpt,
  };

  return {
    domain,
    verdict,
    summary: summaryFor(domain, verdict, false),
    stored: false,
    records,
    dkim,
    transportAndBrand,
    recommendations: buildRecommendations(domain, records, { dkim, bimi, mtaSts, tlsRpt }),
  };
};

module.exports = {
  checkDomain,
  SenderCheckError,
};
