const {
  SITE_SEPARATOR,
  SITE_LABEL_MAX_LENGTH,
  routeCandidates,
  buildSiteAddress,
  normalizeSiteLabel,
  isValidSiteLabel,
} = require('../../services/subAddressing');

describe('subAddressing.routeCandidates', () => {
  it('offers the address itself before any sub-address route', () => {
    expect(routeCandidates('nova7@hide-mail.org')).toEqual([
      { mailbox: 'nova7@hide-mail.org', label: null },
    ]);
  });

  it('falls back from the longest local part to the shortest', () => {
    expect(routeCandidates('john.doe.netflix@hide-mail.org')).toEqual([
      { mailbox: 'john.doe.netflix@hide-mail.org', label: null },
      { mailbox: 'john.doe@hide-mail.org', label: 'netflix' },
      { mailbox: 'john@hide-mail.org', label: 'doe.netflix' },
    ]);
  });

  it('lowercases and trims the address', () => {
    expect(routeCandidates('  Nova7.Shop@Hide-Mail.ORG ')).toEqual([
      { mailbox: 'nova7.shop@hide-mail.org', label: null },
      { mailbox: 'nova7@hide-mail.org', label: 'shop' },
    ]);
  });

  it('caps how many routes a deeply dotted local part produces', () => {
    const candidates = routeCandidates('a.b.c.d.e.f.g@hide-mail.org');

    expect(candidates).toHaveLength(5);
    expect(candidates[0].mailbox).toBe('a.b.c.d.e.f.g@hide-mail.org');
    expect(candidates[4]).toEqual({ mailbox: 'a.b.c@hide-mail.org', label: 'd.e.f.g' });
  });

  it('ignores routes that would come from an empty segment', () => {
    expect(routeCandidates('nova7..shop@hide-mail.org')).toEqual([
      { mailbox: 'nova7..shop@hide-mail.org', label: null },
    ]);
  });

  it('returns nothing for an address it cannot split', () => {
    expect(routeCandidates('not-an-address')).toEqual([]);
    expect(routeCandidates('@hide-mail.org')).toEqual([]);
    expect(routeCandidates('nova7@')).toEqual([]);
    expect(routeCandidates(null)).toEqual([]);
  });
});

describe('subAddressing.buildSiteAddress', () => {
  it('appends the label to the mailbox local part', () => {
    expect(buildSiteAddress('nova7@hide-mail.org', 'netflix')).toBe('nova7.netflix@hide-mail.org');
  });

  it('keeps a dotted custom alias intact', () => {
    expect(buildSiteAddress('john.doe@hide-mail.org', 'shop')).toBe('john.doe.shop@hide-mail.org');
  });

  it('separates with the documented separator', () => {
    expect(buildSiteAddress('nova7@hide-mail.org', 'shop')).toContain(`nova7${SITE_SEPARATOR}shop`);
  });

  it('refuses a label the router could not read back', () => {
    expect(() => buildSiteAddress('nova7@hide-mail.org', 'net flix')).toThrow(/label/i);
    expect(() => buildSiteAddress('nova7@hide-mail.org', '')).toThrow(/label/i);
  });

  it('refuses an address it cannot split', () => {
    expect(() => buildSiteAddress('nova7', 'shop')).toThrow(/address/i);
  });

  it('round-trips through the router', () => {
    const address = buildSiteAddress('nova7@hide-mail.org', 'netflix');

    expect(routeCandidates(address)).toContainEqual({
      mailbox: 'nova7@hide-mail.org',
      label: 'netflix',
    });
  });
});

describe('subAddressing.normalizeSiteLabel', () => {
  it('lowercases and hyphenates what a user types', () => {
    expect(normalizeSiteLabel('  Netflix  ')).toBe('netflix');
    expect(normalizeSiteLabel('Acme Store')).toBe('acme-store');
    expect(normalizeSiteLabel('shop.example.com')).toBe('shop-example-com');
  });

  it('collapses runs of separators and trims them from the edges', () => {
    expect(normalizeSiteLabel('--acme___store--')).toBe('acme-store');
  });

  it('truncates to the maximum label length', () => {
    const label = normalizeSiteLabel('a'.repeat(SITE_LABEL_MAX_LENGTH + 10));

    expect(label).toHaveLength(SITE_LABEL_MAX_LENGTH);
  });

  it('returns an empty string when nothing usable is left', () => {
    expect(normalizeSiteLabel('***')).toBe('');
    expect(normalizeSiteLabel(null)).toBe('');
  });
});

describe('subAddressing.isValidSiteLabel', () => {
  it('accepts a normalized label', () => {
    expect(isValidSiteLabel('netflix')).toBe(true);
    expect(isValidSiteLabel('acme-store')).toBe(true);
    expect(isValidSiteLabel('a1')).toBe(true);
  });

  it('rejects anything the router would read as a different mailbox', () => {
    expect(isValidSiteLabel('')).toBe(false);
    expect(isValidSiteLabel('-shop')).toBe(false);
    expect(isValidSiteLabel('shop-')).toBe(false);
    expect(isValidSiteLabel('shop.example')).toBe(false);
    expect(isValidSiteLabel('shop store')).toBe(false);
    expect(isValidSiteLabel('a'.repeat(SITE_LABEL_MAX_LENGTH + 1))).toBe(false);
  });
});
