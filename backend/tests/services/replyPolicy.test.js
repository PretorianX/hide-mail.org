const replyPolicy = require('../../services/replyPolicy');

const MAILBOX = 'shopper@hide-mail.org';
const SERVICE_DOMAINS = ['hide-mail.org', 'mailguard.site'];

const message = (overrides = {}) => ({
  id: 'msg-1',
  from: '"Ada Support" <ada@shop.test>',
  subject: 'Your order #4417',
  text: 'Could you confirm the delivery address?',
  messageId: '<order-4417@shop.test>',
  receivedAt: '2026-09-19T08:00:00.000Z',
  ...overrides,
});

describe('replyPolicy.recipientOf', () => {
  it('takes the bare address out of a display-name header', () => {
    expect(replyPolicy.recipientOf(message())).toBe('ada@shop.test');
  });

  it('accepts a header that is already a bare address', () => {
    expect(replyPolicy.recipientOf(message({ from: 'ada@shop.test' }))).toBe('ada@shop.test');
  });

  it('lowercases the address so the quota and guards see one spelling', () => {
    expect(replyPolicy.recipientOf(message({ from: 'Ada@Shop.TEST' }))).toBe('ada@shop.test');
  });

  it('prefers Reply-To over From when the sender asked for it', () => {
    const withReplyTo = message({ replyTo: 'desk@shop.test' });

    expect(replyPolicy.recipientOf(withReplyTo)).toBe('desk@shop.test');
  });

  it('falls back to From when Reply-To is not a usable address', () => {
    expect(replyPolicy.recipientOf(message({ replyTo: 'undisclosed recipients' })))
      .toBe('ada@shop.test');
  });

  it('returns null when the stored message carries no sender', () => {
    expect(replyPolicy.recipientOf(message({ from: undefined }))).toBeNull();
    expect(replyPolicy.recipientOf(message({ from: 'Mailer Daemon' }))).toBeNull();
  });

  it('takes only the first address when the header lists several', () => {
    expect(replyPolicy.recipientOf(message({ from: 'ada@shop.test, bob@shop.test' })))
      .toBe('ada@shop.test');
  });
});

describe('replyPolicy.replySubject', () => {
  it('prefixes the original subject', () => {
    expect(replyPolicy.replySubject('Your order #4417')).toBe('Re: Your order #4417');
  });

  it('does not stack a second prefix on a subject that already has one', () => {
    expect(replyPolicy.replySubject('Re: Your order')).toBe('Re: Your order');
    expect(replyPolicy.replySubject('RE: Your order')).toBe('RE: Your order');
    expect(replyPolicy.replySubject('re:Your order')).toBe('re:Your order');
  });

  it('names a message that arrived without a subject', () => {
    expect(replyPolicy.replySubject('')).toBe('Re: (No Subject)');
    expect(replyPolicy.replySubject(undefined)).toBe('Re: (No Subject)');
  });

  it('strips CR and LF so a crafted subject cannot inject headers', () => {
    expect(replyPolicy.replySubject('Order\r\nBcc: victim@elsewhere.test'))
      .toBe('Re: Order Bcc: victim@elsewhere.test');
  });
});

describe('replyPolicy.threadHeaders', () => {
  it('points the reply at the message it answers', () => {
    expect(replyPolicy.threadHeaders(message())).toEqual({
      'In-Reply-To': '<order-4417@shop.test>',
      References: '<order-4417@shop.test>',
    });
  });

  it('appends the answered message to an existing References chain', () => {
    const threaded = message({ references: '<first@shop.test> <second@shop.test>' });

    expect(replyPolicy.threadHeaders(threaded).References)
      .toBe('<first@shop.test> <second@shop.test> <order-4417@shop.test>');
  });

  it('accepts a References header stored as an array', () => {
    const threaded = message({ references: ['<first@shop.test>'] });

    expect(replyPolicy.threadHeaders(threaded).References)
      .toBe('<first@shop.test> <order-4417@shop.test>');
  });

  it('returns no threading headers when the original had no Message-ID', () => {
    expect(replyPolicy.threadHeaders(message({ messageId: undefined }))).toEqual({});
  });

  it('strips CR and LF out of the identifiers it echoes back', () => {
    const crafted = message({ messageId: '<a@b>\r\nBcc: victim@elsewhere.test' });

    expect(replyPolicy.threadHeaders(crafted)['In-Reply-To'])
      .toBe('<a@b> Bcc: victim@elsewhere.test');
  });
});

describe('replyPolicy.quoteOriginal', () => {
  it('quotes the plain text of the message being answered', () => {
    const quoted = replyPolicy.quoteOriginal(message());

    expect(quoted).toContain('> Could you confirm the delivery address?');
    expect(quoted).toContain('ada@shop.test');
  });

  it('quotes every line of a multi-line body', () => {
    const quoted = replyPolicy.quoteOriginal(message({ text: 'first\nsecond' }));

    expect(quoted).toContain('> first\n> second');
  });

  it('omits the quoted block for a message with no plain text part', () => {
    expect(replyPolicy.quoteOriginal(message({ text: '' }))).toBe('');
  });
});

describe('replyPolicy.buildReply', () => {
  const build = (overrides = {}) => replyPolicy.buildReply({
    mailbox: MAILBOX,
    message: message(),
    body: 'Yes, 14 Oak Street is correct.',
    maxBodyChars: 5000,
    serviceDomains: SERVICE_DOMAINS,
    ...overrides,
  });

  it('sends from the mailbox that received the message', () => {
    expect(build().from).toBe(MAILBOX);
  });

  it('addresses the sender of the message being answered', () => {
    expect(build().to).toBe('ada@shop.test');
  });

  it('asks the correspondent to answer back into the same mailbox', () => {
    expect(build().replyTo).toBe(MAILBOX);
  });

  it('carries the reply subject and threading headers', () => {
    const reply = build();

    expect(reply.subject).toBe('Re: Your order #4417');
    expect(reply.headers['In-Reply-To']).toBe('<order-4417@shop.test>');
  });

  it('puts the typed text above the quoted original', () => {
    const reply = build();

    expect(reply.text.indexOf('Yes, 14 Oak Street is correct.'))
      .toBeLessThan(reply.text.indexOf('> Could you confirm the delivery address?'));
  });

  it('pins the envelope sender to the mailbox so bounces come back to it', () => {
    expect(build().envelope).toEqual({ from: MAILBOX, to: 'ada@shop.test' });
  });

  it('refuses a message whose sender cannot be addressed', () => {
    expect(() => build({ message: message({ from: 'Mailer Daemon' }) }))
      .toThrow(expect.objectContaining({ code: 'NO_REPLY_RECIPIENT' }));
  });

  it('refuses to relay back into the service, which would make it an open relay', () => {
    expect(() => build({ message: message({ from: 'someone@mailguard.site' }) }))
      .toThrow(expect.objectContaining({ code: 'RECIPIENT_NOT_ALLOWED' }));
  });

  it('refuses an empty body', () => {
    expect(() => build({ body: '   ' }))
      .toThrow(expect.objectContaining({ code: 'EMPTY_BODY' }));
    expect(() => build({ body: undefined }))
      .toThrow(expect.objectContaining({ code: 'EMPTY_BODY' }));
  });

  it('refuses a body that is not a string', () => {
    expect(() => build({ body: { toString: () => 'hi' } }))
      .toThrow(expect.objectContaining({ code: 'EMPTY_BODY' }));
  });

  it('refuses a body longer than the configured cap', () => {
    expect(() => build({ body: 'x'.repeat(5001) }))
      .toThrow(expect.objectContaining({ code: 'BODY_TOO_LONG' }));
  });

  it('sends plain text only, so a typed reply cannot carry markup', () => {
    const reply = build({ body: '<img src=x onerror=alert(1)>' });

    expect(reply.html).toBeUndefined();
    expect(reply.text).toContain('<img src=x onerror=alert(1)>');
  });
});
