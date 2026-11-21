/**
 * Walk one HTML document and count the barriers an access review rejects.
 * Remote images and stylesheets are not fetched.
 */

const {
  parseColor,
  colorFromBackground,
  parseFontSize,
  contrastRatio,
  FONT_TAG_PX,
} = require('./colors');
const { fail } = require('./errors');

const MAX_TAGS = 4000;
const MIN_TEXT_PX = 14;
const MIN_CONTRAST = 4.5;

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const ATTR_RE = /([^\s=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const TAG_RE = /<\/?([a-zA-Z][\w:-]*)([^>]*)>/g;

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const decodeEntities = (value) => String(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, body) => {
  if (body[0] === '#') {
    const code = body[1] === 'x' || body[1] === 'X'
      ? parseInt(body.slice(2), 16)
      : parseInt(body.slice(1), 10);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {
      return entity;
    }
    return String.fromCodePoint(code);
  }
  return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body.toLowerCase())
    ? NAMED_ENTITIES[body.toLowerCase()]
    : entity;
});

const attrsOf = (raw) => {
  const attrs = {};
  const flags = new Set();
  ATTR_RE.lastIndex = 0;
  let match = ATTR_RE.exec(raw || '');
  while (match) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4];
    if (value === undefined) {
      flags.add(name);
      attrs[name] = '';
    } else {
      flags.add(name);
      attrs[name] = decodeEntities(value);
    }
    match = ATTR_RE.exec(raw || '');
  }
  return { attrs, flags };
};

const styleOf = (raw) => {
  const style = String(raw || '');
  const color = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  const backgroundColor = style.match(/background-color\s*:\s*([^;]+)/i);
  const background = style.match(/(?:^|;)\s*background\s*:\s*([^;]+)/i);
  const fontSize = style.match(/font-size\s*:\s*([^;]+)/i);
  return {
    color: color ? parseColor(color[1]) : null,
    background: colorFromBackground(backgroundColor ? backgroundColor[1] : (background ? background[1] : '')),
    fontSize: fontSize ? fontSize[1] : null,
  };
};

const computed = (stack) => {
  const style = { color: null, background: null, fontSizePx: null };
  stack.forEach((frame) => {
    if (frame.color) {
      style.color = frame.color;
    }
    if (frame.background) {
      style.background = frame.background;
    }
    if (frame.fontSizePx != null) {
      style.fontSizePx = frame.fontSizePx;
    }
  });
  return style;
};

const skipping = (stack) => stack.some((frame) => frame.skip);

const BARRIERS = [
  {
    id: 'image-only',
    title: 'Image only',
    detail: 'The message is pictures without text a screen reader can speak.',
  },
  {
    id: 'missing-alt',
    title: 'Image without a text alternative',
    detail: 'An image has no alt text, so a screen reader cannot say what it is.',
  },
  {
    id: 'unnamed-link',
    title: 'Link without a name',
    detail: 'A link has no text, label, or image description.',
  },
  {
    id: 'missing-language',
    title: 'No language',
    detail: 'Nothing declares the language, so a screen reader has to guess the voice.',
  },
  {
    id: 'low-contrast',
    title: 'Low contrast',
    detail: 'Text and its background are below the 4.5:1 contrast used for body copy.',
  },
  {
    id: 'small-type',
    title: 'Type under 14px',
    detail: 'Text is set smaller than 14px.',
  },
  {
    id: 'skipped-heading',
    title: 'Skipped heading',
    detail: 'A heading level jumps by more than one step.',
  },
];

const scanHtml = (html) => {
  const source = String(html).replace(/<!--[\s\S]*?-->/g, '');
  const stack = [{
    tag: '#root',
    skip: false,
    color: null,
    background: null,
    fontSizePx: null,
    noted: false,
  }];
  const counts = {
    'image-only': 0,
    'missing-alt': 0,
    'unnamed-link': 0,
    'missing-language': 0,
    'low-contrast': 0,
    'small-type': 0,
    'skipped-heading': 0,
  };
  let readableChars = 0;
  let images = 0;
  let hasLang = false;
  let lastHeading = null;
  let tags = 0;
  let cursor = 0;

  const noteText = (text, linkFrame) => {
    const readable = decodeEntities(text).replace(/\s+/g, ' ');
    if (!readable.trim() || skipping(stack)) {
      return;
    }
    readableChars += readable.trim().length;
    if (linkFrame) {
      linkFrame.text += readable;
    }
    const frame = stack[stack.length - 1];
    if (frame.noted) {
      return;
    }
    frame.noted = true;
    const style = computed(stack);
    if (style.fontSizePx != null && style.fontSizePx < MIN_TEXT_PX) {
      counts['small-type'] += 1;
    }
    if (style.color && style.background) {
      const ratio = contrastRatio(style.color, style.background);
      if (ratio < MIN_CONTRAST) {
        counts['low-contrast'] += 1;
      }
    }
  };

  const finishLink = (frame) => {
    if (!frame.hasHref || frame.finished) {
      return;
    }
    frame.finished = true;
    const named = (frame.ariaLabel || '').trim() || frame.text.trim() || (frame.title || '').trim();
    if (!named) {
      counts['unnamed-link'] += 1;
    }
  };

  TAG_RE.lastIndex = 0;
  let match = TAG_RE.exec(source);
  while (match) {
    tags += 1;
    if (tags > MAX_TAGS) {
      fail('ACCESS_TOO_LARGE', 'That email is too large to read.');
    }
    noteText(source.slice(cursor, match.index), [...stack].reverse().find((frame) => frame.tag === 'a' && frame.hasHref && !frame.finished));
    cursor = TAG_RE.lastIndex;
    const tag = match[1].toLowerCase();
    const closing = match[0].startsWith('</');
    if (closing) {
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].tag === tag) {
          stack.splice(index).forEach((frame) => finishLink(frame));
          break;
        }
      }
      match = TAG_RE.exec(source);
      continue;
    }

    const { attrs, flags } = attrsOf(match[2]);
    if ((attrs.lang && attrs.lang.trim()) || (attrs['xml:lang'] && attrs['xml:lang'].trim())) {
      hasLang = true;
    }
    const parentPx = computed(stack).fontSizePx;
    const inline = styleOf(attrs.style);
    const fontSizePx = inline.fontSize
      ? parseFontSize(inline.fontSize, parentPx)
      : (tag === 'font' && FONT_TAG_PX[attrs.size] ? FONT_TAG_PX[attrs.size] : null);
    const frame = {
      tag,
      skip: tag === 'script' || tag === 'style' || tag === 'head',
      color: inline.color || parseColor(attrs.color),
      background: inline.background || parseColor(attrs.bgcolor),
      fontSizePx,
      noted: false,
      hasHref: tag === 'a' && flags.has('href'),
      ariaLabel: attrs['aria-label'] || '',
      title: attrs.title || '',
      text: '',
      finished: false,
    };

    if (tag === 'img' && !skipping(stack)) {
      images += 1;
      const alt = (attrs.alt || '').trim();
      if (!flags.has('alt')) {
        counts['missing-alt'] += 1;
      } else if (alt) {
        readableChars += alt.length;
        const link = [...stack].reverse().find((item) => item.tag === 'a' && item.hasHref && !item.finished);
        if (link) {
          link.text += ` ${alt}`;
        }
      }
    }

    const heading = tag.match(/^h([1-6])$/);
    if (heading && !skipping(stack)) {
      const level = Number(heading[1]);
      if (lastHeading != null && level > lastHeading + 1) {
        counts['skipped-heading'] += 1;
      }
      lastHeading = level;
    }

    if (!VOID.has(tag)) {
      stack.push(frame);
    }
    match = TAG_RE.exec(source);
  }

  noteText(source.slice(cursor), [...stack].reverse().find((frame) => frame.tag === 'a' && frame.hasHref && !frame.finished));
  stack.forEach((frame) => finishLink(frame));

  if (!hasLang) {
    counts['missing-language'] = 1;
  }
  if (images > 0 && readableChars === 0) {
    counts['image-only'] = 1;
  }
  if (images === 0 && readableChars === 0) {
    fail('NOT_HTML', 'That HTML has nothing to check.');
  }

  const barriers = BARRIERS
    .filter((item) => counts[item.id] > 0)
    .map((item) => ({ ...item, count: counts[item.id] }));

  return { barriers, images, readableChars };
};

module.exports = {
  scanHtml,
  MIN_TEXT_PX,
  MIN_CONTRAST,
};
