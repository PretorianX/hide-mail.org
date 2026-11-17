/**
 * Official OpenAPI 3.1.0 Specification & Swagger UI builder for Hide Mail.
 * Covers all 6 Deliverability Suite APIs, QA Mailbox & Webhook REST APIs,
 * Model Context Protocol (MCP) endpoints, and Billing/License key endpoints.
 */

const OPENAPI_VERSION = '3.1.0';
const MCP_TOOL_NAMES = [
  'hide_mail_grade_email',
  'hide_mail_sender_check',
  'hide_mail_dmarc_report',
  'hide_mail_bounce_read',
  'hide_mail_complaint_read',
  'hide_mail_tls_report',
  'hide_mail_qa_create_mailbox',
  'hide_mail_qa_list_messages',
  'hide_mail_qa_get_message',
  'hide_mail_qa_clear_mailbox',
];

const buildOpenApiSpec = (options = {}) => {
  const baseUrl = String(options.baseUrl || 'https://hide-mail.org').replace(/\/+$/, '');
  const mcpToolNames = MCP_TOOL_NAMES;

  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: 'Hide Mail Deliverability Suite, QA Mailbox & MCP API',
      version: '2.0.0',
      summary:
        'Stateless email deliverability diagnostics (Mail Grade, Sender Check, DMARC Reports, Bounce Read, Complaint Read, TLS Reports), disposable QA mailboxes, and Model Context Protocol (MCP) JSON-RPC 2.0 server.',
      description: [
        'Authenticate with `Authorization: Bearer hm_api_...` or `X-API-Key: hm_api_...`.',
        '',
        '### Plan Entitlements',
        '- **Deliverability Suite (`suite`, $19.99/mo)**: Unlocks all 6 deliverability APIs, QA Mailboxes & Webhooks, Pro Inbox, and all 10 MCP tools with a single API key.',
        '- **QA API (`api`, $7.99/mo)**: Unlocks `/api/qa/*` endpoints and QA MCP tools.',
        '- **Standalone Tool Keys (`grade`, `sender`, `reports`, `bounce`, `complaint`, `tls`)**: Unlock that specific tool endpoint and its corresponding MCP tool.',
      ].join('\n'),
      contact: {
        name: 'Hide Mail Developer Support',
        url: `${baseUrl}/developers`,
      },
    },
    servers: [
      {
        url: baseUrl,
        description: 'Hide Mail Server',
      },
    ],
    tags: [
      {
        name: 'Deliverability Suite',
        description:
          'Stateless RFC 5322, DNS (MX/SPF/DKIM/DMARC/BIMI/MTA-STS), RFC 7489 DMARC XML, RFC 3464 DSN bounce, RFC 5965 ARF complaint, and RFC 8460 SMTP TLS report analysis.',
      },
      {
        name: 'QA Mailboxes',
        description:
          'Disposable QA inboxes, message listing, OTP/verification extraction, attachment downloads, and HTTPS webhook registration.',
      },
      {
        name: 'Model Context Protocol (MCP)',
        description:
          'Streamable HTTP JSON-RPC 2.0 endpoint (`POST /api/mcp`) and SSE/JSON server discovery (`GET /api/mcp`) for AI coding agents.',
      },
      {
        name: 'Billing & Licenses',
        description: 'Plan catalog, license validation, and `hm_api_...` bearer key issuance.',
      },
      {
        name: 'Outbound Sending',
        description:
          'Operator accounts (`outbound` licence) that register sending domains, publish DKIM/Return-Path/DMARC DNS records, and watch domain verification state.',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'hm_api_...',
          description: 'API key issued from a Suite, QA API, or standalone tool license (`Authorization: Bearer hm_api_...`).',
        },
        ApiKeyHeader: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key passed via `X-API-Key: hm_api_...` header.',
        },
        LicenseKeyHeader: {
          type: 'apiKey',
          in: 'header',
          name: 'X-License-Key',
          description: 'Outbound operator licence key (`HM-XXXX-XXXX-XXXX-XXXX`), passed via `X-License-Key` header (or `Authorization: Bearer ...`). Management-only — never used to authenticate a send.',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Invalid or expired API key' },
            code: { type: 'string', example: 'API_KEY_INVALID' },
          },
        },
        MailGradeRequest: {
          type: 'object',
          required: ['source'],
          properties: {
            source: {
              type: 'string',
              description: 'Complete raw RFC 5322 MIME email source including headers and body (alias: `raw`).',
              example:
                'From: Hide Mail Billing <billing@example.com>\r\nTo: user@hide-mail.org\r\nSubject: Your October invoice\r\nDate: Mon, 26 Oct 2026 12:00:00 +0000\r\nMessage-ID: <inv-9812@example.com>\r\n\r\nHello, your invoice is ready.',
            },
          },
        },
        MailGradeResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            report: {
              type: 'object',
              properties: {
                score: { type: 'integer', minimum: 0, maximum: 100, example: 96 },
                grade: { type: 'string', enum: ['A', 'B', 'C', 'D', 'F'], example: 'A' },
                summary: { type: 'string', example: 'This message looks ready to send.' },
                stored: { type: 'boolean', example: false },
                envelope: { type: 'object' },
                authentication: { type: 'object' },
                deliverability: { type: 'object' },
                findings: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', example: 'from_present' },
                      severity: { type: 'string', enum: ['pass', 'warn', 'fail'] },
                      category: { type: 'string', example: 'headers' },
                      penalty: { type: 'number', example: 0 },
                      title: { type: 'string' },
                      detail: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        DomainAddRequest: {
          type: 'object',
          required: ['domain'],
          properties: {
            domain: {
              type: 'string',
              description: 'Sending domain to register (lowercased, trailing dot stripped).',
              example: 'example.com',
            },
          },
        },
        DomainRecord: {
          type: 'object',
          properties: {
            id: { type: 'string', enum: ['dkim', 'returnPath', 'spf', 'dmarc'] },
            type: { type: 'string', enum: ['TXT', 'CNAME'] },
            host: { type: 'string', example: 'hm-4f2a9c3d._domainkey.example.com' },
            expected: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['pass', 'fail'] },
            reason: { type: 'string', nullable: true },
          },
        },
        DomainResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            domain: { type: 'string', example: 'example.com' },
            selector: { type: 'string', example: 'hm-4f2a9c3d' },
            state: { type: 'string', enum: ['pending', 'verified', 'broken'], example: 'pending' },
            records: { type: 'array', items: { $ref: '#/components/schemas/DomainRecord' } },
          },
        },
        DomainListResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            domains: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  domain: { type: 'string', example: 'example.com' },
                  state: { type: 'string', enum: ['pending', 'verified', 'broken'] },
                  suspended: { type: 'boolean' },
                  dailyLimit: { type: 'integer', nullable: true },
                  selector: { type: 'string', example: 'hm-4f2a9c3d' },
                  records: { type: 'array', items: { $ref: '#/components/schemas/DomainRecord' } },
                  lastCheckedAt: { type: 'integer', nullable: true },
                },
              },
            },
          },
        },
        SendKeyCreateRequest: {
          type: 'object',
          required: ['name'],
          properties: {
            name: {
              type: 'string',
              description: 'Caller-chosen label for this send key (used to list/revoke it later).',
              example: 'production',
            },
          },
        },
        SendKeyCreateResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            key: {
              type: 'string',
              description: 'Raw send key, returned once. Use as `Authorization: Bearer <key>` on the Send API.',
              example: 'hm_send_1a2b3c...',
            },
            name: { type: 'string', example: 'production' },
            createdAt: { type: 'integer', example: 1732000000000 },
          },
        },
        SendKeyListResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            sendKeys: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'production' },
                  createdAt: { type: 'integer', example: 1732000000000 },
                  maskedKey: { type: 'string', example: '****9f3a' },
                },
              },
            },
          },
        },
        MetricsTokenRotateResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            key: {
              type: 'string',
              description: 'Raw metrics token, returned once. Use as `Authorization: Bearer <key>` on GET /api/outbound/metrics.',
              example: 'hm_metrics_1a2b3c...',
            },
            createdAt: { type: 'integer', example: 1732000000000 },
            scrapeConfig: { type: 'object' },
          },
        },
        MetricsTokenMetaResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            createdAt: { type: 'integer', example: 1732000000000 },
            maskedKey: { type: 'string', example: '****9f3a' },
            tokenPresent: { type: 'boolean', example: true },
            scrapeConfig: { type: 'object' },
          },
        },
        OutboundMessageCreateRequest: {
          type: 'object',
          required: ['from', 'to'],
          properties: {
            from: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string', format: 'email', example: 'billing@mail.example.com' },
                name: { type: 'string', example: 'Example Accounting' },
              },
            },
            to: { type: 'string', format: 'email', example: 'client@example.org' },
            subject: { type: 'string' },
            text: { type: 'string' },
            html: { type: 'string' },
            replyTo: { type: 'string', format: 'email' },
            reference: { type: 'string' },
          },
        },
        OutboundMessageQueuedResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            id: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['queued'], example: 'queued' },
          },
        },
        OutboundAccountSummaryResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            ratePerMinute: {
              type: 'integer',
              description: 'Per-account send rate limit (messages per UTC minute). Not a daily cap.',
              example: 600,
            },
            domains: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  domain: { type: 'string' },
                  state: { type: 'string' },
                  suspended: { type: 'boolean' },
                  dailyLimit: { type: 'integer', nullable: true },
                  sentToday: { type: 'integer' },
                  delivered: { type: 'integer' },
                  deferred: { type: 'integer' },
                  bounced: { type: 'integer' },
                  delivered24h: { type: 'integer' },
                  deferred24h: { type: 'integer' },
                  bounced24h: { type: 'integer' },
                  delivered7d: { type: 'integer' },
                  deferred7d: { type: 'integer' },
                  bounced7d: { type: 'integer' },
                },
              },
            },
          },
        },
        OutboundActivityResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            messages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  accountId: { type: 'string' },
                  domain: { type: 'string' },
                  recipient: { type: 'string' },
                  reference: { type: 'string', nullable: true },
                  subject: { type: 'string', nullable: true },
                  from: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      name: { type: 'string', nullable: true },
                      email: { type: 'string' },
                    },
                  },
                  envelopeFrom: { type: 'string', nullable: true },
                  clientIp: { type: 'string', nullable: true },
                  sendKeyName: { type: 'string', nullable: true },
                  status: { type: 'string' },
                  createdAt: { type: 'integer' },
                  lastEventAt: { type: 'integer', nullable: true },
                  lastResponse: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        SenderCheckRequest: {
          type: 'object',
          required: ['domain'],
          properties: {
            domain: {
              type: 'string',
              description: 'Sending domain name to audit.',
              example: 'example.com',
            },
            dkimSelector: {
              type: 'string',
              description: 'Optional explicit DKIM selector to inspect (e.g. google, default, s1).',
              example: 'google',
            },
          },
        },
        SenderCheckResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            report: {
              type: 'object',
              properties: {
                domain: { type: 'string', example: 'example.com' },
                verdict: { type: 'string', enum: ['Ready', 'At risk', 'Exposed'], example: 'Ready' },
                summary: { type: 'string' },
                stored: { type: 'boolean', example: false },
                records: { type: 'array', items: { type: 'object' } },
                dkim: { type: 'object' },
                transportAndBrand: { type: 'object' },
                recommendations: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
        DmarcReportRequest: {
          type: 'object',
          properties: {
            xml: {
              type: 'string',
              description: 'Raw RFC 7489 DMARC aggregate XML string (<feedback>...</feedback>).',
              example:
                '<?xml version="1.0"?><feedback><report_metadata><org_name>google.com</org_name><report_id>rpt-1</report_id></report_metadata><policy_published><domain>example.com</domain><p>reject</p></policy_published><record><row><source_ip>203.0.113.10</source_ip><count>5</count><policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated></row><identifiers><header_from>example.com</header_from></identifiers></record></feedback>',
            },
            archiveBase64: {
              type: 'string',
              description: 'Base64-encoded .xml.gz or .zip DMARC aggregate archive (max 256 KB uncompressed).',
            },
            format: {
              type: 'string',
              enum: ['xml', 'gzip', 'zip'],
              description: 'Archive format hint when archiveBase64 is supplied.',
            },
          },
        },
        DmarcReportResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            report: {
              type: 'object',
              properties: {
                stored: { type: 'boolean', example: false },
                verdict: { type: 'string', enum: ['Aligned', 'Mixed', 'Failing'], example: 'Aligned' },
                domain: { type: 'string', example: 'example.com' },
                orgName: { type: 'string', example: 'google.com' },
                policy: { type: 'string', example: 'reject' },
                alignedPercent: { type: 'number', example: 100 },
                totals: {
                  type: 'object',
                  properties: {
                    messages: { type: 'integer' },
                    aligned: { type: 'integer' },
                    failed: { type: 'integer' },
                  },
                },
                sources: { type: 'array', items: { type: 'object' } },
                recommendations: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
        BounceReadRequest: {
          type: 'object',
          required: ['source'],
          properties: {
            source: {
              type: 'string',
              description: 'Raw RFC 3464 DSN bounce email or message/delivery-status payload (alias: `raw`).',
              example:
                'Reporting-MTA: dns; mx.sender.example\r\n\r\nFinal-Recipient: rfc822; ada@example.com\r\nAction: failed\r\nStatus: 5.1.1\r\nDiagnostic-Code: smtp; 550 5.1.1 user unknown',
            },
          },
        },
        BounceReadResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            report: {
              type: 'object',
              properties: {
                stored: { type: 'boolean', example: false },
                verdict: { type: 'string', enum: ['hard', 'soft', 'delayed', 'delivered'], example: 'hard' },
                summary: { type: 'string' },
                reportingMta: { type: 'string' },
                counts: { type: 'object' },
                recipients: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
        ComplaintReadRequest: {
          type: 'object',
          required: ['source'],
          properties: {
            source: {
              type: 'string',
              description: 'Raw RFC 5965 Abuse Reporting Format (ARF) feedback loop message (alias: `raw`).',
              example:
                'Feedback-Type: abuse\r\nOriginal-Rcpt-To: <subscriber@example.net>\r\nSource-IP: 192.0.2.1\r\nReported-Domain: sender.example',
            },
          },
        },
        TlsReportRequest: {
          type: 'object',
          required: ['source'],
          properties: {
            source: {
              type: 'string',
              description: 'RFC 8460 SMTP TLS reporting JSON. Unzip a .json.gz file first (alias: `raw`).',
            },
          },
        },
        TlsReportResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            report: {
              type: 'object',
              properties: {
                stored: { type: 'boolean', example: false },
                stamp: { type: 'string', enum: ['FAILURES', 'CLEAR', 'EMPTY'], example: 'FAILURES' },
                verdict: { type: 'string', enum: ['failures', 'clear', 'empty'] },
                summary: { type: 'string' },
                failedSessions: { type: 'integer' },
                policies: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
        ComplaintReadResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            report: {
              type: 'object',
              properties: {
                stored: { type: 'boolean', example: false },
                stamp: { type: 'string', example: 'ABUSE' },
                feedbackType: { type: 'string', example: 'abuse' },
                action: { type: 'string', example: 'suppress' },
                recipient: { type: 'string', example: 'subscriber@example.net' },
                suppressionRecord: { type: 'object' },
                workflow: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
        QaCreateMailboxRequest: {
          type: 'object',
          properties: {
            alias: {
              type: 'string',
              description: 'Optional custom local-part alias (lowercase letters, digits, dots, underscores, hyphens).',
              example: 'ci-signup-test',
            },
            domain: {
              type: 'string',
              description: 'Optional domain from allowed Hide Mail domains.',
            },
            ttlSeconds: {
              type: 'integer',
              description: 'Optional mailbox lease duration in seconds.',
              example: 86400,
            },
          },
        },
        QaMailboxResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                email: { type: 'string', example: 'ci-signup-test@hide-mail.org' },
                ttlSeconds: { type: 'integer', example: 86400 },
              },
            },
          },
        },
        QaWebhookRequest: {
          type: 'object',
          required: ['url'],
          properties: {
            url: {
              type: 'string',
              format: 'uri',
              description: 'Public HTTPS webhook URL to receive incoming message payloads.',
              example: 'https://ci.example.com/webhooks/hidemail',
            },
          },
        },
        McpJsonRpcRequest: {
          type: 'object',
          required: ['jsonrpc', 'method'],
          properties: {
            jsonrpc: { type: 'string', enum: ['2.0'], example: '2.0' },
            id: { oneOf: [{ type: 'integer' }, { type: 'string' }], example: 1 },
            method: {
              type: 'string',
              enum: [
                'initialize',
                'ping',
                'tools/list',
                'tools/call',
                'resources/list',
                'resources/read',
                'prompts/list',
                'prompts/get',
              ],
              example: 'tools/call',
            },
            params: {
              type: 'object',
              description: `Method parameters. Available tools: ${mcpToolNames.join(', ')}.`,
              example: {
                name: 'hide_mail_sender_check',
                arguments: { domain: 'example.com', dkimSelector: 'google' },
              },
            },
          },
        },
        McpJsonRpcResponse: {
          type: 'object',
          properties: {
            jsonrpc: { type: 'string', example: '2.0' },
            id: { oneOf: [{ type: 'integer' }, { type: 'string' }, { type: 'null' }], example: 1 },
            result: { type: 'object' },
            error: {
              type: 'object',
              properties: {
                code: { type: 'integer' },
                message: { type: 'string' },
                data: { type: 'object' },
              },
            },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }, { ApiKeyHeader: [] }],
    paths: {
      '/api/mail-grade': {
        post: {
          tags: ['Deliverability Suite'],
          operationId: 'gradeEmail',
          summary: 'Score a raw RFC 5322 MIME email (0–100, grade A–F)',
          description:
            'Evaluates headers, SPF/DKIM/DMARC authentication, HTML heuristics, and DNSBL blocklists. Requires `suite` or `grade` plan (`120 req/min`, max `64 KB`).',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MailGradeRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Mail Grade evaluation report',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/MailGradeResponse' },
                },
              },
            },
            401: {
              description: 'Missing or invalid API key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/sender-check': {
        post: {
          tags: ['Deliverability Suite'],
          operationId: 'senderCheck',
          summary: 'Audit MX, SPF, DMARC, DKIM, BIMI, MTA-STS, and TLS-RPT for a domain',
          description:
            'Inspects live DNS records for a sending domain, including recursive SPF lookup counting and DKIM key length inspection. Requires `suite` or `sender` plan (`60 req/min`).',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SenderCheckRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Domain sender policy report',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SenderCheckResponse' },
                },
              },
            },
            401: {
              description: 'Missing or invalid API key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/dmarc-reports': {
        post: {
          tags: ['Deliverability Suite'],
          operationId: 'readDmarcReport',
          summary: 'Parse an RFC 7489 DMARC aggregate XML report or .xml.gz / .zip archive',
          description:
            'Parses DMARC aggregate XML into per-source IP alignment, PTR reverse-DNS, ESP attribution, and disposition breakdowns. Requires `suite` or `reports` plan (`60 req/min`).',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DmarcReportRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Parsed DMARC aggregate report',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/DmarcReportResponse' },
                },
              },
            },
            401: {
              description: 'Missing or invalid API key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/bounce-read': {
        post: {
          tags: ['Deliverability Suite'],
          operationId: 'readBounce',
          summary: 'Classify an RFC 3464 DSN bounce into per-recipient hard/soft verdicts',
          description:
            'Extracts per-recipient status codes, ISP diagnostic hints, original message headers, and retry/suppression rules. Requires `suite` or `bounce` plan (`120 req/min`).',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BounceReadRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Parsed DSN bounce classification',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/BounceReadResponse' },
                },
              },
            },
            401: {
              description: 'Missing or invalid API key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/complaint-read': {
        post: {
          tags: ['Deliverability Suite'],
          operationId: 'readComplaint',
          summary: 'Parse an RFC 5965 Abuse Reporting Format (ARF) feedback loop complaint',
          description:
            'Extracts complaining recipient address, original campaign headers, and structured suppression records. Requires `suite` or `complaint` plan (`120 req/min`).',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ComplaintReadRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Parsed ARF complaint report',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ComplaintReadResponse' },
                },
              },
            },
            401: {
              description: 'Missing or invalid API key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/tls-reports': {
        post: {
          tags: ['Deliverability Suite'],
          operationId: 'readTlsReport',
          summary: 'Parse an RFC 8460 SMTP TLS report',
          description:
            'Names the receiving hosts whose SMTP sessions failed TLS and why. Requires `suite` or `tls` plan (`120 req/min`).',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TlsReportRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Parsed SMTP TLS report',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TlsReportResponse' },
                },
              },
            },
            401: {
              description: 'Missing or invalid API key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/qa/mailboxes': {
        post: {
          tags: ['QA Mailboxes'],
          operationId: 'createQaMailbox',
          summary: 'Create and claim a disposable QA mailbox',
          description: 'Requires `suite` or `api` plan (`100 req/min`).',
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/QaCreateMailboxRequest' },
              },
            },
          },
          responses: {
            201: {
              description: 'Provisioned QA mailbox',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/QaMailboxResponse' },
                },
              },
            },
          },
        },
      },
      '/api/qa/mailboxes/{email}/messages': {
        get: {
          tags: ['QA Mailboxes'],
          operationId: 'listQaMessages',
          summary: 'List received messages in a QA mailbox',
          parameters: [
            {
              name: 'email',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Full QA mailbox email address.',
            },
          ],
          responses: {
            200: {
              description: 'Array of messages in the QA mailbox',
            },
            404: {
              description: 'Mailbox not found or expired',
            },
          },
        },
      },
      '/api/qa/mailboxes/{email}/messages/{id}': {
        get: {
          tags: ['QA Mailboxes'],
          operationId: 'getQaMessage',
          summary: 'Fetch a single message by ID from a QA mailbox',
          parameters: [
            { name: 'email', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Full message details including HTML, text, and attachments' },
            404: { description: 'Message not found' },
          },
        },
      },
      '/api/qa/mailboxes/{email}/messages/{id}/attachments/{index}': {
        get: {
          tags: ['QA Mailboxes'],
          operationId: 'downloadQaAttachment',
          summary: 'Download a specific MIME attachment by index',
          parameters: [
            { name: 'email', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'index', in: 'path', required: true, schema: { type: 'integer', minimum: 0 } },
          ],
          responses: {
            200: { description: 'Binary attachment stream' },
            404: { description: 'Attachment not found' },
          },
        },
      },
      '/api/qa/mailboxes/{email}/webhook': {
        put: {
          tags: ['QA Mailboxes'],
          operationId: 'setQaWebhook',
          summary: 'Register a public HTTPS webhook URL for a QA mailbox',
          parameters: [
            { name: 'email', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/QaWebhookRequest' },
              },
            },
          },
          responses: {
            200: { description: 'Webhook registered' },
            400: { description: 'Invalid or non-public HTTPS webhook URL' },
          },
        },
      },
      '/api/qa/mailboxes/{email}': {
        delete: {
          tags: ['QA Mailboxes'],
          operationId: 'deleteQaMailbox',
          summary: 'Deactivate a QA mailbox',
          parameters: [
            { name: 'email', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Mailbox deactivated' },
          },
        },
      },
      '/api/mcp': {
        get: {
          tags: ['Model Context Protocol (MCP)'],
          operationId: 'discoverMcpServer',
          summary: 'Discover MCP protocol version, capabilities, and SSE stream',
          description:
            'Requires an active `hm_api_...` key via `Authorization: Bearer` or `X-API-Key`.',
          security: [{ BearerAuth: [] }, { ApiKeyHeader: [] }],
          responses: {
            200: {
              description: 'MCP server capabilities and protocol metadata',
            },
            401: {
              description: 'Missing or invalid API key',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Model Context Protocol (MCP)'],
          operationId: 'callMcpJsonRpc',
          summary: 'Execute an MCP JSON-RPC 2.0 request (initialize, tools/list, tools/call, resources/*, prompts/*)',
          description:
            'Requires an active `hm_api_...` key. Tool access follows the licence type on that key.',
          security: [{ BearerAuth: [] }, { ApiKeyHeader: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/McpJsonRpcRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'JSON-RPC 2.0 response envelope',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/McpJsonRpcResponse' },
                },
              },
            },
            401: {
              description: 'Missing or invalid API key',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/billing/plans': {
        get: {
          tags: ['Billing & Licenses'],
          operationId: 'listBillingPlans',
          security: [],
          summary: 'List all Hide Mail plans, currencies, and entitlement tiers',
          responses: {
            200: { description: 'Plan catalog and entitlement matrix' },
          },
        },
      },
      '/api/billing/license/api-key': {
        post: {
          tags: ['Billing & Licenses'],
          operationId: 'issueApiKey',
          security: [],
          summary: 'Issue or rotate a 30-day hm_api_... bearer key from a license key',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['key'],
                  properties: {
                    key: {
                      type: 'string',
                      description: 'Active license key (HM-XXXX-XXXX-XXXX-XXXX).',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Issued API key and remaining days' },
          },
        },
      },
      '/api/outbound/domains': {
        post: {
          tags: ['Outbound Sending'],
          operationId: 'addOutboundDomain',
          summary: 'Register a sending domain and generate its DKIM key pair',
          description:
            'Requires an `outbound` licence (`X-License-Key` header). Generates a 2048-bit RSA key pair and a unique DKIM selector, returns the three DNS records (DKIM, Return-Path CNAME, DMARC) to publish. Starts `pending` until `POST /api/outbound/domains/{domain}/check` confirms all three.',
          security: [{ LicenseKeyHeader: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DomainAddRequest' },
              },
            },
          },
          responses: {
            201: {
              description: 'Domain registered, pending DNS verification',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/DomainResponse' } } },
            },
            401: {
              description: 'Missing or invalid licence key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            403: {
              description: 'Licence is not of type `outbound`',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            409: {
              description: 'Domain already registered to a different account',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
        get: {
          tags: ['Outbound Sending'],
          operationId: 'listOutboundDomains',
          summary: 'List this account\'s sending domains',
          description: 'Requires an `outbound` licence (`X-License-Key` header). Returns each domain\'s verification state, suspension flag, and daily send cap.',
          security: [{ LicenseKeyHeader: [] }],
          responses: {
            200: {
              description: 'Domains owned by this account',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/DomainListResponse' } } },
            },
            401: {
              description: 'Missing or invalid licence key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            403: {
              description: 'Licence is not of type `outbound`',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/outbound/domains/{domain}/check': {
        post: {
          tags: ['Outbound Sending'],
          operationId: 'checkOutboundDomain',
          summary: 'Re-verify a sending domain\'s DNS records',
          description:
            'Requires an `outbound` licence (`X-License-Key` header). Queries the domain\'s authoritative nameservers for the DKIM/Return-Path/DMARC records and updates `pending`/`verified`/`broken` state accordingly. Once `verified`, the backend may sign and submit mail for the domain through Postfix.',
          security: [{ LicenseKeyHeader: [] }],
          parameters: [
            {
              name: 'domain',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Domain to re-verify.',
            },
          ],
          responses: {
            200: {
              description: 'Updated verification state and per-record results',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/DomainResponse' } } },
            },
            401: {
              description: 'Missing or invalid licence key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            403: {
              description: 'Licence is not of type `outbound`',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            404: {
              description: 'Domain not found, or not owned by this account',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/outbound/domains/{domain}': {
        delete: {
          tags: ['Outbound Sending'],
          operationId: 'removeOutboundDomain',
          summary: 'Remove a sending domain',
          description:
            'Requires an `outbound` licence (`X-License-Key` header). Frees the domain name for any account to register again; already-accepted mail for this domain is unaffected.',
          security: [{ LicenseKeyHeader: [] }],
          parameters: [
            {
              name: 'domain',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Domain to remove.',
            },
          ],
          responses: {
            200: { description: 'Domain removed' },
            401: {
              description: 'Missing or invalid licence key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            403: {
              description: 'Licence is not of type `outbound`',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            404: {
              description: 'Domain not found, or not owned by this account',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/outbound/send-keys': {
        post: {
          tags: ['Outbound Sending'],
          operationId: 'createOutboundSendKey',
          summary: 'Issue a send key for the Send API',
          description:
            'Requires an `outbound` licence (`X-License-Key` header). Returns the raw `hm_send_...` key once — it is never stored or returned again. The key is valid for as long as the issuing account\'s licence (no fixed 30-day cap). Use it as `Authorization: Bearer <key>` on the Send API, never `X-License-Key`.',
          security: [{ LicenseKeyHeader: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SendKeyCreateRequest' },
              },
            },
          },
          responses: {
            201: {
              description: 'Send key issued',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/SendKeyCreateResponse' } } },
            },
            400: {
              description: 'Missing name',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            401: {
              description: 'Missing or invalid licence key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            403: {
              description: 'Licence is not of type `outbound`',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
        get: {
          tags: ['Outbound Sending'],
          operationId: 'listOutboundSendKeys',
          summary: 'List this account\'s send keys',
          description: 'Requires an `outbound` licence (`X-License-Key` header). Returns each key\'s name, creation time, and a 4-character mask — the raw key and its hash are never returned once issued.',
          security: [{ LicenseKeyHeader: [] }],
          responses: {
            200: {
              description: 'Send keys owned by this account',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/SendKeyListResponse' } } },
            },
            401: {
              description: 'Missing or invalid licence key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            403: {
              description: 'Licence is not of type `outbound`',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/outbound/metrics-token': {
        post: {
          tags: ['Outbound Sending'],
          operationId: 'rotateOutboundMetricsToken',
          summary: 'Issue or rotate the account metrics token',
          description:
            'Requires an `outbound` licence (`X-License-Key` header). One token per account; rotating invalidates the previous token. Returns the raw `hm_metrics_...` key once.',
          security: [{ LicenseKeyHeader: [] }],
          responses: {
            201: {
              description: 'Metrics token issued',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/MetricsTokenRotateResponse' } },
              },
            },
            401: {
              description: 'Missing or invalid licence key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            403: {
              description: 'Licence is not of type `outbound`',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
        get: {
          tags: ['Outbound Sending'],
          operationId: 'getOutboundMetricsTokenMeta',
          summary: 'Get metrics token metadata (no raw key)',
          description: 'Requires an `outbound` licence. Returns masked key and a scrape_config template without the secret.',
          security: [{ LicenseKeyHeader: [] }],
          responses: {
            200: {
              description: 'Token metadata',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/MetricsTokenMetaResponse' } },
              },
            },
            404: {
              description: 'No token issued yet',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/outbound/metrics': {
        get: {
          tags: ['Outbound Sending'],
          operationId: 'scrapeOutboundMetrics',
          summary: 'Customer Prometheus scrape for this account\'s domains',
          description:
            'Authenticated with `Authorization: Bearer hm_metrics_...` only. Returns Prometheus text exposition for this account\'s domains (no `account` label).',
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: 'Prometheus text',
              content: { 'text/plain': { schema: { type: 'string' } } },
            },
            401: {
              description: 'Missing or invalid metrics token',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/outbound/send-keys/{name}': {
        delete: {
          tags: ['Outbound Sending'],
          operationId: 'revokeOutboundSendKey',
          summary: 'Revoke a send key by name',
          description: 'Requires an `outbound` licence (`X-License-Key` header). Immediately invalidates the key for the Send API.',
          security: [{ LicenseKeyHeader: [] }],
          parameters: [
            {
              name: 'name',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'The name the send key was created with.',
            },
          ],
          responses: {
            200: { description: 'Send key revoked' },
            401: {
              description: 'Missing or invalid licence key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            403: {
              description: 'Licence is not of type `outbound`',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            404: {
              description: 'Send key name not found, or not owned by this account',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/outbound/messages': {
        post: {
          tags: ['Outbound Sending'],
          operationId: 'sendOutboundMessage',
          summary: 'Queue an outbound message',
          description:
            'Authenticated with a send key (`Authorization: Bearer hm_send_...`), never a licence key. Optional `Idempotency-Key` header returns the exact first response on replay. Envelope-from is always `b-<id>@hm-bounce.<domain>`.',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'Idempotency-Key',
              in: 'header',
              required: false,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/OutboundMessageCreateRequest' },
              },
            },
          },
          responses: {
            202: {
              description: 'Message accepted and queued',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/OutboundMessageQueuedResponse' } } },
            },
            401: {
              description: 'Missing or invalid send key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            403: {
              description: 'Domain not verified / suspended, or licence inactive',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            413: {
              description: 'Message too large',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            422: {
              description: 'Invalid recipient or suppressed',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            429: {
              description: 'Rate limited or daily cap reached',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            503: {
              description: 'Postfix relay unavailable (daily cap not consumed)',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/outbound/messages/{id}': {
        get: {
          tags: ['Outbound Sending'],
          operationId: 'getOutboundMessage',
          summary: 'Fetch a queued/delivered message record',
          description: 'Authenticated with a send key. Returns 404 (not 403) when the message belongs to another account.',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            200: { description: 'Message record (no body/subject)' },
            401: {
              description: 'Missing or invalid send key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            404: {
              description: 'Message not found for this account',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/outbound/account/summary': {
        get: {
          tags: ['Outbound Sending'],
          operationId: 'getOutboundAccountSummary',
          summary: 'Account domain summary with sent-today, rate limit, and delivery windows',
          description:
            'Requires an `outbound` licence (`X-License-Key` header). Includes `ratePerMinute` (not a daily cap) and per-domain 24h/7d counts derived from recent message activity.',
          security: [{ LicenseKeyHeader: [] }],
          responses: {
            200: {
              description: 'Per-domain state, caps, rate, lifetime counters, and window counts',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/OutboundAccountSummaryResponse' } } },
            },
            401: {
              description: 'Missing or invalid licence key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            403: {
              description: 'Licence is not of type `outbound`',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/outbound/activity': {
        get: {
          tags: ['Outbound Sending'],
          operationId: 'listOutboundActivity',
          summary: 'List recent outbound messages for the portal Activity page',
          description:
            'Requires an `outbound` licence (`X-License-Key` header). Returns newest-first message records (no body/subject), including late-bounce status transitions.',
          security: [{ LicenseKeyHeader: [] }],
          parameters: [
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
            },
          ],
          responses: {
            200: {
              description: 'Recent messages',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/OutboundActivityResponse' } } },
            },
            401: {
              description: 'Missing or invalid licence key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            403: {
              description: 'Licence is not of type `outbound`',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/outbound/suppressions': {
        get: {
          tags: ['Outbound Sending'],
          operationId: 'listOutboundSuppressions',
          summary: 'List suppressed recipients for this account',
          security: [{ LicenseKeyHeader: [] }],
          responses: {
            200: { description: 'Suppression entries' },
            401: {
              description: 'Missing or invalid licence key',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
        post: {
          tags: ['Outbound Sending'],
          operationId: 'addOutboundSuppression',
          summary: 'Manually suppress a recipient',
          security: [{ LicenseKeyHeader: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    reason: { type: 'string', enum: ['manual', 'hard_bounce'] },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Suppression added' },
            400: {
              description: 'Missing email',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/outbound/suppressions/export': {
        get: {
          tags: ['Outbound Sending'],
          operationId: 'exportOutboundSuppressions',
          summary: 'Export suppressions as CSV',
          security: [{ LicenseKeyHeader: [] }],
          responses: {
            200: {
              description: 'CSV export',
              content: { 'text/csv': { schema: { type: 'string' } } },
            },
          },
        },
      },
      '/api/outbound/suppressions/{email}': {
        delete: {
          tags: ['Outbound Sending'],
          operationId: 'removeOutboundSuppression',
          summary: 'Remove a recipient from the suppression list',
          security: [{ LicenseKeyHeader: [] }],
          parameters: [
            {
              name: 'email',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'email' },
            },
          ],
          responses: {
            200: { description: 'Suppression removed' },
            404: {
              description: 'Entry not found',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
    },
  };
};

const buildSwaggerUiHtml = (options = {}) => {
  const rawSpecUrl = String(options.specUrl || '/api/openapi.json');
  const specUrl = /^\/[a-zA-Z0-9/_.-]+$/.test(rawSpecUrl) ? rawSpecUrl : '/api/openapi.json';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hide Mail API — Swagger UI (OpenAPI 3.1)</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body {
      margin: 0;
      background: #fafaf7;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .hm-swagger-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 24px;
      background: #1c1c1e;
      color: #fafaf7;
      border-bottom: 3px solid #d95d39;
    }
    .hm-swagger-banner strong {
      font-size: 1rem;
      letter-spacing: -0.01em;
    }
    .hm-swagger-links {
      display: flex;
      gap: 16px;
      font-size: 0.88rem;
    }
    .hm-swagger-links a {
      color: #ffa940;
      text-decoration: none;
      font-weight: 600;
    }
    .hm-swagger-links a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <header class="hm-swagger-banner">
    <div>
      <strong>Hide Mail OpenAPI 3.1 Explorer (Swagger UI)</strong>
    </div>
    <nav class="hm-swagger-links" aria-label="Developer navigation">
      <a href="/developers">← Back to API Explorer &amp; MCP Hub</a>
      <a href="/developers?tab=mcp">MCP Server Hub</a>
      <a href="${specUrl}" target="_blank" rel="noopener noreferrer">Raw OpenAPI 3.1 JSON</a>
    </nav>
  </header>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.addEventListener('load', function () {
      window.ui = SwaggerUIBundle({
        url: '${specUrl}',
        dom_id: '#swagger-ui',
        deepLinking: true,
        displayRequestDuration: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
      });
    });
  </script>
</body>
</html>`;
};

module.exports = {
  OPENAPI_VERSION,
  buildOpenApiSpec,
  buildSwaggerUiHtml,
};
