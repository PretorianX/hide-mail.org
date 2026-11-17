/**
 * Classify ZoneMTA / SMTP delivery responses for suppression decisions.
 */

const { classify } = require('../bounceRead/statusCatalog');

const CATEGORY_BY_CODE = {
  '5.1.1': 'unknown_recipient',
  '5.1.2': 'unknown_recipient',
  '5.1.3': 'unknown_recipient',
  '5.1.10': 'unknown_recipient',
  '5.2.1': 'mailbox',
  '5.2.2': 'mailbox',
  '5.7.1': 'policy',
  '5.7.26': 'policy',
};

const ENHANCED_RE = /\b([245]\.\d{1,3}\.\d{1,3})\b/;
const SMTP_RE = /\b([245]\d{2})\b/;

/** Review Focus pin — only hard unknown_recipient may suppress. */
const shouldSuppress = ({ class: klass, category }) =>
  klass === 'hard' && category === 'unknown_recipient';

const classifyDeliveryResponse = (responseText) => {
  const text = String(responseText || '');

  if (text.includes('Domain held')) {
    return { class: 'soft', category: 'held', shouldSuppress: false };
  }

  const enhanced = text.match(ENHANCED_RE);
  if (enhanced) {
    const code = enhanced[1];
    const outcome = classify(code);
    let klass = outcome.class;
    if (klass === 'delayed') {
      klass = 'soft';
    }
    const category =
      CATEGORY_BY_CODE[code] ||
      (code.startsWith('5.') || code.startsWith('4.') ? 'other' : 'other');
    const result = { class: klass, category, shouldSuppress: false };
    result.shouldSuppress = shouldSuppress(result);
    return result;
  }

  const smtp = text.match(SMTP_RE);
  if (smtp) {
    const leading = smtp[1][0];
    const result = {
      class: leading === '5' ? 'hard' : 'soft',
      category: 'other',
      shouldSuppress: false,
    };
    result.shouldSuppress = shouldSuppress(result);
    return result;
  }

  return { class: 'unknown', category: 'other', shouldSuppress: false };
};

module.exports = {
  classifyDeliveryResponse,
  shouldSuppress,
};
