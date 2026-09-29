import {
  SITE_LABEL_MAX_LENGTH,
  buildSiteAddress,
  normalizeSiteLabel,
  isValidSiteLabel,
  siteLabelOf,
} from './siteAddress';

describe('buildSiteAddress', () => {
  it('appends the label to the mailbox local part', () => {
    expect(buildSiteAddress('nova7@hide-mail.org', 'netflix')).toBe('nova7.netflix@hide-mail.org');
  });

  it('keeps a dotted custom alias intact', () => {
    expect(buildSiteAddress('john.doe@hide-mail.org', 'shop')).toBe('john.doe.shop@hide-mail.org');
  });

  it('returns an empty string when there is nothing to build from', () => {
    expect(buildSiteAddress('', 'shop')).toBe('');
    expect(buildSiteAddress('nova7@hide-mail.org', '')).toBe('');
    expect(buildSiteAddress('nova7', 'shop')).toBe('');
  });
});

describe('normalizeSiteLabel', () => {
  it('lowercases and hyphenates what a user types', () => {
    expect(normalizeSiteLabel('  Netflix ')).toBe('netflix');
    expect(normalizeSiteLabel('Acme Store')).toBe('acme-store');
    expect(normalizeSiteLabel('shop.example.com')).toBe('shop-example-com');
  });

  it('trims separators from the edges', () => {
    expect(normalizeSiteLabel('--acme__store--')).toBe('acme-store');
  });

  it('truncates to the maximum label length', () => {
    expect(normalizeSiteLabel('a'.repeat(50))).toHaveLength(SITE_LABEL_MAX_LENGTH);
  });

  it('returns an empty string when nothing usable is left', () => {
    expect(normalizeSiteLabel('***')).toBe('');
    expect(normalizeSiteLabel(undefined)).toBe('');
  });
});

describe('isValidSiteLabel', () => {
  it('accepts a normalized label', () => {
    expect(isValidSiteLabel('acme-store')).toBe(true);
  });

  it('rejects what the mail router would read as a different mailbox', () => {
    expect(isValidSiteLabel('')).toBe(false);
    expect(isValidSiteLabel('shop.example')).toBe(false);
    expect(isValidSiteLabel('-shop')).toBe(false);
    expect(isValidSiteLabel('a'.repeat(SITE_LABEL_MAX_LENGTH + 1))).toBe(false);
  });
});

describe('siteLabelOf', () => {
  it('reads the label back out of a delivered address', () => {
    expect(siteLabelOf('nova7.netflix@hide-mail.org', 'nova7@hide-mail.org')).toBe('netflix');
  });

  it('is null when the message went to the mailbox itself', () => {
    expect(siteLabelOf('nova7@hide-mail.org', 'nova7@hide-mail.org')).toBeNull();
  });

  it('ignores case differences', () => {
    expect(siteLabelOf('Nova7.Shop@Hide-Mail.org', 'nova7@hide-mail.org')).toBe('shop');
  });

  it('is null for an address that does not belong to the mailbox', () => {
    expect(siteLabelOf('other@hide-mail.org', 'nova7@hide-mail.org')).toBeNull();
    expect(siteLabelOf('', 'nova7@hide-mail.org')).toBeNull();
  });
});
