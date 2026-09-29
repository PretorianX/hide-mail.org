/**
 * Plain-language guide for Mail Grade findings.
 * Keys match finding.id values from the grader.
 */

const ENTRIES = {
  from_missing: {
    title: 'Missing From',
    cause: 'The message has no From address, so receivers cannot tell who sent it.',
    fix: 'Add a From header with a real mailbox you control, for example From: Ada <ada@example.com>.',
  },
  from_present: {
    title: 'From is present',
    cause: 'Receivers can see who the message claims to be from.',
    fix: 'Keep using a From address on a domain you authenticate with SPF, DKIM and DMARC.',
  },
  from_display_mismatch: {
    title: 'Display name hides a different address',
    cause: 'The friendly name shows one email while the real From uses another. Filters treat that as spoofing.',
    fix: 'Put only a person or brand name in the display name. Keep the actual address in the angle brackets.',
  },
  subject_missing: {
    title: 'Missing subject',
    cause: 'Empty subjects look unfinished and are often filtered or ignored.',
    fix: 'Write a short subject that says what the message is about.',
  },
  subject_present: {
    title: 'Subject is present',
    cause: 'A subject helps clients and filters classify the message.',
    fix: 'Keep subjects clear and specific; avoid stuffing them with punctuation.',
  },
  subject_length: {
    title: 'Subject length is awkward',
    cause: 'Very short or very long subjects get clipped or look empty in many clients.',
    fix: 'Aim for roughly 3 to 78 characters.',
  },
  subject_shouting: {
    title: 'Subject is shouting',
    cause: 'Mostly uppercase subjects are a classic spam signal.',
    fix: 'Use normal sentence or title case instead of ALL CAPS.',
  },
  subject_punctuation: {
    title: 'Subject overuses punctuation',
    cause: 'Repeated !!! or ??? looks like spam to both people and filters.',
    fix: 'Use at most one exclamation or question mark, or none.',
  },
  date_missing: {
    title: 'Missing Date',
    cause: 'Without a Date header, servers and clients cannot place the message in time.',
    fix: 'Let your mail library set Date automatically, or add Date: with an RFC 5322 timestamp.',
  },
  date_present: {
    title: 'Date is present',
    cause: 'A Date header is standard for every outbound message.',
    fix: 'No change needed unless the timestamp is wrong for your timezone.',
  },
  message_id_missing: {
    title: 'Missing Message-ID',
    cause: 'Without Message-ID, providers struggle to thread replies and spot duplicates.',
    fix: 'Generate a unique Message-ID on your mail domain for every send.',
  },
  message_id_present: {
    title: 'Message-ID is present',
    cause: 'Threading and de-duplication can work correctly.',
    fix: 'Keep generating unique IDs; never reuse one across different messages.',
  },
  reply_to_mismatch: {
    title: 'Reply-To uses another domain',
    cause: 'Replies go somewhere different from From, which looks like phishing unless you mean it.',
    fix: 'Align Reply-To with the From domain, or document why a different domain is intentional.',
  },
  reply_to_aligned: {
    title: 'Reply-To matches From',
    cause: 'Replies stay on the same domain as the sender.',
    fix: 'No change needed.',
  },
  dkim_missing: {
    title: 'No DKIM evidence',
    cause: 'This copy has no DKIM-Signature and no dkim=pass result, so receivers cannot verify the domain signed it.',
    fix: 'Enable DKIM signing on your outbound MTA for the From domain, then send a fresh copy.',
  },
  dkim_present: {
    title: 'DKIM evidence is present',
    cause: 'There is a signature or an auth result that shows DKIM worked.',
    fix: 'Keep signing every outbound message.',
  },
  spf_pass: {
    title: 'SPF passed',
    cause: 'Authentication-Results reports that SPF checks succeeded for this hop.',
    fix: 'Keep publishing SPF for the domains that send for you.',
  },
  spf_fail: {
    title: 'SPF failed',
    cause: 'The sending IP is not allowed by the domain SPF record for this message path.',
    fix: 'Add the sending host to SPF, or send through a host that is already authorized.',
  },
  spf_weak: {
    title: 'SPF is inconclusive',
    cause: 'Authentication-Results did not report a clear SPF pass or fail.',
    fix: 'Tighten SPF to ~all or -all after you list every legitimate sender.',
  },
  dkim_pass: {
    title: 'DKIM passed',
    cause: 'Authentication-Results reports dkim=pass.',
    fix: 'No change needed.',
  },
  dkim_fail: {
    title: 'DKIM failed',
    cause: 'The signature present on the message did not verify.',
    fix: 'Check the DKIM private key, selector DNS record, and that nothing modified the signed headers in transit.',
  },
  dkim_weak: {
    title: 'DKIM is inconclusive',
    cause: 'Authentication-Results did not report a clear DKIM pass or fail.',
    fix: 'Confirm the selector publishes a public key and that you always sign outbound mail.',
  },
  dmarc_pass: {
    title: 'DMARC passed',
    cause: 'Authentication-Results reports dmarc=pass, so SPF or DKIM aligned with the From domain.',
    fix: 'No change needed.',
  },
  dmarc_fail: {
    title: 'DMARC failed',
    cause: 'Neither SPF nor DKIM aligned with the From domain under DMARC policy.',
    fix: 'Align SPF or DKIM with the From domain, then raise DMARC carefully toward quarantine or reject.',
  },
  dmarc_weak: {
    title: 'DMARC is inconclusive',
    cause: 'Authentication-Results did not report a clear DMARC pass or fail.',
    fix: 'Publish a DMARC record and monitor reports before enforcing.',
  },
  html_without_text: {
    title: 'HTML without a plain-text part',
    cause: 'HTML-only mail is harder for some clients and looks riskier to filters.',
    fix: 'Send multipart/alternative with both text/plain and text/html parts.',
  },
  text_alternative: {
    title: 'Plain-text alternative is present',
    cause: 'Clients that do not render HTML still have a usable body.',
    fix: 'Keep generating a real text part, not an empty stub.',
  },
  body_empty: {
    title: 'Empty body',
    cause: 'There is no text or HTML content to read.',
    fix: 'Add a message body before sending.',
  },
  insecure_links: {
    title: 'Link uses HTTP',
    cause: 'http:// links can be rewritten or flagged; https:// is expected for destinations you control.',
    fix: 'Replace every http:// link with https:// when the site supports it.',
  },
  links_https: {
    title: 'Links use HTTPS',
    cause: 'Linked destinations use encrypted URLs.',
    fix: 'No change needed.',
  },
  list_unsubscribe_missing: {
    title: 'Bulk mail has no List-Unsubscribe',
    cause: 'Messages that look like newsletters without List-Unsubscribe fail mailbox-provider rules.',
    fix: 'Add a List-Unsubscribe header (and List-Unsubscribe-Post when you support one-click).',
  },
  list_unsubscribe: {
    title: 'Unsubscribe header is present',
    cause: 'Recipients and providers can offer a clean unsubscribe path.',
    fix: 'Keep the header working for every campaign send.',
  },
  spam_phrases: {
    title: 'Spam-like language',
    cause: 'The body or subject uses wording common in junk mail.',
    fix: 'Rewrite the copy in plain language; drop phrases like “act now”, “free money”, or “you have won”.',
  },
};

const guideFor = (findingId) => ENTRIES[findingId] || null;

const guideEntries = () =>
  Object.entries(ENTRIES).map(([id, entry]) => ({ id, ...entry }));

const guidePathFor = (findingId) => `/grade/guide#${encodeURIComponent(findingId)}`;

module.exports = {
  ENTRIES,
  guideFor,
  guideEntries,
  guidePathFor,
};
