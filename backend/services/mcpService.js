/**
 * Official Hide Mail Model Context Protocol (MCP) Server service.
 * Exposes all 5 Deliverability Suite tools, 4 QA Mailbox tools,
 * live pricing & remediation resources, and deliverability workflow prompts.
 */

const crypto = require('node:crypto');
const zlib = require('node:zlib');
const config = require('../config/config');
const redisService = require('./redisService');
const entitlementService = require('./entitlementService');
const pricingService = require('./pricingService');
const mailGradeService = require('./mailGradeService');
const senderCheckService = require('./senderCheckService');
const dmarcReportService = require('./dmarcReportService');
const bounceReadService = require('./bounceReadService');
const complaintReadService = require('./complaintReadService');
const { resolveActiveRecipient } = require('./recipientResolver');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = {
  name: 'hide-mail-mcp',
  version: '1.0.0',
};
const CAPABILITIES = {
  tools: {},
  resources: {},
  prompts: {},
};

const ALIAS_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const MAX_ARCHIVE_OUTPUT_BYTES = 262144;
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;

const archiveTooLargeError = () => {
  const err = new Error('DMARC archive exceeds the 256 KB decompression limit');
  err.code = 'ARCHIVE_TOO_LARGE';
  return err;
};

const archiveUnreadableError = (message = 'DMARC zip archive could not be read') => {
  const err = new Error(message);
  err.code = 'ARCHIVE_UNREADABLE';
  return err;
};

/**
 * Extract the first .xml entry from a ZIP buffer using a manual local-file-header
 * parse + zlib.inflateRawSync(maxOutputLength). Never calls unbounded getData().
 */
const extractXmlFromZipBuffer = (buf) => {
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== ZIP_LOCAL_FILE_HEADER) {
      break;
    }
    const method = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const uncompressedSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + nameLen + extraLen;
    if (dataStart > buf.length) {
      throw archiveUnreadableError();
    }
    const entryName = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataEnd = compressedSize > 0 ? dataStart + compressedSize : buf.length;
    if (dataEnd > buf.length) {
      throw archiveUnreadableError();
    }

    if (entryName.toLowerCase().endsWith('.xml')) {
      if (uncompressedSize > MAX_ARCHIVE_OUTPUT_BYTES) {
        throw archiveTooLargeError();
      }
      const compressedSlice = buf.subarray(dataStart, dataEnd);
      if (method === 0) {
        if (compressedSlice.length > MAX_ARCHIVE_OUTPUT_BYTES) {
          throw archiveTooLargeError();
        }
        return compressedSlice.toString('utf8');
      }
      if (method === 8) {
        try {
          return zlib
            .inflateRawSync(compressedSlice, { maxOutputLength: MAX_ARCHIVE_OUTPUT_BYTES })
            .toString('utf8');
        } catch (err) {
          if (err && (err.code === 'ERR_BUFFER_TOO_LARGE' || /maxOutputLength/i.test(err.message))) {
            throw archiveTooLargeError();
          }
          throw archiveUnreadableError();
        }
      }
      throw archiveUnreadableError('Unsupported zip compression method');
    }

    if (compressedSize === 0) {
      if (entryName.endsWith('/')) {
        offset = dataStart;
        continue;
      }
      break;
    }
    offset = dataEnd;
  }
  const err = new Error('No XML file found in zip archive');
  err.code = 'NO_XML_IN_ZIP';
  throw err;
};

class McpToolEntitlementError extends Error {
  constructor(toolName, requiredPlan, currentPlan) {
    super(
      `Tool '${toolName}' requires the '${requiredPlan}' plan or the 'suite' (Deliverability Suite) plan (current plan: '${currentPlan}').`
    );
    this.code = -32003;
    this.requiredPlan = requiredPlan;
    this.currentPlan = currentPlan;
  }
}

class McpInvalidParamsError extends Error {
  constructor(message) {
    super(message);
    this.code = -32602;
  }
}

const TOOL_DEFINITIONS = [
  {
    name: 'hide_mail_grade_email',
    description:
      'Score a raw RFC 5322 MIME email message (0-100, letter grade A-F) across headers, SPF/DKIM/DMARC authentication, HTML heuristics, and DNSBL reputation.',
    requiredEntitlement: 'gradeApi',
    requiredPlan: 'grade',
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
  },
  {
    name: 'hide_mail_sender_check',
    description:
      'Audit a sending domain for MX, SPF, DMARC, and optional DKIM selector readiness.',
    requiredEntitlement: 'senderApi',
    requiredPlan: 'sender',
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
  },
  {
    name: 'hide_mail_dmarc_report',
    description:
      'Parse an RFC 7489 DMARC aggregate XML report (raw XML or base64-encoded gzip archive) into a source-by-source alignment summary.',
    requiredEntitlement: 'reportsApi',
    requiredPlan: 'reports',
    inputSchema: {
      type: 'object',
      properties: {
        xml: {
          type: 'string',
          description: 'Raw RFC 7489 DMARC aggregate XML string.',
        },
        archiveBase64: {
          type: 'string',
          description: 'Base64-encoded DMARC aggregate report archive (e.g. .xml.gz).',
        },
        format: {
          type: 'string',
          enum: ['xml', 'gzip', 'zip'],
          description: 'Input format when archiveBase64 is supplied.',
        },
      },
    },
  },
  {
    name: 'hide_mail_bounce_read',
    description:
      'Parse an RFC 3464 delivery status notification (DSN) bounce into per-recipient hard/soft verdicts and retry guidance.',
    requiredEntitlement: 'bounceApi',
    requiredPlan: 'bounce',
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
  },
  {
    name: 'hide_mail_complaint_read',
    description:
      'Parse an RFC 5965 Abuse Reporting Format (ARF) feedback loop message into recipient suppression actions.',
    requiredEntitlement: 'complaintApi',
    requiredPlan: 'complaint',
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
  },
  {
    name: 'hide_mail_qa_create_mailbox',
    description:
      'Create and claim a disposable QA mailbox for automated E2E email and OTP testing.',
    requiredEntitlement: 'apiAccess',
    requiredPlan: 'api',
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
  },
  {
    name: 'hide_mail_qa_list_messages',
    description:
      'List received messages in a QA mailbox with optional case-insensitive subject and sender filters.',
    requiredEntitlement: 'apiAccess',
    requiredPlan: 'api',
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
  },
  {
    name: 'hide_mail_qa_get_message',
    description:
      'Fetch a specific message by ID from a QA mailbox, including extracted OTP codes and verification links.',
    requiredEntitlement: 'apiAccess',
    requiredPlan: 'api',
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
  },
  {
    name: 'hide_mail_qa_clear_mailbox',
    description:
      'Delete all messages in a QA mailbox and deactivate its lease.',
    requiredEntitlement: 'apiAccess',
    requiredPlan: 'api',
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
  },
];

const MAIL_GRADE_FINDINGS_GUIDE = {
  version: '1.0.0',
  findings: {
    from_missing: {
      severity: 'fail',
      category: 'headers',
      remediation: 'Add a valid RFC 5322 From header matching your authenticated sending domain.',
    },
    from_display_mismatch: {
      severity: 'warn',
      category: 'headers',
      remediation: 'Do not embed a different email address inside the From display name.',
    },
    subject_missing: {
      severity: 'fail',
      category: 'headers',
      remediation: 'Include a clear, non-empty Subject header.',
    },
    subject_length: {
      severity: 'warn',
      category: 'headers',
      remediation: 'Keep the Subject header between 3 and 78 characters.',
    },
    subject_shouting: {
      severity: 'warn',
      category: 'headers',
      remediation: 'Use normal sentence case in the Subject instead of all-caps.',
    },
    subject_punctuation: {
      severity: 'warn',
      category: 'headers',
      remediation: 'Remove repeated exclamation or question marks from the Subject.',
    },
    date_missing: {
      severity: 'warn',
      category: 'headers',
      remediation: 'Include an RFC 5322 Date header generated at send time.',
    },
    message_id_missing: {
      severity: 'warn',
      category: 'headers',
      remediation: 'Generate a globally unique Message-ID header (@yourdomain).',
    },
    reply_to_mismatch: {
      severity: 'warn',
      category: 'headers',
      remediation: 'Align the Reply-To domain with your From domain where possible.',
    },
    dkim_missing: {
      severity: 'warn',
      category: 'authentication',
      remediation: 'Sign outbound messages with DKIM (2048-bit RSA or Ed25519) for the From domain.',
    },
    spf_no_ip: {
      severity: 'warn',
      category: 'authentication',
      remediation: 'Include Received headers from the receiving MTA so the sending IP can be verified against SPF.',
    },
    spf_fail: {
      severity: 'fail',
      category: 'authentication',
      remediation: 'Authorize your sending IP or ESP in your domain SPF TXT record.',
    },
    spf_weak: {
      severity: 'warn',
      category: 'authentication',
      remediation: 'Publish a valid v=spf1 record ending with ~all or -all.',
    },
    dkim_fail: {
      severity: 'fail',
      category: 'authentication',
      remediation: 'Verify that the public key at selector._domainkey matches the private signing key and message headers are not modified in transit.',
    },
    dkim_weak: {
      severity: 'warn',
      category: 'authentication',
      remediation: 'Ensure a valid DKIM signature covers From, Subject, Date, and To.',
    },
    dmarc_fail: {
      severity: 'fail',
      category: 'authentication',
      remediation: 'Ensure either SPF or DKIM passes AND aligns with the organizational From domain.',
    },
    dmarc_weak: {
      severity: 'warn',
      category: 'authentication',
      remediation: 'Publish a _dmarc TXT record with v=DMARC1; p=quarantine; or p=reject;.',
    },
    html_without_text: {
      severity: 'warn',
      category: 'content',
      remediation: 'Send multipart/alternative with both text/plain and text/html parts.',
    },
    body_empty: {
      severity: 'fail',
      category: 'content',
      remediation: 'Provide non-empty message body content.',
    },
    insecure_links: {
      severity: 'warn',
      category: 'content',
      remediation: 'Upgrade all http:// links in the body to https://.',
    },
    list_unsubscribe_missing: {
      severity: 'warn',
      category: 'headers',
      remediation: 'Add List-Unsubscribe and List-Unsubscribe-Post headers for bulk or marketing messages (RFC 8058).',
    },
    spam_phrases: {
      severity: 'warn',
      category: 'content',
      remediation: 'Remove high-risk promotional trigger phrases from the subject and body.',
    },
    css_cloaking: {
      severity: 'warn',
      category: 'html',
      remediation: 'Remove display:none, visibility:hidden, opacity:0, or off-screen text styling.',
    },
    hidden_link: {
      severity: 'warn',
      category: 'html',
      remediation: 'Ensure all anchor tags are visible and legible.',
    },
    hidden_link_mismatch: {
      severity: 'fail',
      category: 'html',
      remediation: 'Make sure anchor text displaying a URL matches the actual href hostname.',
    },
    link_shortener: {
      severity: 'warn',
      category: 'html',
      remediation: 'Replace public URL shorteners (bit.ly, tinyurl.com, etc.) with direct branded links.',
    },
    tracking_pixel: {
      severity: 'warn',
      category: 'html',
      remediation: 'Remove 1x1 tracking pixel images when high inbox placement is required.',
    },
    html_script: {
      severity: 'fail',
      category: 'html',
      remediation: 'Strip all <script> tags from HTML email templates.',
    },
    html_form: {
      severity: 'warn',
      category: 'html',
      remediation: 'Link to a web landing page instead of embedding <form> elements inside email HTML.',
    },
    image_only_body: {
      severity: 'warn',
      category: 'html',
      remediation: 'Include meaningful text alongside images rather than sending an image-only email.',
    },
    rbl_domain: {
      severity: 'fail',
      category: 'reputation',
      remediation: 'Request delisting from the reported domain blocklist (Spamhaus DBL, SURBL, URIBL) after resolving the root cause.',
    },
    rbl_ip: {
      severity: 'fail',
      category: 'reputation',
      remediation: 'Investigate outbound abuse on the sending IP and request delisting from the reported DNSBL.',
    },
  },
};

const listTools = () =>
  TOOL_DEFINITIONS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));

const isEntitledForTool = (toolDef, license) => {
  const entitlements = entitlementService.getEntitlements(license);
  if (entitlements.planType === 'suite' || license?.type === 'suite') {
    return true;
  }
  return Boolean(entitlements[toolDef.requiredEntitlement]);
};

const allowedDomainsForLicense = (license) => {
  const domains = [...config.validDomains];
  if (license && config.premiumDomains.length > 0) {
    config.premiumDomains.forEach((domain) => {
      if (!domains.includes(domain)) {
        domains.push(domain);
      }
    });
  }
  return domains;
};

const extractOtpCodes = (message) => {
  const haystack = `${message?.subject || ''}\n${message?.text || ''}`;
  const matches = haystack.match(/\b\d{4,8}\b/g) || [];
  return [...new Set(matches)];
};

const extractVerificationLinks = (message) => {
  const haystack = `${message?.text || ''}\n${message?.html || ''}`;
  const matches = haystack.match(/https?:\/\/[^\s<>"')]+/gi) || [];
  return [...new Set(matches.map((link) => link.replace(/[.,;]+$/, '')))];
};

const executeTool = async (name, args = {}, license) => {
  const toolDef = TOOL_DEFINITIONS.find((item) => item.name === name);
  if (!toolDef) {
    throw new McpInvalidParamsError(`Unknown tool: ${name}`);
  }

  const entitlements = entitlementService.getEntitlements(license);
  if (!isEntitledForTool(toolDef, license)) {
    throw new McpToolEntitlementError(
      name,
      toolDef.requiredPlan,
      entitlements.planType || license?.type || 'free'
    );
  }

  switch (name) {
    case 'hide_mail_grade_email': {
      const raw = args.raw ?? args.source;
      return mailGradeService.gradeEmail(raw);
    }

    case 'hide_mail_sender_check': {
      const { domain, dkimSelector } = args;
      return senderCheckService.checkDomain(
        domain,
        dkimSelector ? { dkimSelector } : undefined
      );
    }

    case 'hide_mail_dmarc_report': {
      let xml = args.xml;
      if (args.archiveBase64 && args.format === 'gzip') {
        xml = zlib
          .gunzipSync(Buffer.from(args.archiveBase64, 'base64'), {
            maxOutputLength: MAX_ARCHIVE_OUTPUT_BYTES,
          })
          .toString('utf8');
      } else if (args.archiveBase64 && args.format === 'zip') {
        xml = extractXmlFromZipBuffer(Buffer.from(args.archiveBase64, 'base64'));
      } else if (!xml && args.archiveBase64) {
        const buffer = Buffer.from(args.archiveBase64, 'base64');
        if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
          xml = zlib
            .gunzipSync(buffer, { maxOutputLength: MAX_ARCHIVE_OUTPUT_BYTES })
            .toString('utf8');
        } else {
          xml = buffer.toString('utf8');
        }
      }
      return dmarcReportService.readReport(xml);
    }

    case 'hide_mail_bounce_read': {
      const raw = args.raw ?? args.source;
      return bounceReadService.readBounce(raw);
    }

    case 'hide_mail_complaint_read': {
      const raw = args.raw ?? args.source;
      return complaintReadService.readComplaint(raw);
    }

    case 'hide_mail_qa_create_mailbox': {
      const domains = allowedDomainsForLicense(license);
      const requestedDomain = args.domain;
      const domain =
        requestedDomain && domains.includes(requestedDomain)
          ? requestedDomain
          : domains[0];

      if (!domain) {
        const err = new Error('No domains configured');
        err.code = 'NO_DOMAINS';
        throw err;
      }

      const aliasRaw = args.localPart ?? args.alias;
      const alias = aliasRaw ? String(aliasRaw).toLowerCase() : null;
      if (alias && !ALIAS_PATTERN.test(alias)) {
        const err = new Error('Invalid alias');
        err.code = 'INVALID_ALIAS';
        throw err;
      }

      const localPart = alias || `qa${crypto.randomBytes(6).toString('hex')}`;
      const address = `${localPart}@${domain}`;

      if (await resolveActiveRecipient(address)) {
        const err = new Error('This address is already in use. Choose another alias.');
        err.code = 'ALIAS_TAKEN';
        throw err;
      }

      const requestedSeconds =
        typeof args.ttlMinutes === 'number' && Number.isFinite(args.ttlMinutes)
          ? Math.round(args.ttlMinutes * 60)
          : args.ttlSeconds;
      const ttlSeconds = entitlementService.resolveMailboxTtl(license, requestedSeconds);

      await redisService.registerMailbox(address, ttlSeconds);
      await redisService.setMailboxMeta(
        address,
        {
          licenseKey: license?.key,
          alias: Boolean(alias),
        },
        ttlSeconds
      );

      return {
        address,
        email: address,
        ttlSeconds,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      };
    }

    case 'hide_mail_qa_list_messages': {
      const address = String(args.address || '').trim();
      if (!address) {
        throw new McpInvalidParamsError('address is required');
      }
      const active = await redisService.isMailboxActive(address);
      if (!active) {
        const err = new Error('Mailbox not found');
        err.code = 'MAILBOX_NOT_FOUND';
        throw err;
      }
      const rawMessages = await redisService.getEmails(address);
      const subjectFilter = args.subjectContains
        ? String(args.subjectContains).toLowerCase()
        : null;
      const fromFilter = args.fromContains
        ? String(args.fromContains).toLowerCase()
        : null;

      const filtered = rawMessages.filter((msg) => {
        if (
          subjectFilter &&
          !String(msg.subject || '').toLowerCase().includes(subjectFilter)
        ) {
          return false;
        }
        if (
          fromFilter &&
          !String(msg.from || '').toLowerCase().includes(fromFilter)
        ) {
          return false;
        }
        return true;
      });

      const messages = filtered.map((msg) => ({
        id: msg.id,
        from: msg.from,
        subject: msg.subject,
        preview: msg.preview,
        date: msg.date || msg.receivedAt,
        receivedAt: msg.receivedAt,
        read: Boolean(msg.read),
        hasAttachments: Array.isArray(msg.attachments) && msg.attachments.length > 0,
      }));

      return {
        address,
        count: messages.length,
        messages,
      };
    }

    case 'hide_mail_qa_get_message': {
      const address = String(args.address || '').trim();
      const messageId = String(args.messageId || '').trim();
      if (!address || !messageId) {
        throw new McpInvalidParamsError('address and messageId are required');
      }
      const message = await redisService.getEmailById(address, messageId);
      if (!message) {
        const err = new Error('Message not found');
        err.code = 'MESSAGE_NOT_FOUND';
        throw err;
      }
      return {
        ...message,
        otpCodes: extractOtpCodes(message),
        verificationLinks: extractVerificationLinks(message),
      };
    }

    case 'hide_mail_qa_clear_mailbox': {
      const address = String(args.address || '').trim();
      if (!address) {
        throw new McpInvalidParamsError('address is required');
      }
      await redisService.deleteAllEmails(address);
      await redisService.deactivateMailbox(address);
      return {
        address,
        cleared: true,
      };
    }

    default:
      throw new McpInvalidParamsError(`Unknown tool: ${name}`);
  }
};

const listResources = () => [
  {
    uri: 'hidemail://pricing/tiers',
    name: 'Hide Mail Pricing & Entitlement Matrix',
    description:
      'Live pricing and entitlement matrix across Free, Pro, QA API, Deliverability Suite, and standalone tool plans.',
    mimeType: 'application/json',
  },
  {
    uri: 'hidemail://guides/mail-grade-findings',
    name: 'Mail Grade Findings Remediation Guide',
    description:
      'Remediation guide for Mail Grade finding IDs across headers, authentication, HTML heuristics, and DNSBL reputation.',
    mimeType: 'application/json',
  },
];

const readResource = (uri) => {
  if (uri === 'hidemail://pricing/tiers') {
    const tiers = entitlementService.describeTiers();
    const pricesUsd = {
      pro: {
        monthly: pricingService.usdPrice('pro', 'monthly'),
        yearly: pricingService.usdPrice('pro', 'yearly'),
      },
      api: {
        monthly: pricingService.usdPrice('api', 'monthly'),
      },
      suite: {
        monthly: pricingService.usdPrice('suite', 'monthly'),
      },
      grade: {
        monthly: pricingService.usdPrice('grade', 'monthly'),
      },
      sender: {
        monthly: pricingService.usdPrice('sender', 'monthly'),
      },
      reports: {
        monthly: pricingService.usdPrice('reports', 'monthly'),
      },
      bounce: {
        monthly: pricingService.usdPrice('bounce', 'monthly'),
      },
      complaint: {
        monthly: pricingService.usdPrice('complaint', 'monthly'),
      },
    };
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ tiers, pricesUsd }, null, 2),
        },
      ],
    };
  }

  if (uri === 'hidemail://guides/mail-grade-findings') {
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(MAIL_GRADE_FINDINGS_GUIDE, null, 2),
        },
      ],
    };
  }

  throw new McpInvalidParamsError(`Unknown resource URI: ${uri}`);
};

const PROMPT_DEFINITIONS = [
  {
    name: 'audit-domain-deliverability',
    description:
      'Audit MX, SPF, DKIM, and DMARC records for a sending domain and produce copy-pasteable DNS records.',
    arguments: [
      {
        name: 'domain',
        description: 'Domain name to audit (e.g. example.com)',
        required: true,
      },
      {
        name: 'dkimSelector',
        description: 'Optional DKIM selector to inspect (e.g. google, default, s1)',
        required: false,
      },
    ],
  },
  {
    name: 'pre-send-email-audit',
    description:
      'Audit a raw RFC 5322 email message and its From domain before sending a campaign.',
    arguments: [
      {
        name: 'rawEmail',
        description: 'Raw RFC 5322 MIME email source including headers and body',
        required: true,
      },
    ],
  },
  {
    name: 'triage-bounce-or-complaint',
    description:
      'Classify a raw DSN bounce or ARF feedback loop complaint and output suppression/retry actions.',
    arguments: [
      {
        name: 'rawPayload',
        description: 'Raw RFC 3464 DSN bounce or RFC 5965 ARF complaint payload',
        required: true,
      },
    ],
  },
];

const listPrompts = () => PROMPT_DEFINITIONS;

const getPrompt = (name, args = {}) => {
  if (name === 'audit-domain-deliverability') {
    const domain = args.domain || '<domain>';
    const selectorNote = args.dkimSelector
      ? ` with dkimSelector="${args.dkimSelector}"`
      : '';
    return {
      description: `Audit DNS deliverability records for ${domain}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Run hide_mail_sender_check for domain "${domain}"${selectorNote}. Summarize the MX, SPF, and DMARC status and provide copy-pasteable DNS TXT/MX records to fix any warnings or failures.`,
          },
        },
      ],
    };
  }

  if (name === 'pre-send-email-audit') {
    const rawEmail = args.rawEmail || '<rawEmail>';
    return {
      description: 'Pre-send email quality and authentication audit',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Run hide_mail_grade_email on the following raw email and hide_mail_sender_check on its From domain. Consult hidemail://guides/mail-grade-findings to provide concrete remediations for every non-pass finding:\n\n${rawEmail}`,
          },
        },
      ],
    };
  }

  if (name === 'triage-bounce-or-complaint') {
    const rawPayload = args.rawPayload || '<rawPayload>';
    return {
      description: 'Triage DSN bounce or ARF abuse complaint',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Inspect the following raw payload using hide_mail_bounce_read (if it is a DSN bounce) or hide_mail_complaint_read (if it is an ARF feedback report). Return the affected recipient(s), whether to suppress or retry, and the root cause:\n\n${rawPayload}`,
          },
        },
      ],
    };
  }

  throw new McpInvalidParamsError(`Unknown prompt: ${name}`);
};

const handleJsonRpc = async (payload, license) => {
  if (!payload || typeof payload !== 'object' || payload.jsonrpc !== '2.0' || typeof payload.method !== 'string') {
    return {
      jsonrpc: '2.0',
      id: payload?.id ?? null,
      error: {
        code: -32600,
        message: 'Invalid Request: expected JSON-RPC 2.0 envelope',
      },
    };
  }

  const { id = null, method, params = {} } = payload;

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: CAPABILITIES,
            serverInfo: SERVER_INFO,
          },
        };

      case 'notifications/initialized':
      case 'ping':
        return {
          jsonrpc: '2.0',
          id,
          result: {},
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: listTools(),
          },
        };

      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        if (!toolName || typeof toolName !== 'string') {
          throw new McpInvalidParamsError('Tool name is required');
        }
        try {
          const result = await executeTool(toolName, toolArgs, license);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
              structuredContent: result,
              isError: false,
            },
          };
        } catch (toolError) {
          if (
            toolError instanceof McpToolEntitlementError ||
            toolError instanceof McpInvalidParamsError
          ) {
            throw toolError;
          }
          const errorPayload = {
            error: toolError.message || 'Tool execution failed',
            code: toolError.code || 'TOOL_EXECUTION_ERROR',
          };
          return {
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(errorPayload, null, 2),
                },
              ],
              structuredContent: errorPayload,
            },
          };
        }
      }

      case 'resources/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            resources: listResources(),
          },
        };

      case 'resources/read':
        return {
          jsonrpc: '2.0',
          id,
          result: readResource(params?.uri),
        };

      case 'prompts/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            prompts: listPrompts(),
          },
        };

      case 'prompts/get':
        return {
          jsonrpc: '2.0',
          id,
          result: getPrompt(params?.name, params?.arguments || {}),
        };

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  } catch (error) {
    if (error instanceof McpToolEntitlementError) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: error.code,
          message: error.message,
          data: {
            requiredPlan: error.requiredPlan,
            upgradePlan: 'suite',
            currentPlan: error.currentPlan,
          },
        },
      };
    }
    if (error instanceof McpInvalidParamsError) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: error.code,
          message: error.message,
        },
      };
    }
    throw error;
  }
};

module.exports = {
  PROTOCOL_VERSION,
  SERVER_INFO,
  CAPABILITIES,
  TOOL_DEFINITIONS,
  MAIL_GRADE_FINDINGS_GUIDE,
  MAX_ARCHIVE_OUTPUT_BYTES,
  McpToolEntitlementError,
  McpInvalidParamsError,
  extractXmlFromZipBuffer,
  listTools,
  executeTool,
  listResources,
  readResource,
  listPrompts,
  getPrompt,
  handleJsonRpc,
};
