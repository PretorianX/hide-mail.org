/**
 * Structured catalog for the Hide Mail API Explorer & MCP Hub (/developers).
 * Centralizes all REST API endpoint contracts, request/response schemas,
 * multi-language code generators, MCP client setup configs, and MCP tool/resource/prompt definitions.
 */

export const REST_ENDPOINTS = [
  {
    id: 'grade',
    title: 'Mail Grade API',
    shortTitle: 'Mail Grade',
    category: 'Deliverability Suite',
    method: 'POST',
    path: '/api/mail-grade',
    browserPath: '/api/grade/report',
    toolPagePath: '/grade',
    mcpToolName: 'hide_mail_grade_email',
    authPlans: ['suite', 'grade'],
    rateLimit: '120 req / min',
    browserRateLimit: '20 req / 10 min',
    maxPayload: '64 KB JSON',
    summary:
      'Score a raw RFC 5322 MIME email message (0–100, letter grade A–F) across headers, SPF/DKIM/DMARC alignment, HTML spam heuristics, and live DNSBL blocklists.',
    requestFields: [
      {
        name: 'source',
        type: 'string',
        required: true,
        description:
          'Complete raw RFC 5322 MIME email source including headers (Received, Authentication-Results, From, Subject, DKIM-Signature) and body (alias: "raw").',
      },
    ],
    responseFields: [
      { name: 'report.score', type: 'number', description: 'Numeric deliverability score from 0 to 100.' },
      { name: 'report.grade', type: 'string', description: 'Letter grade stamp: A, B, C, D, or F.' },
      { name: 'report.summary', type: 'string', description: 'Human-readable verdict summary.' },
      { name: 'report.stored', type: 'boolean', description: 'Always false — messages are evaluated in memory only.' },
      {
        name: 'report.envelope',
        type: 'object',
        description:
          'Extracted envelope metadata: from, fromDomain, returnPath, replyTo, subject, messageId, contentType, sizeBytes, sendingIp, receivedHops.',
      },
      {
        name: 'report.authentication',
        type: 'object',
        description: 'Parsed SPF, DKIM, DMARC, and RFC 8058 List-Unsubscribe status.',
      },
      {
        name: 'report.deliverability',
        type: 'object',
        description: 'MIME inventory: plainTextBytes, htmlBytes, totalLinks, httpsLinks, httpLinks, imageCount, imagesMissingAlt, attachmentCount.',
      },
      {
        name: 'report.findings[]',
        type: 'array',
        description: 'List of findings with id, severity (pass|warn|fail), category, penalty, title, and detail.',
      },
    ],
    sampleRequest: {
      source: [
        'Received: from mail.example.com (mail.example.com [93.184.216.34])',
        '  by mx.hide-mail.org with ESMTPS id g9812;',
        '  Mon, 26 Oct 2026 12:00:00 +0000',
        'Authentication-Results: mx.hide-mail.org;',
        '  spf=pass smtp.mailfrom=example.com;',
        '  dkim=pass header.d=example.com header.s=s2026;',
        '  dmarc=pass (p=reject) header.from=example.com',
        'DKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=s2026; b=dGVzdA==',
        'From: Hide Mail Billing <billing@example.com>',
        'To: customer@hide-mail.org',
        'Subject: Your October invoice is ready',
        'Date: Mon, 26 Oct 2026 12:00:00 +0000',
        'Message-ID: <20261026120000.invoice-9812@example.com>',
        'List-Unsubscribe: <https://example.com/unsubscribe?id=9812>',
        'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        'Hello,',
        'Your October invoice #9812 is ready at https://example.com/billing/9812.',
      ].join('\r\n'),
    },
    sampleResponse: {
      success: true,
      report: {
        score: 96,
        grade: 'A',
        summary: 'This message looks ready to send.',
        stored: false,
        envelope: {
          from: 'Hide Mail Billing <billing@example.com>',
          fromDomain: 'example.com',
          subject: 'Your October invoice is ready',
          messageId: '<20261026120000.invoice-9812@example.com>',
          sendingIp: '93.184.216.34',
          receivedHops: 1,
        },
        authentication: {
          spf: { status: 'pass', domain: 'example.com', ip: '93.184.216.34' },
          dkim: { status: 'pass', signingDomain: 'example.com', selector: 's2026', aligned: true },
          dmarc: { status: 'pass', policy: 'reject', domain: 'example.com' },
          listUnsubscribe: { present: true, oneClick: true },
        },
        findings: [
          {
            id: 'from_present',
            severity: 'pass',
            category: 'headers',
            penalty: 0,
            title: 'From is present',
            detail: 'From billing@example.com.',
          },
          {
            id: 'dmarc_pass',
            severity: 'pass',
            category: 'authentication',
            penalty: 0,
            title: 'DMARC passed with reject policy',
            detail: 'Aligned with example.com.',
          },
        ],
      },
    },
  },
  {
    id: 'sender',
    title: 'Sender Check API',
    shortTitle: 'Sender Check',
    category: 'Deliverability Suite',
    method: 'POST',
    path: '/api/sender-check',
    browserPath: '/api/sender/report',
    toolPagePath: '/sender',
    mcpToolName: 'hide_mail_sender_check',
    authPlans: ['suite', 'sender'],
    rateLimit: '60 req / min',
    browserRateLimit: '15 req / 10 min',
    maxPayload: '16 KB JSON',
    summary:
      'Audit a sending domain across MX provider fingerprinting, recursive SPF lookup trees (RFC 7208 10-lookup limit), DMARC tag inspection, DKIM public keys, BIMI, MTA-STS, and TLS-RPT.',
    requestFields: [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'Sending domain name to inspect (e.g. "example.com").',
      },
      {
        name: 'dkimSelector',
        type: 'string',
        required: false,
        description:
          'Optional explicit DKIM selector to inspect (e.g. "google", "s1", "default"). When omitted, common selectors are probed automatically.',
      },
    ],
    responseFields: [
      { name: 'domain', type: 'string', description: 'Normalized domain name.' },
      { name: 'verdict', type: 'string', description: 'Overall policy verdict: Ready, At risk, or Exposed.' },
      { name: 'summary', type: 'string', description: 'Plain-English summary of domain readiness.' },
      { name: 'records[]', type: 'array', description: 'MX, SPF, and DMARC record statuses and parsed structures.' },
      { name: 'dkim', type: 'object', description: 'Discovered or explicit DKIM selectors with RSA/Ed25519 bit lengths.' },
      { name: 'transportAndBrand', type: 'object', description: 'BIMI, MTA-STS, and TLS-RPT record statuses.' },
      { name: 'recommendations[]', type: 'array', description: 'Prioritized DNS changes with copy-pasteable TXT records.' },
    ],
    sampleRequest: {
      domain: 'example.com',
      dkimSelector: 'google',
    },
    sampleResponse: {
      success: true,
      report: {
        domain: 'example.com',
        verdict: 'Ready',
        summary: 'Receivers can enforce a sender policy for example.com.',
        stored: false,
        records: [
          {
            id: 'mx',
            name: 'MX',
            status: 'pass',
            detail: 'Mail hosts are published: aspmx.l.google.com.',
            record: '10 aspmx.l.google.com',
            parsed: { provider: 'Google Workspace', exchangeCount: 1, nullMx: false },
          },
          {
            id: 'spf',
            name: 'SPF',
            status: 'pass',
            detail: 'SPF names the servers that may send and rejects the rest.',
            record: 'v=spf1 include:_spf.google.com -all',
            parsed: { dnsLookupCount: 1, totalDnsLookups: 3, dnsLookupLimit: 10, allQualifier: '-all' },
          },
          {
            id: 'dmarc',
            name: 'DMARC',
            status: 'pass',
            detail: 'DMARC asks receivers to reject mail that fails alignment.',
            record: 'v=DMARC1; p=reject; rua=mailto:dmarc@example.com',
          },
        ],
        dkim: {
          mode: 'explicit',
          probedSelectors: ['google'],
          selectors: [
            {
              selector: 'google',
              fqdn: 'google._domainkey.example.com',
              status: 'pass',
              keyType: 'rsa',
              keyBits: 2048,
            },
          ],
        },
        recommendations: [],
      },
    },
  },
  {
    id: 'reports',
    title: 'DMARC Reports API',
    shortTitle: 'DMARC Reports',
    category: 'Deliverability Suite',
    method: 'POST',
    path: '/api/dmarc-reports',
    browserPath: '/api/reports/read',
    toolPagePath: '/reports',
    mcpToolName: 'hide_mail_dmarc_report',
    authPlans: ['suite', 'reports'],
    rateLimit: '60 req / min',
    browserRateLimit: '20 req / 10 min',
    maxPayload: '256 KB JSON',
    summary:
      'Parse an RFC 7489 DMARC aggregate XML report (raw XML or base64-encoded .xml.gz / .zip archive) into per-source IP alignment, PTR reverse-DNS, ESP provider attribution, and disposition breakdowns.',
    requestFields: [
      {
        name: 'xml',
        type: 'string',
        required: false,
        description: 'Raw RFC 7489 DMARC aggregate report XML string (<feedback>...</feedback>). Required unless archiveBase64 is provided.',
      },
      {
        name: 'archiveBase64',
        type: 'string',
        required: false,
        description: 'Base64-encoded .xml.gz or .zip DMARC report archive (decompressed safely up to 256 KB).',
      },
      {
        name: 'format',
        type: 'string',
        required: false,
        description: 'Archive format hint when archiveBase64 is passed: "xml", "gzip", or "zip".',
      },
    ],
    responseFields: [
      { name: 'verdict', type: 'string', description: 'Report alignment verdict: Aligned, Mixed, or Failing.' },
      { name: 'domain', type: 'string', description: 'Published policy domain from <policy_published>.' },
      { name: 'orgName', type: 'string', description: 'Reporting receiver organization (e.g. google.com).' },
      { name: 'alignedPercent', type: 'number', description: 'Percentage of total messages passing DMARC alignment.' },
      { name: 'totals', type: 'object', description: 'Message volume counts: { messages, aligned, failed }.' },
      { name: 'breakdown', type: 'object', description: 'DKIM/SPF alignment counts and dispositions (none, quarantine, reject).' },
      { name: 'sources[]', type: 'array', description: 'Per-source IP rows with provider, ptrHost, count, sharePercent, dkim, spf, aligned.' },
      { name: 'recommendations[]', type: 'array', description: 'Actionable steps for unaligned or spoofing sources.' },
    ],
    sampleRequest: {
      xml: [
        '<?xml version="1.0" encoding="UTF-8" ?>',
        '<feedback>',
        '  <report_metadata>',
        '    <org_name>google.com</org_name>',
        '    <report_id>20261026-example</report_id>',
        '    <date_range><begin>1761436800</begin><end>1761523199</end></date_range>',
        '  </report_metadata>',
        '  <policy_published>',
        '    <domain>example.com</domain>',
        '    <adkim>r</adkim><aspf>r</aspf><p>quarantine</p>',
        '  </policy_published>',
        '  <record>',
        '    <row>',
        '      <source_ip>203.0.113.10</source_ip>',
        '      <count>18</count>',
        '      <policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated>',
        '    </row>',
        '    <identifiers><header_from>example.com</header_from></identifiers>',
        '  </record>',
        '</feedback>',
      ].join('\n'),
    },
    sampleResponse: {
      success: true,
      report: {
        stored: false,
        verdict: 'Aligned',
        domain: 'example.com',
        orgName: 'google.com',
        policy: 'quarantine',
        alignedPercent: 100,
        totals: { messages: 18, aligned: 18, failed: 0 },
        sources: [
          {
            sourceIp: '203.0.113.10',
            headerFrom: 'example.com',
            count: 18,
            sharePercent: 100,
            disposition: 'none',
            dkim: 'pass',
            spf: 'pass',
            aligned: true,
          },
        ],
      },
    },
  },
  {
    id: 'bounces',
    title: 'Bounce Read API',
    shortTitle: 'Bounce Read',
    category: 'Deliverability Suite',
    method: 'POST',
    path: '/api/bounce-read',
    browserPath: '/api/bounces/report',
    toolPagePath: '/bounces',
    mcpToolName: 'hide_mail_bounce_read',
    authPlans: ['suite', 'bounce'],
    rateLimit: '120 req / min',
    browserRateLimit: '20 req / 10 min',
    maxPayload: '64 KB JSON',
    summary:
      'Parse an RFC 3464 Delivery Status Notification (DSN) bounce into per-recipient hard/soft classifications, enhanced status codes (RFC 3463), ISP diagnostic fingerprints, and retry/suppression rules.',
    requestFields: [
      {
        name: 'source',
        type: 'string',
        required: true,
        description: 'Raw RFC 3464 DSN bounce message or message/delivery-status MIME payload (alias: "raw").',
      },
    ],
    responseFields: [
      { name: 'report.verdict', type: 'string', description: 'Top-level bounce classification: hard, soft, delayed, or delivered.' },
      { name: 'report.summary', type: 'string', description: 'Actionable summary for the affected recipients.' },
      { name: 'report.reportingMta', type: 'string', description: 'MTA that generated the DSN.' },
      { name: 'report.counts', type: 'object', description: 'Recipient breakdown across total, hard, soft, delayed, and delivered.' },
      {
        name: 'report.recipients[]',
        type: 'array',
        description:
          'Per-recipient entries with recipient, action, status, smtpCode, reasonCode, ispHint, class, retry, title, detail, and remediation.',
      },
      { name: 'report.originalMessage', type: 'object', description: 'Extracted original Message-ID, Subject, From, and List-Unsubscribe.' },
    ],
    sampleRequest: {
      source: [
        'Reporting-MTA: dns; mx-out.sender.example',
        'Arrival-Date: Mon, 26 Oct 2026 11:42:10 +0000',
        'Original-Envelope-Id: env-20261026-9941',
        '',
        'Final-Recipient: rfc822; ada@example.com',
        'Action: failed',
        'Status: 5.1.1',
        'Remote-MTA: dns; gmail-smtp-in.l.google.com',
        'Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist.',
      ].join('\n'),
    },
    sampleResponse: {
      success: true,
      report: {
        stored: false,
        verdict: 'hard',
        summary: 'Hard failure. Do not retry ada@example.com.',
        reportingMta: 'dns; mx-out.sender.example',
        originalEnvelopeId: 'env-20261026-9941',
        counts: { total: 1, hard: 1, soft: 0, delayed: 0, delivered: 0 },
        recipients: [
          {
            recipient: 'ada@example.com',
            action: 'failed',
            status: '5.1.1',
            smtpCode: 550,
            reasonCode: 'bad_mailbox',
            ispHint: 'Gmail',
            class: 'hard',
            retry: false,
            title: 'No such mailbox',
            detail: 'The destination mailbox does not exist. Do not retry it.',
            remediation: 'Remove ada@example.com from your active mailing list immediately.',
          },
        ],
      },
    },
  },
  {
    id: 'complaints',
    title: 'Complaint Read API',
    shortTitle: 'Complaint Read',
    category: 'Deliverability Suite',
    method: 'POST',
    path: '/api/complaint-read',
    browserPath: '/api/complaints/report',
    toolPagePath: '/complaints',
    mcpToolName: 'hide_mail_complaint_read',
    authPlans: ['suite', 'complaint'],
    rateLimit: '120 req / min',
    browserRateLimit: '20 req / 10 min',
    maxPayload: '64 KB JSON',
    summary:
      'Parse an RFC 5965 Abuse Reporting Format (ARF) feedback loop report into recipient suppression actions, original campaign headers, and structured suppression records.',
    requestFields: [
      {
        name: 'source',
        type: 'string',
        required: true,
        description: 'Raw RFC 5965 ARF feedback report message including message/feedback-report part and original email headers (alias: "raw").',
      },
    ],
    responseFields: [
      { name: 'report.stamp', type: 'string', description: 'Upper-case feedback classification stamp (e.g. ABUSE, FRAUD, AUTH-FAILURE).' },
      { name: 'report.feedbackType', type: 'string', description: 'Normalized RFC 5965 feedback-type value.' },
      { name: 'report.action', type: 'string', description: 'Recommended list action: suppress, investigate, or ignore.' },
      { name: 'report.recipient', type: 'string', description: 'Complaining recipient address from Original-Rcpt-To or To.' },
      { name: 'report.sourceIp', type: 'string', description: 'Reported sending IP address.' },
      { name: 'report.suppressionRecord', type: 'object', description: 'Ready-to-store suppression object (email, action, reason, domain, sourceIp, messageId).' },
      { name: 'report.workflow[]', type: 'array', description: 'Ordered remediation steps for your suppression pipeline.' },
    ],
    sampleRequest: {
      source: [
        'Feedback-Type: abuse',
        'User-Agent: Yahoo!-Mail-Feedback/2.0',
        'Version: 1',
        'Original-Mail-From: <news@sender.example>',
        'Original-Rcpt-To: <subscriber@example.net>',
        'Arrival-Date: Mon, 26 Oct 2026 11:30:00 +0000',
        'Source-IP: 192.0.2.1',
        'Reported-Domain: sender.example',
        'Authentication-Results: mta.example.net; dkim=pass header.d=sender.example',
        '',
        'From: Sender News <news@sender.example>',
        'To: subscriber@example.net',
        'Subject: October Product Update',
        'Message-ID: <campaign-42@sender.example>',
      ].join('\n'),
    },
    sampleResponse: {
      success: true,
      report: {
        stored: false,
        stamp: 'ABUSE',
        feedbackType: 'abuse',
        action: 'suppress',
        actionLabel: 'Remove this address from the list.',
        recipient: 'subscriber@example.net',
        mailFrom: 'news@sender.example',
        sourceIp: '192.0.2.1',
        reportedDomain: 'sender.example',
        suppressionRecord: {
          email: 'subscriber@example.net',
          action: 'suppress',
          reason: 'arf_abuse',
          domain: 'sender.example',
          sourceIp: '192.0.2.1',
          messageId: '<campaign-42@sender.example>',
        },
        workflow: [
          'Immediately add subscriber@example.net to your global suppression list.',
        ],
      },
    },
  },
  {
    id: 'qa',
    title: 'QA Mailbox & Webhook API',
    shortTitle: 'QA Mailboxes',
    category: 'QA Automation',
    method: 'POST',
    path: '/api/qa/mailboxes',
    browserPath: null,
    toolPagePath: '/pro',
    mcpToolName: 'hide_mail_qa_create_mailbox',
    authPlans: ['suite', 'api'],
    rateLimit: '100 req / min',
    browserRateLimit: null,
    maxPayload: '32 KB JSON',
    summary:
      'Create disposable QA inboxes on the fly, list and inspect incoming test emails, extract OTP codes, and register HTTPS webhooks for CI/CD and Playwright/Cypress suites.',
    subRoutes: [
      { method: 'POST', path: '/api/qa/mailboxes', description: 'Create & claim a disposable QA mailbox.' },
      { method: 'GET', path: '/api/qa/mailboxes/:email/messages', description: 'List messages received in the QA mailbox.' },
      { method: 'GET', path: '/api/qa/mailboxes/:email/messages/:id', description: 'Fetch full message body, headers, and attachment metadata.' },
      { method: 'GET', path: '/api/qa/mailboxes/:email/messages/:id/attachments/:index', description: 'Download a specific MIME attachment by index.' },
      { method: 'PUT', path: '/api/qa/mailboxes/:email/webhook', description: 'Register a public HTTPS webhook URL for instant message push.' },
      { method: 'DELETE', path: '/api/qa/mailboxes/:email', description: 'Deactivate the QA mailbox and purge its messages.' },
    ],
    requestFields: [
      {
        name: 'alias',
        type: 'string',
        required: false,
        description: 'Optional custom local-part alias (lowercase letters, digits, dots, underscores, hyphens). Random qa* local-part if omitted.',
      },
      {
        name: 'domain',
        type: 'string',
        required: false,
        description: 'Optional domain from allowed Hide Mail domains (including premium domains for licensed keys).',
      },
      {
        name: 'ttlSeconds',
        type: 'number',
        required: false,
        description: 'Optional mailbox lifetime in seconds (up to 30 days for API / Suite plans).',
      },
    ],
    responseFields: [
      { name: 'success', type: 'boolean', description: 'True when the mailbox is provisioned.' },
      { name: 'data.email', type: 'string', description: 'Full disposable QA email address.' },
      { name: 'data.ttlSeconds', type: 'number', description: 'Granted time-to-live in seconds.' },
    ],
    sampleRequest: {
      alias: 'ci-signup-test',
      ttlSeconds: 86400,
    },
    sampleResponse: {
      success: true,
      data: {
        email: 'ci-signup-test@hide-mail.org',
        ttlSeconds: 86400,
      },
    },
  },
];

export const generateCodeSnippet = (endpoint, language, apiKey = 'hm_live_...', requestBodyString = '') => {
  const effectiveKey = (apiKey && apiKey.trim()) || 'hm_live_...';
  const url = `https://hide-mail.org${endpoint.path}`;
  let parsedBody = endpoint.sampleRequest;
  if (requestBodyString) {
    try {
      parsedBody = JSON.parse(requestBodyString);
    } catch {
      parsedBody = endpoint.sampleRequest;
    }
  }
  const compactJson = JSON.stringify(parsedBody);
  const prettyJson = JSON.stringify(parsedBody, null, 2);

  if (language === 'javascript') {
    return [
      `const response = await fetch('${url}', {`,
      `  method: '${endpoint.method}',`,
      `  headers: {`,
      `    'Authorization': 'Bearer ${effectiveKey}',`,
      `    'Content-Type': 'application/json',`,
      `  },`,
      `  body: JSON.stringify(${prettyJson.replace(/\n/g, '\n  ')}),`,
      `});`,
      ``,
      `const result = await response.json();`,
      `console.log(result);`,
    ].join('\n');
  }

  if (language === 'python') {
    const convertJsonToPython = (obj, indent = 0) => {
      const indentStr = '    '.repeat(indent);
      const innerIndentStr = '    '.repeat(indent + 1);
      
      if (obj === null) return 'None';
      if (obj === true) return 'True';
      if (obj === false) return 'False';
      if (typeof obj === 'string') return JSON.stringify(obj);
      if (typeof obj === 'number') return String(obj);
      
      if (Array.isArray(obj)) {
        if (obj.length === 0) return '[]';
        const items = obj.map(item => `${innerIndentStr}${convertJsonToPython(item, indent + 1)}`);
        return `[\n${items.join(',\n')}\n${indentStr}]`;
      }
      
      if (typeof obj === 'object') {
        const keys = Object.keys(obj);
        if (keys.length === 0) return '{}';
        const items = keys.map(key => 
          `${innerIndentStr}${JSON.stringify(key)}: ${convertJsonToPython(obj[key], indent + 1)}`
        );
        return `{\n${items.join(',\n')}\n${indentStr}}`;
      }
      
      return String(obj);
    };
    
    const pythonDict = convertJsonToPython(parsedBody, 1).replace(/\n/g, '\n    ');
    
    return [
      `import requests`,
      ``,
      `response = requests.post(`,
      `    "${url}",`,
      `    headers={`,
      `        "Authorization": "Bearer ${effectiveKey}",`,
      `        "Content-Type": "application/json",`,
      `    },`,
      `    json=${pythonDict},`,
      `    timeout=15,`,
      `)`,
      `print(response.status_code, response.json())`,
    ].join('\n');
  }

  // Default: curl
  return [
    `curl -X ${endpoint.method} ${url} \\`,
    `  -H "Authorization: Bearer ${effectiveKey}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${compactJson.replace(/'/g, "'\\''")}'`,
  ].join('\n');
};

export const MCP_CLIENT_CONFIGS = [
  {
    id: 'claude',
    label: 'Claude Desktop / Claude Code',
    fileHint: 'claude_desktop_config.json or .mcp.json',
    buildConfig: (apiKey) =>
      JSON.stringify(
        {
          mcpServers: {
            'hide-mail': {
              url: 'https://hide-mail.org/api/mcp',
              headers: {
                'X-API-Key': (apiKey && apiKey.trim()) || 'hm_live_...',
              },
            },
          },
        },
        null,
        2
      ),
  },
  {
    id: 'cursor',
    label: 'Cursor',
    fileHint: '.cursor/mcp.json',
    buildConfig: (apiKey) =>
      JSON.stringify(
        {
          mcpServers: {
            'hide-mail': {
              url: 'https://hide-mail.org/api/mcp',
              headers: {
                'X-API-Key': (apiKey && apiKey.trim()) || 'hm_live_...',
              },
            },
          },
        },
        null,
        2
      ),
  },
  {
    id: 'antigravity',
    label: 'Google Antigravity',
    fileHint: 'mcp_config.json',
    buildConfig: (apiKey) =>
      JSON.stringify(
        {
          mcpServers: {
            'hide-mail': {
              serverUrl: 'https://hide-mail.org/api/mcp',
              headers: {
                'X-API-Key': (apiKey && apiKey.trim()) || 'hm_live_...',
              },
            },
          },
        },
        null,
        2
      ),
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    fileHint: '~/.codeium/windsurf/mcp_config.json',
    buildConfig: (apiKey) =>
      JSON.stringify(
        {
          mcpServers: {
            'hide-mail': {
              serverUrl: 'https://hide-mail.org/api/mcp',
              headers: {
                'X-API-Key': (apiKey && apiKey.trim()) || 'hm_live_...',
              },
            },
          },
        },
        null,
        2
      ),
  },
  {
    id: 'stdio',
    label: 'Local Stdio CLI Bridge',
    fileHint: 'mcp/hide-mail-mcp.js (Node 18+)',
    buildConfig: (apiKey) =>
      JSON.stringify(
        {
          mcpServers: {
            'hide-mail-stdio': {
              command: 'node',
              args: ['./mcp/hide-mail-mcp.js'],
              env: {
                HIDE_MAIL_API_KEY: (apiKey && apiKey.trim()) || 'hm_live_...',
                HIDE_MAIL_BASE_URL: 'https://hide-mail.org',
              },
            },
          },
        },
        null,
        2
      ),
  },
];

export const MCP_TOOLS = [
  {
    name: 'hide_mail_grade_email',
    category: 'Deliverability Suite',
    requiredPlans: ['suite', 'grade'],
    restEndpointId: 'grade',
    description:
      'Score a raw RFC 5322 MIME email message (0–100, letter grade A–F) across headers, SPF/DKIM/DMARC authentication, HTML heuristics, and DNSBL reputation.',
    inputSchema: {
      type: 'object',
      properties: {
        raw: {
          type: 'string',
          description: 'Raw RFC 5322 MIME email source including headers and body.',
        },
      },
      required: ['raw'],
    },
    sampleCall: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'hide_mail_grade_email',
        arguments: {
          raw: 'From: Billing <billing@example.com>\r\nTo: user@hide-mail.org\r\nSubject: Your October invoice\r\nDate: Mon, 26 Oct 2026 12:00:00 +0000\r\nMessage-ID: <inv-1@example.com>\r\n\r\nHello, your invoice is ready.',
        },
      },
    },
  },
  {
    name: 'hide_mail_sender_check',
    category: 'Deliverability Suite',
    requiredPlans: ['suite', 'sender'],
    restEndpointId: 'sender',
    description:
      'Audit a sending domain for MX, SPF, DMARC, and optional DKIM selector readiness.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Sending domain to inspect (e.g. example.com).',
        },
        dkimSelector: {
          type: 'string',
          description: 'Optional DKIM selector to inspect (e.g. default, google, s1).',
        },
      },
      required: ['domain'],
    },
    sampleCall: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'hide_mail_sender_check',
        arguments: {
          domain: 'example.com',
          dkimSelector: 'google',
        },
      },
    },
  },
  {
    name: 'hide_mail_dmarc_report',
    category: 'Deliverability Suite',
    requiredPlans: ['suite', 'reports'],
    restEndpointId: 'reports',
    description:
      'Parse an RFC 7489 DMARC aggregate XML report (raw XML or base64-encoded gzip/zip archive) into a source-by-source alignment summary.',
    inputSchema: {
      type: 'object',
      properties: {
        xml: {
          type: 'string',
          description: 'Raw RFC 7489 DMARC aggregate XML string.',
        },
        archiveBase64: {
          type: 'string',
          description: 'Base64-encoded DMARC aggregate report archive (e.g. .xml.gz or .zip).',
        },
        format: {
          type: 'string',
          enum: ['xml', 'gzip', 'zip'],
          description: 'Input format when archiveBase64 is supplied.',
        },
      },
    },
    sampleCall: {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'hide_mail_dmarc_report',
        arguments: {
          xml: '<feedback><report_metadata><org_name>google.com</org_name><report_id>rpt-1</report_id></report_metadata><policy_published><domain>example.com</domain><p>reject</p></policy_published><record><row><source_ip>203.0.113.10</source_ip><count>5</count><policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated></row><identifiers><header_from>example.com</header_from></identifiers></record></feedback>',
        },
      },
    },
  },
  {
    name: 'hide_mail_bounce_read',
    category: 'Deliverability Suite',
    requiredPlans: ['suite', 'bounce'],
    restEndpointId: 'bounces',
    description:
      'Parse an RFC 3464 delivery status notification (DSN) bounce into per-recipient hard/soft verdicts and retry guidance.',
    inputSchema: {
      type: 'object',
      properties: {
        raw: {
          type: 'string',
          description: 'Raw RFC 3464 DSN bounce email or message/delivery-status part.',
        },
      },
      required: ['raw'],
    },
    sampleCall: {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'hide_mail_bounce_read',
        arguments: {
          raw: 'Final-Recipient: rfc822; ada@example.com\nAction: failed\nStatus: 5.1.1\nDiagnostic-Code: smtp; 550 5.1.1 user unknown',
        },
      },
    },
  },
  {
    name: 'hide_mail_complaint_read',
    category: 'Deliverability Suite',
    requiredPlans: ['suite', 'complaint'],
    restEndpointId: 'complaints',
    description:
      'Parse an RFC 5965 Abuse Reporting Format (ARF) feedback loop message into recipient suppression actions.',
    inputSchema: {
      type: 'object',
      properties: {
        raw: {
          type: 'string',
          description: 'Raw RFC 5965 ARF feedback report message.',
        },
      },
      required: ['raw'],
    },
    sampleCall: {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'hide_mail_complaint_read',
        arguments: {
          raw: 'Feedback-Type: abuse\nOriginal-Rcpt-To: <subscriber@example.net>\nSource-IP: 192.0.2.1\nReported-Domain: sender.example',
        },
      },
    },
  },
  {
    name: 'hide_mail_qa_create_mailbox',
    category: 'QA Mailboxes',
    requiredPlans: ['suite', 'api'],
    restEndpointId: 'qa',
    description:
      'Create and claim a disposable QA mailbox for automated E2E email and OTP testing.',
    inputSchema: {
      type: 'object',
      properties: {
        localPart: {
          type: 'string',
          description: 'Optional custom local-part alias (lowercase letters, digits, dots, underscores, hyphens).',
        },
        domain: {
          type: 'string',
          description: 'Optional domain from allowed Hide Mail domains.',
        },
        ttlMinutes: {
          type: 'number',
          description: 'Optional mailbox lifetime in minutes.',
        },
      },
    },
    sampleCall: {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'hide_mail_qa_create_mailbox',
        arguments: {
          localPart: 'e2e-agent-check',
          ttlMinutes: 60,
        },
      },
    },
  },
  {
    name: 'hide_mail_qa_list_messages',
    category: 'QA Mailboxes',
    requiredPlans: ['suite', 'api'],
    restEndpointId: 'qa',
    description:
      'List received messages in a QA mailbox with optional case-insensitive subject and sender filters.',
    inputSchema: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Full QA mailbox email address.',
        },
        subjectContains: {
          type: 'string',
          description: 'Optional case-insensitive substring filter for Subject.',
        },
        fromContains: {
          type: 'string',
          description: 'Optional case-insensitive substring filter for From.',
        },
      },
      required: ['address'],
    },
    sampleCall: {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'hide_mail_qa_list_messages',
        arguments: {
          address: 'e2e-agent-check@hide-mail.org',
          subjectContains: 'verification',
        },
      },
    },
  },
  {
    name: 'hide_mail_qa_get_message',
    category: 'QA Mailboxes',
    requiredPlans: ['suite', 'api'],
    restEndpointId: 'qa',
    description:
      'Fetch a specific message by ID from a QA mailbox, including extracted OTP codes and verification links.',
    inputSchema: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Full QA mailbox email address.',
        },
        messageId: {
          type: 'string',
          description: 'Message ID to retrieve.',
        },
      },
      required: ['address', 'messageId'],
    },
    sampleCall: {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'hide_mail_qa_get_message',
        arguments: {
          address: 'e2e-agent-check@hide-mail.org',
          messageId: 'msg-12345',
        },
      },
    },
  },
  {
    name: 'hide_mail_qa_clear_mailbox',
    category: 'QA Mailboxes',
    requiredPlans: ['suite', 'api'],
    restEndpointId: 'qa',
    description:
      'Delete all messages in a QA mailbox and deactivate its lease.',
    inputSchema: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Full QA mailbox email address to clear.',
        },
      },
      required: ['address'],
    },
    sampleCall: {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'hide_mail_qa_clear_mailbox',
        arguments: {
          address: 'e2e-agent-check@hide-mail.org',
        },
      },
    },
  },
];

export const MCP_RESOURCES = [
  {
    uri: 'hidemail://pricing/tiers',
    name: 'Hide Mail Pricing & Entitlement Matrix',
    mimeType: 'application/json',
    description:
      'Live pricing and entitlement matrix across Free, Pro, QA API, Deliverability Suite, and standalone tool plans.',
    sampleRead: {
      jsonrpc: '2.0',
      id: 10,
      method: 'resources/read',
      params: {
        uri: 'hidemail://pricing/tiers',
      },
    },
  },
  {
    uri: 'hidemail://guides/mail-grade-findings',
    name: 'Mail Grade Findings Remediation Guide',
    mimeType: 'application/json',
    description:
      'Remediation guide for all 31 Mail Grade finding IDs across headers, authentication, HTML heuristics, and DNSBL reputation.',
    sampleRead: {
      jsonrpc: '2.0',
      id: 11,
      method: 'resources/read',
      params: {
        uri: 'hidemail://guides/mail-grade-findings',
      },
    },
  },
];

export const MCP_PROMPTS = [
  {
    name: 'audit-domain-deliverability',
    description:
      'Audit MX, SPF, DKIM, and DMARC records for a sending domain and produce copy-pasteable DNS records.',
    arguments: [
      { name: 'domain', required: true, description: 'Domain name to audit (e.g. example.com)' },
      { name: 'dkimSelector', required: false, description: 'Optional DKIM selector to inspect (e.g. google, default, s1)' },
    ],
    sampleGet: {
      jsonrpc: '2.0',
      id: 12,
      method: 'prompts/get',
      params: {
        name: 'audit-domain-deliverability',
        arguments: {
          domain: 'example.com',
          dkimSelector: 'google',
        },
      },
    },
  },
  {
    name: 'pre-send-email-audit',
    description:
      'Audit a raw RFC 5322 email message and its From domain before sending a campaign.',
    arguments: [
      { name: 'rawEmail', required: true, description: 'Raw RFC 5322 MIME email source including headers and body' },
    ],
    sampleGet: {
      jsonrpc: '2.0',
      id: 13,
      method: 'prompts/get',
      params: {
        name: 'pre-send-email-audit',
        arguments: {
          rawEmail: 'From: Billing <billing@example.com>\r\nSubject: Invoice\r\n\r\nHello',
        },
      },
    },
  },
  {
    name: 'triage-bounce-or-complaint',
    description:
      'Classify a raw DSN bounce or ARF feedback loop complaint and output suppression/retry actions.',
    arguments: [
      { name: 'rawPayload', required: true, description: 'Raw RFC 3464 DSN bounce or RFC 5965 ARF complaint payload' },
    ],
    sampleGet: {
      jsonrpc: '2.0',
      id: 14,
      method: 'prompts/get',
      params: {
        name: 'triage-bounce-or-complaint',
        arguments: {
          rawPayload: 'Final-Recipient: rfc822; ada@example.com\nAction: failed\nStatus: 5.1.1',
        },
      },
    },
  },
];

export const MCP_RPC_PRESETS = [
  {
    id: 'initialize',
    label: 'initialize',
    payload: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'hide-mail-explorer', version: '1.0.0' },
      },
    },
  },
  {
    id: 'tools/list',
    label: 'tools/list',
    payload: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    },
  },
  {
    id: 'resources/list',
    label: 'resources/list',
    payload: {
      jsonrpc: '2.0',
      id: 3,
      method: 'resources/list',
      params: {},
    },
  },
  {
    id: 'prompts/list',
    label: 'prompts/list',
    payload: {
      jsonrpc: '2.0',
      id: 4,
      method: 'prompts/list',
      params: {},
    },
  },
];

export const OPENAPI_SPEC_PATH = '/api/openapi.json';
export const SWAGGER_UI_PATH = '/api/docs';

export const buildClientOpenApiSpec = (baseUrl = 'https://hide-mail.org') => {
  const paths = {};
  REST_ENDPOINTS.forEach((ep) => {
    const properties = {};
    const required = [];
    ep.requestFields.forEach((field) => {
      properties[field.name] = {
        type: field.type,
        description: field.description,
      };
      if (field.required) {
        required.push(field.name);
      }
    });

    paths[ep.path] = {
      [ep.method.toLowerCase()]: {
        tags: [ep.category],
        summary: ep.title,
        description: ep.summary,
        requestBody: {
          required: required.length > 0,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                ...(required.length ? { required } : {}),
                properties,
              },
              example: ep.sampleRequest,
            },
          },
        },
        responses: {
          200: {
            description: `${ep.title} response`,
            content: {
              'application/json': {
                example: ep.sampleResponse,
              },
            },
          },
        },
      },
    };
  });

  paths['/api/mcp'] = {
    get: {
      tags: ['Model Context Protocol (MCP)'],
      summary: 'Discover MCP protocol version, capabilities, and SSE stream',
      responses: { 200: { description: 'MCP discovery metadata' } },
    },
    post: {
      tags: ['Model Context Protocol (MCP)'],
      summary: 'Execute an MCP JSON-RPC 2.0 request (initialize, tools/list, tools/call, resources/*, prompts/*)',
      responses: { 200: { description: 'JSON-RPC 2.0 response envelope' } },
    },
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'Hide Mail Deliverability Suite, QA Mailbox & MCP API',
      version: '2.0.0',
      summary:
        'Stateless email deliverability diagnostics, disposable QA mailboxes, and Model Context Protocol (MCP) JSON-RPC 2.0 server.',
    },
    servers: [{ url: baseUrl, description: 'Hide Mail Production API' }],
    components: {
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'hm_api_...' },
        ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
    },
    security: [{ BearerAuth: [] }, { ApiKeyHeader: [] }],
    paths,
  };
};

