process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.EMAIL_EXPIRATION_SECONDS = '1800';

const zlib = require('node:zlib');
const { PassThrough } = require('node:stream');
const redisService = require('../../services/redisService');
const licenseService = require('../../services/licenseService');
const mailGradeService = require('../../services/mailGradeService');
const senderCheckService = require('../../services/senderCheckService');
const dmarcReportService = require('../../services/dmarcReportService');
const bounceReadService = require('../../services/bounceReadService');
const complaintReadService = require('../../services/complaintReadService');
const mcpController = require('../../controllers/mcpController');
const {
  extractXmlFromZipBuffer,
  MAX_ARCHIVE_OUTPUT_BYTES,
} = require('../../services/mcpService');
const { forwardJsonRpc, createStdioBridge } = require('../../../mcp/hide-mail-mcp');

const buildZipBuffer = (entries, { lieUncompressedSize } = {}) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  entries.forEach(({ name, data, method = 8 }) => {
    const nameBuf = Buffer.from(name, 'utf8');
    const uncompressed = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const compressed = method === 8 ? zlib.deflateRawSync(uncompressed) : uncompressed;
    const declaredUncompressed =
      typeof lieUncompressedSize === 'number' ? lieUncompressedSize : uncompressed.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt32LE(0, 10);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(declaredUncompressed >>> 0, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt32LE(0, 12);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(declaredUncompressed >>> 0, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  });

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
};

const createRes = () => {
  const headers = {};
  const chunks = [];
  return {
    statusCode: 200,
    headers,
    body: null,
    chunks,
    ended: false,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    },
    end(chunk) {
      if (chunk) {
        chunks.push(String(chunk));
      }
      this.ended = true;
      return this;
    },
  };
};

const SAMPLE_DMARC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feedback>
  <report_metadata>
    <org_name>google.com</org_name>
    <email>noreply-dmarc-support@google.com</email>
    <report_id>123456789</report_id>
    <date_range>
      <begin>1700000000</begin>
      <end>1700086400</end>
    </date_range>
  </report_metadata>
  <policy_published>
    <domain>example.com</domain>
    <p>reject</p>
    <pct>100</pct>
  </policy_published>
  <record>
    <row>
      <source_ip>192.0.2.10</source_ip>
      <count>5</count>
      <policy_evaluated>
        <disposition>none</disposition>
        <dkim>pass</dkim>
        <spf>pass</spf>
      </policy_evaluated>
    </row>
    <identifiers>
      <header_from>example.com</header_from>
    </identifiers>
  </record>
</feedback>`;

const SAMPLE_BOUNCE = [
  'Final-Recipient: rfc822; bounce-user@example.com',
  'Action: failed',
  'Status: 5.1.1',
  'Diagnostic-Code: smtp; 550 5.1.1 The email account that you tried to reach does not exist',
].join('\r\n');

const SAMPLE_COMPLAINT = [
  'From: abuse@isp.example.net',
  'To: fbl@example.com',
  'Subject: FW: Abuse report',
  'MIME-Version: 1.0',
  'Content-Type: multipart/report; report-type=feedback-report; boundary="arf-boundary"',
  '',
  '--arf-boundary',
  'Content-Type: text/plain; charset="UTF-8"',
  '',
  'This is an email abuse report.',
  '',
  '--arf-boundary',
  'Content-Type: message/feedback-report',
  '',
  'Feedback-Type: abuse',
  'User-Agent: SomeGenerator/1.0',
  'Version: 1',
  'Original-Rcpt-To: complaining-user@example.net',
  'Source-IP: 192.0.2.55',
  '',
  '--arf-boundary--',
].join('\r\n');

describe('Official Hide Mail MCP Server (mcpController & mcpService)', () => {
  const keys = {};

  beforeEach(async () => {
    redisService.client.data = {};
    await redisService.initializeDomains(['hide-mail.org']);

    const types = ['suite', 'api', 'grade', 'sender', 'reports', 'bounce', 'complaint'];
    for (const type of types) {
      const license = await licenseService.createLicense({
        type,
        plan: 'monthly',
        orderReference: `order-${type}`,
        ttlSeconds: 3600,
      });
      keys[type] = await licenseService.createApiKey(license.key);
    }

    jest.spyOn(mailGradeService, 'gradeEmail').mockResolvedValue({
      score: 96,
      grade: 'A',
      summary: 'This message looks ready to send.',
      stored: false,
      findings: [{ id: 'from_present', severity: 'pass', title: 'From is present', detail: 'From sender@example.com.' }],
    });

    jest.spyOn(senderCheckService, 'checkDomain').mockImplementation(async (domain, opts) => ({
      domain,
      dkimSelector: opts?.dkimSelector || null,
      verdict: 'Ready',
      summary: `${domain} has MX, SPF, and DMARC in place.`,
      stored: false,
      records: [],
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authentication & Discovery', () => {
    it('rejects requests without an API key with 401', async () => {
      const res = createRes();
      await mcpController.handlePost(
        {
          headers: {},
          body: { jsonrpc: '2.0', id: 1, method: 'initialize' },
        },
        res,
        (err) => { throw err; }
      );

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('authenticates via X-API-Key header and handles initialize + ping + notifications/initialized', async () => {
      const initRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.suite },
          body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
        },
        initRes,
        (err) => { throw err; }
      );

      expect(initRes.statusCode).toBe(200);
      expect(initRes.body).toEqual({
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
          },
          serverInfo: {
            name: 'hide-mail-mcp',
            version: '1.0.0',
          },
        },
      });

      const pingRes = createRes();
      await mcpController.handlePost(
        {
          headers: { authorization: `Bearer ${keys.suite}` },
          body: { jsonrpc: '2.0', id: 2, method: 'ping' },
        },
        pingRes,
        (err) => { throw err; }
      );
      expect(pingRes.statusCode).toBe(200);
      expect(pingRes.body).toEqual({ jsonrpc: '2.0', id: 2, result: {} });

      const notifRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.suite },
          body: { jsonrpc: '2.0', method: 'notifications/initialized' },
        },
        notifRes,
        (err) => { throw err; }
      );
      expect(notifRes.statusCode).toBe(200);
    });

    it('supports GET /api/mcp for both JSON discovery and text/event-stream SSE', async () => {
      const jsonRes = createRes();
      await mcpController.handleGet(
        { headers: { 'x-api-key': keys.suite, accept: 'application/json' } },
        jsonRes,
        (err) => { throw err; }
      );
      expect(jsonRes.statusCode).toBe(200);
      expect(jsonRes.body.protocolVersion).toBe('2024-11-05');
      expect(jsonRes.body.serverInfo.name).toBe('hide-mail-mcp');

      const sseRes = createRes();
      await mcpController.handleGet(
        { headers: { 'x-api-key': keys.suite, accept: 'text/event-stream' } },
        sseRes,
        (err) => { throw err; }
      );
      expect(sseRes.headers['content-type']).toMatch(/text\/event-stream/);
      expect(sseRes.chunks.join('')).toContain('event: endpoint');
      expect(sseRes.ended).toBe(true);
    });
  });

  describe('tools/list & tools/call across all 10 tools', () => {
    it('lists all 10 strongly-typed tools', async () => {
      const res = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.suite },
          body: { jsonrpc: '2.0', id: 10, method: 'tools/list' },
        },
        res,
        (err) => { throw err; }
      );

      expect(res.statusCode).toBe(200);
      const toolNames = res.body.result.tools.map((t) => t.name);
      expect(toolNames).toEqual([
        'hide_mail_grade_email',
        'hide_mail_sender_check',
        'hide_mail_dmarc_report',
        'hide_mail_bounce_read',
        'hide_mail_complaint_read',
        'hide_mail_invite_read',
        'hide_mail_qa_create_mailbox',
        'hide_mail_qa_list_messages',
        'hide_mail_qa_get_message',
        'hide_mail_qa_clear_mailbox',
      ]);
      res.body.result.tools.forEach((tool) => {
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema.type).toBe('object');
      });
    });

    it('allows a suite key to call all 6 deliverability tools including gzipped DMARC reports', async () => {
      // 1. hide_mail_grade_email
      const gradeRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.suite },
          body: {
            jsonrpc: '2.0',
            id: 11,
            method: 'tools/call',
            params: {
              name: 'hide_mail_grade_email',
              arguments: { raw: 'From: a@example.com\r\nSubject: Hi\r\n\r\nBody' },
            },
          },
        },
        gradeRes,
        (err) => { throw err; }
      );
      expect(gradeRes.body.result.structuredContent.grade).toBe('A');
      expect(mailGradeService.gradeEmail).toHaveBeenCalledWith(
        'From: a@example.com\r\nSubject: Hi\r\n\r\nBody'
      );

      // 2. hide_mail_sender_check with dkimSelector
      const senderRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.suite },
          body: {
            jsonrpc: '2.0',
            id: 12,
            method: 'tools/call',
            params: {
              name: 'hide_mail_sender_check',
              arguments: { domain: 'example.com', dkimSelector: 'google' },
            },
          },
        },
        senderRes,
        (err) => { throw err; }
      );
      expect(senderRes.body.result.structuredContent.domain).toBe('example.com');
      expect(senderCheckService.checkDomain).toHaveBeenCalledWith('example.com', {
        dkimSelector: 'google',
      });

      // 3. hide_mail_dmarc_report with gzip archiveBase64
      const gzipped = zlib.gzipSync(Buffer.from(SAMPLE_DMARC_XML, 'utf8')).toString('base64');
      const dmarcSpy = jest.spyOn(dmarcReportService, 'readReport');
      const dmarcRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.suite },
          body: {
            jsonrpc: '2.0',
            id: 13,
            method: 'tools/call',
            params: {
              name: 'hide_mail_dmarc_report',
              arguments: { archiveBase64: gzipped, format: 'gzip' },
            },
          },
        },
        dmarcRes,
        (err) => { throw err; }
      );
      expect(dmarcSpy).toHaveBeenCalledWith(SAMPLE_DMARC_XML);
      expect(dmarcRes.body.result.structuredContent.domain).toBe('example.com');
      expect(dmarcRes.body.result.structuredContent.verdict).toBe('Aligned');

      // 3b. hide_mail_dmarc_report with zip archiveBase64
      const zipBuf = buildZipBuffer([
        { name: 'readme.txt', data: 'ignore me', method: 0 },
        { name: 'google.com!example.com!1700000000!1700086400.xml', data: SAMPLE_DMARC_XML, method: 8 },
      ]);
      const zipDmarcSpy = jest.spyOn(dmarcReportService, 'readReport');
      const zipDmarcRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.suite },
          body: {
            jsonrpc: '2.0',
            id: 13.5,
            method: 'tools/call',
            params: {
              name: 'hide_mail_dmarc_report',
              arguments: { archiveBase64: zipBuf.toString('base64'), format: 'zip' },
            },
          },
        },
        zipDmarcRes,
        (err) => { throw err; }
      );
      expect(zipDmarcSpy).toHaveBeenCalledWith(SAMPLE_DMARC_XML);
      expect(zipDmarcRes.body.result.structuredContent.domain).toBe('example.com');
      expect(zipDmarcRes.body.result.structuredContent.verdict).toBe('Aligned');

      // 4. hide_mail_bounce_read
      const bounceRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.suite },
          body: {
            jsonrpc: '2.0',
            id: 14,
            method: 'tools/call',
            params: {
              name: 'hide_mail_bounce_read',
              arguments: { raw: SAMPLE_BOUNCE },
            },
          },
        },
        bounceRes,
        (err) => { throw err; }
      );
      expect(bounceRes.body.result.structuredContent.verdict).toBe('hard');

      // 5. hide_mail_complaint_read
      const complaintRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.suite },
          body: {
            jsonrpc: '2.0',
            id: 15,
            method: 'tools/call',
            params: {
              name: 'hide_mail_complaint_read',
              arguments: { raw: SAMPLE_COMPLAINT },
            },
          },
        },
        complaintRes,
        (err) => { throw err; }
      );
      expect(complaintRes.body.result.structuredContent.feedbackType).toBe('abuse');

      const inviteRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.suite },
          body: {
            jsonrpc: '2.0',
            id: 16,
            method: 'tools/call',
            params: {
              name: 'hide_mail_invite_read',
              arguments: {
                raw: [
                  'BEGIN:VCALENDAR',
                  'METHOD:REQUEST',
                  'BEGIN:VEVENT',
                  'DTSTART:20261112T150000Z',
                  'SUMMARY:Design review',
                  'ORGANIZER:mailto:ada@lab.example',
                  'END:VEVENT',
                  'END:VCALENDAR',
                ].join('\n'),
              },
            },
          },
        },
        inviteRes,
        (err) => { throw err; }
      );
      expect(inviteRes.body.result.structuredContent.stamp).toBe('REQUEST');
      expect(inviteRes.body.result.structuredContent.summary).toBe('Design review');
    });

    it('rejects a zip that claims a huge uncompressed size without decompressing (zip bomb)', () => {
      const tinyPayload = Buffer.alloc(64, 0x41);
      const bomb = buildZipBuffer(
        [{ name: 'bomb.xml', data: tinyPayload, method: 8 }],
        { lieUncompressedSize: 0xffffffff }
      );

      expect(() => extractXmlFromZipBuffer(bomb)).toThrow(
        expect.objectContaining({ code: 'ARCHIVE_TOO_LARGE' })
      );

      const oversizedXml = `<feedback>${'a'.repeat(MAX_ARCHIVE_OUTPUT_BYTES + 1024)}</feedback>`;
      const oversizedZip = buildZipBuffer([{ name: 'huge.xml', data: oversizedXml, method: 8 }]);
      expect(() => extractXmlFromZipBuffer(oversizedZip)).toThrow(
        expect.objectContaining({ code: 'ARCHIVE_TOO_LARGE' })
      );
    });

    it('allows a suite or api key to run the 4 QA mailbox tools end-to-end', async () => {
      // 6. hide_mail_qa_create_mailbox
      const createMbRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.api },
          body: {
            jsonrpc: '2.0',
            id: 20,
            method: 'tools/call',
            params: {
              name: 'hide_mail_qa_create_mailbox',
              arguments: { localPart: 'e2e-bot', domain: 'hide-mail.org', ttlMinutes: 60 },
            },
          },
        },
        createMbRes,
        (err) => { throw err; }
      );
      const created = createMbRes.body.result.structuredContent;
      expect(created.address).toBe('e2e-bot@hide-mail.org');
      expect(typeof created.ttlSeconds).toBe('number');

      await redisService.storeEmail('e2e-bot@hide-mail.org', {
        id: 'msg-otp-1',
        from: 'Auth <no-reply@service.test>',
        subject: 'Your verification code is 482910',
        preview: 'Use code 482910',
        text: 'Your OTP is 482910. Click https://service.test/verify?token=abc123 to confirm.',
        html: '<p>Your OTP is 482910. <a href="https://service.test/verify?token=abc123">Confirm</a></p>',
        receivedAt: new Date().toISOString(),
        attachments: [],
      });

      // 7. hide_mail_qa_list_messages with filters
      const listRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.api },
          body: {
            jsonrpc: '2.0',
            id: 21,
            method: 'tools/call',
            params: {
              name: 'hide_mail_qa_list_messages',
              arguments: {
                address: 'e2e-bot@hide-mail.org',
                subjectContains: 'verification',
                fromContains: 'service.test',
              },
            },
          },
        },
        listRes,
        (err) => { throw err; }
      );
      expect(listRes.body.result.structuredContent.messages).toHaveLength(1);
      expect(listRes.body.result.structuredContent.messages[0].id).toBe('msg-otp-1');

      // 8. hide_mail_qa_get_message
      const getRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.api },
          body: {
            jsonrpc: '2.0',
            id: 22,
            method: 'tools/call',
            params: {
              name: 'hide_mail_qa_get_message',
              arguments: {
                address: 'e2e-bot@hide-mail.org',
                messageId: 'msg-otp-1',
              },
            },
          },
        },
        getRes,
        (err) => { throw err; }
      );
      expect(getRes.body.result.structuredContent.id).toBe('msg-otp-1');
      expect(getRes.body.result.structuredContent.otpCodes).toContain('482910');
      expect(getRes.body.result.structuredContent.verificationLinks).toContain(
        'https://service.test/verify?token=abc123'
      );

      // 9. hide_mail_qa_clear_mailbox
      const clearRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.api },
          body: {
            jsonrpc: '2.0',
            id: 23,
            method: 'tools/call',
            params: {
              name: 'hide_mail_qa_clear_mailbox',
              arguments: { address: 'e2e-bot@hide-mail.org' },
            },
          },
        },
        clearRes,
        (err) => { throw err; }
      );
      expect(clearRes.body.result.structuredContent.cleared).toBe(true);
      expect(await redisService.isMailboxActive('e2e-bot@hide-mail.org')).toBe(false);
    });

    it('enforces strict entitlement boundaries for single-tool API keys', async () => {
      // A standalone 'grade' key can call hide_mail_grade_email...
      const okRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.grade },
          body: {
            jsonrpc: '2.0',
            id: 30,
            method: 'tools/call',
            params: {
              name: 'hide_mail_grade_email',
              arguments: { raw: 'From: a@example.com\r\nSubject: Hi\r\n\r\nBody' },
            },
          },
        },
        okRes,
        (err) => { throw err; }
      );
      expect(okRes.body.result.structuredContent.grade).toBe('A');

      // ...but cannot call hide_mail_sender_check or hide_mail_qa_create_mailbox
      const deniedSenderRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.grade },
          body: {
            jsonrpc: '2.0',
            id: 31,
            method: 'tools/call',
            params: {
              name: 'hide_mail_sender_check',
              arguments: { domain: 'example.com' },
            },
          },
        },
        deniedSenderRes,
        (err) => { throw err; }
      );
      expect(deniedSenderRes.body.error.code).toBe(-32003);
      expect(deniedSenderRes.body.error.message).toMatch(/sender|suite/i);

      const deniedQaRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.sender },
          body: {
            jsonrpc: '2.0',
            id: 32,
            method: 'tools/call',
            params: {
              name: 'hide_mail_qa_create_mailbox',
              arguments: {},
            },
          },
        },
        deniedQaRes,
        (err) => { throw err; }
      );
      expect(deniedQaRes.body.error.code).toBe(-32003);
      expect(deniedQaRes.body.error.message).toMatch(/api|suite/i);
    });
  });

  describe('Resources & Prompts', () => {
    it('lists and reads hidemail://pricing/tiers and hidemail://guides/mail-grade-findings', async () => {
      const listRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.suite },
          body: { jsonrpc: '2.0', id: 40, method: 'resources/list' },
        },
        listRes,
        (err) => { throw err; }
      );
      const uris = listRes.body.result.resources.map((r) => r.uri);
      expect(uris).toEqual([
        'hidemail://pricing/tiers',
        'hidemail://guides/mail-grade-findings',
      ]);

      const tiersRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.suite },
          body: {
            jsonrpc: '2.0',
            id: 41,
            method: 'resources/read',
            params: { uri: 'hidemail://pricing/tiers' },
          },
        },
        tiersRes,
        (err) => { throw err; }
      );
      const tiersPayload = JSON.parse(tiersRes.body.result.contents[0].text);
      expect(tiersPayload.tiers.suite.gradeApi).toBe(true);
      expect(tiersPayload.pricesUsd.suite.monthly).toBe(19.99);

      const guideRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.suite },
          body: {
            jsonrpc: '2.0',
            id: 42,
            method: 'resources/read',
            params: { uri: 'hidemail://guides/mail-grade-findings' },
          },
        },
        guideRes,
        (err) => { throw err; }
      );
      const guidePayload = JSON.parse(guideRes.body.result.contents[0].text);
      expect(guidePayload.findings.from_missing).toBeDefined();
      expect(guidePayload.findings.rbl_domain).toBeDefined();
    });

    it('lists and renders all 3 deliverability prompts', async () => {
      const listRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.suite },
          body: { jsonrpc: '2.0', id: 50, method: 'prompts/list' },
        },
        listRes,
        (err) => { throw err; }
      );
      const names = listRes.body.result.prompts.map((p) => p.name);
      expect(names).toEqual([
        'audit-domain-deliverability',
        'pre-send-email-audit',
        'triage-bounce-or-complaint',
      ]);

      const promptRes = createRes();
      await mcpController.handlePost(
        {
          headers: { 'x-api-key': keys.suite },
          body: {
            jsonrpc: '2.0',
            id: 51,
            method: 'prompts/get',
            params: {
              name: 'audit-domain-deliverability',
              arguments: { domain: 'example.com', dkimSelector: 's1' },
            },
          },
        },
        promptRes,
        (err) => { throw err; }
      );
      expect(promptRes.body.result.messages[0].content.text).toContain('example.com');
      expect(promptRes.body.result.messages[0].content.text).toContain('hide_mail_sender_check');
    });
  });

  describe('Stdio CLI bridge (mcp/hide-mail-mcp.js)', () => {
    it('forwards newline-delimited JSON-RPC messages with X-API-Key and writes responses to stdout', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: '2.0',
          id: 99,
          result: { protocolVersion: '2024-11-05' },
        }),
      });

      const response = await forwardJsonRpc(
        { jsonrpc: '2.0', id: 99, method: 'initialize' },
        {
          apiKey: 'hm_live_test_key',
          baseUrl: 'https://hide-mail.org/',
          fetchImpl: fetchMock,
        }
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'https://hide-mail.org/api/mcp',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-API-Key': 'hm_live_test_key',
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(response.result.protocolVersion).toBe('2024-11-05');

      const input = new PassThrough();
      const output = new PassThrough();
      const lines = [];
      output.on('data', (chunk) => lines.push(String(chunk)));

      const bridge = createStdioBridge({
        input,
        output,
        apiKey: 'hm_live_test_key',
        baseUrl: 'https://hide-mail.org',
        fetchImpl: fetchMock,
      });

      await bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'initialize' }));
      bridge.close();

      expect(lines.join('')).toContain('"id":99');
    });
  });
});
