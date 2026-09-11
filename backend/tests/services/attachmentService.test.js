const attachmentService = require('../../services/attachmentService');

const base64 = (text) => Buffer.from(text).toString('base64');

const messageWith = (attachments) => ({
  id: 'msg-1',
  from: 'billing@shop.test',
  subject: 'Your invoice',
  attachments,
});

describe('attachmentService.listAttachments', () => {
  it('returns downloadable metadata without the encoded content', () => {
    const message = messageWith([
      {
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
        contentDisposition: 'attachment',
        cid: null,
        content: base64('pdf-bytes'),
        encoding: 'base64',
      },
    ]);

    expect(attachmentService.listAttachments(message)).toEqual([
      {
        index: 0,
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
        size: Buffer.byteLength('pdf-bytes'),
        inline: false,
      },
    ]);
  });

  it('marks parts with a content id as inline so the UI can keep them out of the file list', () => {
    const message = messageWith([
      {
        filename: 'logo.png',
        contentType: 'image/png',
        contentDisposition: 'inline',
        cid: 'logo@shop.test',
        content: base64('png-bytes'),
        encoding: 'base64',
      },
    ]);

    expect(attachmentService.listAttachments(message)[0].inline).toBe(true);
  });

  it('keeps the original array position as the index when a part has no content', () => {
    const message = messageWith([
      { filename: 'empty.txt', contentType: 'text/plain', content: null, encoding: 'base64' },
      {
        filename: 'report.csv',
        contentType: 'text/csv',
        content: base64('a,b,c'),
        encoding: 'base64',
      },
    ]);

    const listed = attachmentService.listAttachments(message);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ index: 1, filename: 'report.csv' });
  });

  it('returns an empty list for a message without attachments', () => {
    expect(attachmentService.listAttachments({ id: 'msg-1' })).toEqual([]);
  });

  it('strips directory traversal and control characters out of the filename', () => {
    const message = messageWith([
      {
        filename: '../../etc/pa\r\nsswd',
        contentType: 'application/pdf',
        content: base64('x'),
        encoding: 'base64',
      },
    ]);

    expect(attachmentService.listAttachments(message)[0].filename).toBe('etcpasswd');
  });

  it('names a part with an unusable filename so it stays downloadable', () => {
    const message = messageWith([
      { filename: '///', contentType: 'application/pdf', content: base64('x'), encoding: 'base64' },
    ]);

    expect(attachmentService.listAttachments(message)[0].filename).toBe('attachment');
  });

  it.each([
    'text/html',
    'application/xhtml+xml',
    'image/svg+xml',
    'application/xml',
    'text/javascript',
  ])('serves %s as an opaque download so it cannot execute on our origin', (contentType) => {
    const message = messageWith([
      { filename: 'payload', contentType, content: base64('<svg/>'), encoding: 'base64' },
    ]);

    expect(attachmentService.listAttachments(message)[0].contentType).toBe('application/octet-stream');
  });

  it('rejects a content type that is not a MIME type', () => {
    const message = messageWith([
      { filename: 'x.bin', contentType: 'not a mime type', content: base64('x'), encoding: 'base64' },
    ]);

    expect(attachmentService.listAttachments(message)[0].contentType).toBe('application/octet-stream');
  });
});

describe('attachmentService.resolveAttachment', () => {
  const message = messageWith([
    {
      filename: 'invoice.pdf',
      contentType: 'application/pdf',
      content: base64('pdf-bytes'),
      encoding: 'base64',
    },
  ]);

  it('decodes the requested attachment', () => {
    const resolved = attachmentService.resolveAttachment(message, '0');

    expect(resolved.filename).toBe('invoice.pdf');
    expect(resolved.contentType).toBe('application/pdf');
    expect(resolved.content.toString()).toBe('pdf-bytes');
  });

  it('returns null for an index outside the attachment list', () => {
    expect(attachmentService.resolveAttachment(message, '1')).toBeNull();
    expect(attachmentService.resolveAttachment(message, '-1')).toBeNull();
  });

  it('returns null for an index that is not a whole number', () => {
    expect(attachmentService.resolveAttachment(message, 'first')).toBeNull();
    expect(attachmentService.resolveAttachment(message, '0.5')).toBeNull();
  });

  it('returns null when the part carries no base64 content', () => {
    const withoutContent = messageWith([
      { filename: 'empty.txt', contentType: 'text/plain', content: null, encoding: 'base64' },
    ]);

    expect(attachmentService.resolveAttachment(withoutContent, '0')).toBeNull();
  });

  it('returns null when the part is not base64 encoded', () => {
    const legacy = messageWith([
      { filename: 'old.bin', contentType: 'application/pdf', content: 'raw', encoding: 'binary' },
    ]);

    expect(attachmentService.resolveAttachment(legacy, '0')).toBeNull();
  });

  it('returns null for a message without attachments', () => {
    expect(attachmentService.resolveAttachment({ id: 'msg-1' }, '0')).toBeNull();
  });
});

describe('attachmentService.contentDispositionHeader', () => {
  it('forces a download and repeats the name in RFC 5987 form', () => {
    expect(attachmentService.contentDispositionHeader('invoice.pdf'))
      .toBe("attachment; filename=\"invoice.pdf\"; filename*=UTF-8''invoice.pdf");
  });

  it('percent-encodes a non-ASCII name for the RFC 5987 parameter', () => {
    const header = attachmentService.contentDispositionHeader('рахунок.pdf');

    expect(header).toContain('attachment;');
    expect(header).toContain("filename*=UTF-8''%D1%80%D0%B0%D1%85%D1%83%D0%BD%D0%BE%D0%BA.pdf");
  });
});

describe('attachmentService.withAttachmentMetadata', () => {
  it('replaces the encoded parts with metadata so polling stays light', () => {
    const message = messageWith([
      {
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
        content: base64('pdf-bytes'),
        encoding: 'base64',
      },
    ]);

    const slim = attachmentService.withAttachmentMetadata(message);

    expect(slim.subject).toBe('Your invoice');
    expect(slim.attachments).toEqual([
      {
        index: 0,
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
        size: Buffer.byteLength('pdf-bytes'),
        inline: false,
      },
    ]);
  });

  it('leaves the stored message untouched', () => {
    const message = messageWith([
      {
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
        content: base64('pdf-bytes'),
        encoding: 'base64',
      },
    ]);

    attachmentService.withAttachmentMetadata(message);

    expect(message.attachments[0].content).toBe(base64('pdf-bytes'));
  });
});
