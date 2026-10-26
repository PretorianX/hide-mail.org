/**
 * A small XML reader for DMARC aggregate reports.
 * It does not expand entities, fetch external resources, or honour doctypes.
 */

const { DmarcReportError } = require('./errors');

const MAX_ENTITY = 12;

const unreadable = () => new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');

const decodeText = (text) => {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '&') {
      out += text[i];
      continue;
    }
    const semi = text.indexOf(';', i + 1);
    if (semi < 0 || semi - i > MAX_ENTITY) {
      throw unreadable();
    }
    const token = text.slice(i + 1, semi);
    if (token === 'amp') out += '&';
    else if (token === 'lt') out += '<';
    else if (token === 'gt') out += '>';
    else if (token === 'quot') out += '"';
    else if (token === 'apos') out += "'";
    else if (/^#x[0-9a-fA-F]{1,6}$/.test(token)) {
      const code = Number.parseInt(token.slice(2), 16);
      if (code < 0 || code > 0x10ffff) throw unreadable();
      out += String.fromCodePoint(code);
    } else if (/^#\d{1,7}$/.test(token)) {
      const code = Number.parseInt(token.slice(1), 10);
      if (code < 0 || code > 0x10ffff) throw unreadable();
      out += String.fromCodePoint(code);
    } else {
      throw unreadable();
    }
    i = semi;
  }
  return out;
};

const findTagEnd = (source, from) => {
  let quote = null;
  for (let i = from; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '>') return i;
  }
  return -1;
};

const localName = (raw) => {
  const name = raw.trim().split(/\s+/)[0].replace(/\/$/, '');
  const colon = name.lastIndexOf(':');
  return colon === -1 ? name : name.slice(colon + 1);
};

/**
 * @returns {{ name: string, text: string, children: object[] }}
 */
const parseXml = (source) => {
  if (source.includes('\0') || /<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw unreadable();
  }

  const root = { name: '#root', text: '', children: [] };
  const stack = [root];
  let i = 0;

  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt === -1) {
      stack[stack.length - 1].text += decodeText(source.slice(i));
      break;
    }
    if (lt > i) {
      stack[stack.length - 1].text += decodeText(source.slice(i, lt));
    }
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4);
      if (end < 0) throw unreadable();
      i = end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', lt)) {
      const end = source.indexOf(']]>', lt + 9);
      if (end < 0) throw unreadable();
      stack[stack.length - 1].text += source.slice(lt + 9, end);
      i = end + 3;
      continue;
    }
    if (source.startsWith('<?', lt)) {
      const end = source.indexOf('?>', lt + 2);
      if (end < 0) throw unreadable();
      i = end + 2;
      continue;
    }
    const end = findTagEnd(source, lt + 1);
    if (end < 0) throw unreadable();
    if (source.startsWith('</', lt)) {
      const name = localName(source.slice(lt + 2, end));
      const current = stack.pop();
      if (!current || current.name !== name || stack.length === 0) {
        throw unreadable();
      }
      i = end + 1;
      continue;
    }
    let raw = source.slice(lt + 1, end).trim();
    const selfClosing = raw.endsWith('/');
    if (selfClosing) raw = raw.slice(0, -1).trim();
    const name = localName(raw);
    if (!name || name.startsWith('!') || name.startsWith('?')) {
      throw unreadable();
    }
    const node = { name, text: '', children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
    i = end + 1;
  }

  if (stack.length !== 1) throw unreadable();
  return root;
};

const child = (node, name) => node.children.find((item) => item.name === name) || null;

const children = (node, name) => node.children.filter((item) => item.name === name);

const textOf = (node, name) => {
  const found = child(node, name);
  return found ? found.text.trim() : '';
};

module.exports = {
  parseXml,
  child,
  children,
  textOf,
};
