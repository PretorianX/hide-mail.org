/**
 * Scores one raw email. The source is parsed in memory and dropped.
 * Nothing here writes to Redis or disk.
 */

const { simpleParser } = require('mailparser');
const { buildFindings, scoreOf, letterFor, SUMMARY } = require('./mailGrade/findings');

const MAX_SOURCE_CHARS = 64 * 1024;
const HEADER_LINE = /^(from|to|cc|bcc|subject|date|mime-version|content-type|message-id|dkim-signature|reply-to):/im;

class MailGradeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const gradeEmail = async (source) => {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new MailGradeError('EMPTY_EMAIL', 'Paste a raw email first.');
  }
  if (source.length > MAX_SOURCE_CHARS) {
    throw new MailGradeError('EMAIL_TOO_LARGE', 'That email is larger than 64 KB.');
  }
  if (!HEADER_LINE.test(source)) {
    throw new MailGradeError(
      'NOT_AN_EMAIL',
      'That text has no email headers. Paste the raw source, including From or Subject.'
    );
  }

  let parsed;
  try {
    parsed = await simpleParser(source);
  } catch (error) {
    throw new MailGradeError(
      'NOT_AN_EMAIL',
      'That text could not be read as an email.'
    );
  }

  const findings = buildFindings({ parsed, source });
  const score = Math.max(0, scoreOf(findings));
  const grade = letterFor(score);

  return {
    score,
    grade,
    summary: SUMMARY[grade],
    stored: false,
    findings: findings.map(({ id, severity, title, detail }) => ({
      id,
      severity,
      title,
      detail,
    })),
  };
};

module.exports = {
  gradeEmail,
  MailGradeError,
  MAX_SOURCE_CHARS,
};
