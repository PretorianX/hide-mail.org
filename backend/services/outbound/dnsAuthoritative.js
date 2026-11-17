const dns = require('node:dns');

const findAuthoritativeNameservers = async (name, resolver = dns.promises) => {
  const labels = name.replace(/\.$/, '').split('.');

  for (let index = 0; index < labels.length; index += 1) {
    const candidate = labels.slice(index).join('.');
    try {
      const nameservers = await resolver.resolveNs(candidate);
      if (Array.isArray(nameservers) && nameservers.length > 0) {
        return nameservers;
      }
    } catch {
      // Continue toward the TLD when this candidate has no usable answer.
    }
  }

  return [];
};

const withTimeout = async (lookup, timeoutMs) => {
  let timer = null;
  try {
    const lookupPromise = Promise.resolve(lookup());
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error('ETIMEOUT');
        error.code = 'ETIMEOUT';
        reject(error);
      }, timeoutMs);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    });

    return await Promise.race([lookupPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const normalizeRecords = (type, records) => {
  if (!Array.isArray(records)) {
    return [];
  }
  if (type === 'TXT') {
    return records.map((record) => (
      Array.isArray(record) ? record.join('') : String(record)
    ));
  }
  return records;
};

const queryAuthoritative = async ({
  name,
  type,
  nameservers,
  resolver = dns.promises,
  timeoutMs = 2000,
  ResolverCtor = dns.promises.Resolver,
}) => {
  const results = await Promise.all(nameservers.map(async (nameserver) => {
    let addresses;
    try {
      addresses = await resolver.resolve4(nameserver);
    } catch {
      return null;
    }

    if (!Array.isArray(addresses) || addresses.length === 0) {
      return null;
    }

    const authoritativeResolver = new ResolverCtor();
    authoritativeResolver.setServers([addresses[0]]);

    try {
      const records = await withTimeout(
        () => (
          type === 'TXT'
            ? authoritativeResolver.resolveTxt(name)
            : authoritativeResolver.resolve(name, 'CNAME')
        ),
        timeoutMs
      );
      return {
        nameserver,
        records: normalizeRecords(type, records),
        error: null,
      };
    } catch (error) {
      if (error && ['ETIMEOUT', 'ENOTFOUND', 'ENODATA'].includes(error.code)) {
        return null;
      }
      return {
        nameserver,
        records: null,
        error: (error && (error.code || error.message)) || 'dns_error',
      };
    }
  }));

  return {
    answered: results.filter((result) => result !== null),
  };
};

module.exports = {
  findAuthoritativeNameservers,
  queryAuthoritative,
};
