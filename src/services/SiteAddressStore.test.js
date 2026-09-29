import SiteAddressStore from './SiteAddressStore';

const MAILBOX = 'nova7@hide-mail.org';

describe('SiteAddressStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty', () => {
    expect(SiteAddressStore.list(MAILBOX)).toEqual([]);
  });

  it('keeps the newest label first', () => {
    SiteAddressStore.add(MAILBOX, 'netflix');
    SiteAddressStore.add(MAILBOX, 'acme-store');

    expect(SiteAddressStore.list(MAILBOX)).toEqual(['acme-store', 'netflix']);
  });

  it('does not store the same label twice', () => {
    SiteAddressStore.add(MAILBOX, 'netflix');
    SiteAddressStore.add(MAILBOX, 'netflix');

    expect(SiteAddressStore.list(MAILBOX)).toEqual(['netflix']);
  });

  it('rejects a label the mail router could not read back', () => {
    SiteAddressStore.add(MAILBOX, 'not a label');

    expect(SiteAddressStore.list(MAILBOX)).toEqual([]);
  });

  it('removes a label', () => {
    SiteAddressStore.add(MAILBOX, 'netflix');
    SiteAddressStore.add(MAILBOX, 'shop');

    SiteAddressStore.remove(MAILBOX, 'netflix');

    expect(SiteAddressStore.list(MAILBOX)).toEqual(['shop']);
  });

  it('keeps each mailbox separate', () => {
    SiteAddressStore.add(MAILBOX, 'netflix');
    SiteAddressStore.add('other@hide-mail.org', 'shop');

    expect(SiteAddressStore.list(MAILBOX)).toEqual(['netflix']);
    expect(SiteAddressStore.list('other@hide-mail.org')).toEqual(['shop']);
  });

  it('matches a mailbox regardless of case', () => {
    SiteAddressStore.add(MAILBOX, 'netflix');

    expect(SiteAddressStore.list('Nova7@Hide-Mail.org')).toEqual(['netflix']);
  });

  it('forgets every label of a mailbox at once', () => {
    SiteAddressStore.add(MAILBOX, 'netflix');
    SiteAddressStore.add('other@hide-mail.org', 'shop');

    SiteAddressStore.clear(MAILBOX);

    expect(SiteAddressStore.list(MAILBOX)).toEqual([]);
    expect(SiteAddressStore.list('other@hide-mail.org')).toEqual(['shop']);
  });

  it('ignores stored data that is not usable', () => {
    localStorage.setItem('hidemail.siteAddresses', 'not json');

    expect(SiteAddressStore.list(MAILBOX)).toEqual([]);
  });
});
