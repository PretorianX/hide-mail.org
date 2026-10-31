const { InviteReadError } = require('./errors');
const { extractCalendar } = require('./extractCalendar');
const { isValidTimeZone, zonedToUtcMs } = require('./zonedTime');

const MAX_BYTES = 64 * 1024;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const unfold = (text) => String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');

const unescapeText = (value) => {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '\\' && i + 1 < value.length) {
      const next = value[i + 1];
      if (next === 'n' || next === 'N') {
        out += '\n';
      } else {
        out += next;
      }
      i += 1;
    } else {
      out += value[i];
    }
  }
  return out;
};

const splitParams = (left) => {
  const parts = [];
  let buf = '';
  let inQuotes = false;
  for (const ch of left) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    }
    if (ch === ';' && !inQuotes) {
      parts.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  parts.push(buf);
  return parts;
};

const parseLine = (line) => {
  let colon = -1;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') {
      inQuotes = !inQuotes;
    } else if (line[i] === ':' && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) {
    return null;
  }
  const bits = splitParams(line.slice(0, colon));
  const name = bits.shift();
  const params = {};
  bits.forEach((bit) => {
    const eq = bit.indexOf('=');
    if (eq === -1) {
      return;
    }
    let val = bit.slice(eq + 1);
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    params[bit.slice(0, eq).toUpperCase()] = val;
  });
  return {
    name: name.toUpperCase(),
    params,
    value: unescapeText(line.slice(colon + 1)),
  };
};

const parseCalendar = (calendar) => {
  const events = [];
  const todos = [];
  let method = null;
  const stack = [];

  unfold(calendar).split(/\r?\n/).forEach((line) => {
    if (line.trim() === '') {
      return;
    }
    const item = parseLine(line);
    if (!item) {
      return;
    }
    if (item.name === 'BEGIN') {
      stack.push({ name: item.value.trim().toUpperCase(), props: {} });
      return;
    }
    if (item.name === 'END') {
      const finished = stack[stack.length - 1];
      stack.pop();
      if (finished && finished.name === 'VEVENT' && stack.length === 1) {
        events.push(finished.props);
      }
      if (finished && finished.name === 'VTODO' && stack.length === 1) {
        todos.push(finished.props);
      }
      return;
    }
    if (stack.length === 1 && stack[0].name === 'VCALENDAR' && item.name === 'METHOD') {
      method = item.value.trim().toUpperCase();
    }
    const top = stack[stack.length - 1];
    if (!top || (top.name !== 'VEVENT' && top.name !== 'VTODO')) {
      return;
    }
    if (item.name === 'ATTENDEE') {
      top.props.ATTENDEE = top.props.ATTENDEE || [];
      top.props.ATTENDEE.push(item);
      return;
    }
    if (!top.props[item.name]) {
      top.props[item.name] = item;
    }
  });

  return { method, events, todos };
};

const parseDate = (prop) => {
  if (!prop) {
    return null;
  }
  const value = prop.value.trim();
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!match) {
    return { valid: false, raw: value };
  }
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] == null ? null : Number(match[4]);
  const minute = match[5] == null ? null : Number(match[5]);
  const second = match[6] == null ? null : Number(match[6]);
  const allDay = String(prop.params.VALUE || '').toUpperCase() === 'DATE' || hour == null;
  const clockOk = allDay || (
    hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 60
  );
  if (month < 1 || month > 12 || day < 1 || day > 31 || !clockOk) {
    return { valid: false, raw: value };
  }
  return {
    valid: true,
    raw: value,
    year: Number(match[1]),
    month,
    day,
    hour: allDay ? null : hour,
    minute: allDay ? null : minute,
    second: allDay ? null : second,
    utc: !allDay && match[7] === 'Z',
    allDay,
    tzid: allDay ? null : (prop.params.TZID || null),
  };
};

const addDuration = (start, duration) => {
  const match = String(duration || '').trim().match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match || !start || !start.valid) {
    return null;
  }
  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);
  if (days + hours + minutes + seconds === 0 && !match[0]) {
    return null;
  }
  if (start.allDay) {
    const shifted = new Date(Date.UTC(start.year, start.month - 1, start.day + days));
    return {
      valid: true,
      raw: duration,
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: null,
      minute: null,
      second: null,
      utc: false,
      allDay: true,
      tzid: null,
    };
  }
  const ms = Date.UTC(start.year, start.month - 1, start.day, start.hour, start.minute, start.second || 0)
    + (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
  const shifted = new Date(ms);
  return {
    valid: true,
    raw: duration,
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    utc: start.utc,
    allDay: false,
    tzid: start.tzid,
  };
};

const emailOf = (value) => {
  if (!value) {
    return null;
  }
  const angle = String(value).match(/<([^>]+)>/);
  const raw = (angle ? angle[1] : String(value)).replace(/^mailto:/i, '').trim().toLowerCase();
  return raw.includes('@') ? raw : null;
};

const domainOf = (email) => {
  const at = email.lastIndexOf('@');
  return at === -1 ? null : email.slice(at + 1);
};

const personFrom = (prop) => {
  if (!prop) {
    return null;
  }
  const email = emailOf(prop.value);
  const name = prop.params.CN || null;
  if (!email && !name) {
    return null;
  }
  return { name, email };
};

const clock = (parts) => `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;

const sameDay = (left, right) => left.year === right.year && left.month === right.month && left.day === right.day;

const shiftDate = (parts, days) => {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
};

const monthDay = (parts) => `${MONTHS[parts.month - 1]} ${parts.day}`;

const timeLabelOf = (start, end) => {
  if (!start || !start.valid) {
    return null;
  }
  if (start.allDay) {
    if (end && end.valid && end.allDay) {
      const inclusive = shiftDate(end, -1);
      if (!sameDay(start, inclusive)) {
        return `${monthDay(start)} – ${monthDay(inclusive)}`;
      }
    }
    return 'All day';
  }
  const zone = start.utc ? 'UTC' : start.tzid;
  const range = end && end.valid && !end.allDay ? `${clock(start)}–${clock(end)}` : clock(start);
  return zone ? `${range} ${zone}` : range;
};

const stampOf = (method, status, sequence, isTask) => {
  if (method === 'CANCEL' || status === 'CANCELLED') {
    return { stamp: 'CANCEL', kind: 'cancellation' };
  }
  if (method === 'REPLY') {
    return { stamp: 'REPLY', kind: 'reply' };
  }
  if (method === 'COUNTER') {
    return { stamp: 'COUNTER', kind: 'counter' };
  }
  if (method === 'REFRESH') {
    return { stamp: 'REFRESH', kind: 'refresh' };
  }
  if (method === 'PUBLISH') {
    return { stamp: 'PUBLISH', kind: 'publish' };
  }
  if (method === 'REQUEST' && sequence > 0) {
    return { stamp: 'UPDATE', kind: 'update' };
  }
  if (method === 'REQUEST') {
    return { stamp: 'REQUEST', kind: 'request' };
  }
  if (isTask) {
    return { stamp: 'TASK', kind: 'task' };
  }
  return { stamp: 'EVENT', kind: 'event' };
};

const instantOf = (parts) => {
  if (!parts || !parts.valid) {
    return null;
  }
  if (parts.allDay) {
    return { kind: 'date', ms: Date.UTC(parts.year, parts.month - 1, parts.day) };
  }
  if (parts.utc) {
    return {
      kind: 'instant',
      ms: Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0),
    };
  }
  if (parts.tzid) {
    if (!isValidTimeZone(parts.tzid)) {
      return { kind: 'badzone' };
    }
    return { kind: 'instant', ms: zonedToUtcMs(parts, parts.tzid) };
  }
  return { kind: 'floating' };
};

const isPast = (start, now) => {
  const instant = instantOf(start);
  if (!instant || instant.kind === 'floating' || instant.kind === 'badzone') {
    return false;
  }
  if (instant.kind === 'date') {
    const today = new Date(now);
    const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    return instant.ms < todayMs;
  }
  return instant.ms < now;
};

const readInvite = (source, options = {}) => {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new InviteReadError('EMPTY_INVITE', 'Paste a meeting request first.');
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_BYTES) {
    throw new InviteReadError('INVITE_TOO_LARGE', 'That meeting request is larger than 64 KB.');
  }

  const extracted = extractCalendar(source);
  if (!extracted.calendar) {
    throw new InviteReadError('NOT_A_CALENDAR', 'That paste is not a calendar request.');
  }

  const parsed = parseCalendar(extracted.calendar);
  const isTask = parsed.events.length === 0;
  const items = isTask ? parsed.todos : parsed.events;
  if (items.length === 0) {
    throw new InviteReadError('NO_EVENT', 'That calendar has no meeting or task.');
  }

  const props = items[0];
  const status = props.STATUS ? props.STATUS.value.trim().toUpperCase() : null;
  const sequence = props.SEQUENCE ? Number.parseInt(props.SEQUENCE.value, 10) || 0 : 0;
  const calendarMethod = parsed.method;
  const headerMethod = extracted.methodParam;
  const method = calendarMethod || headerMethod;
  const { stamp, kind } = stampOf(method, status, sequence, isTask);

  const start = parseDate(isTask ? (props.DTSTART || props.DUE) : props.DTSTART);
  const end = props.DTEND
    ? parseDate(props.DTEND)
    : addDuration(start, props.DURATION && props.DURATION.value);

  const organizer = personFrom(props.ORGANIZER);
  const attendees = (props.ATTENDEE || []).map((item) => ({
    name: item.params.CN || null,
    email: emailOf(item.value),
    partstat: item.params.PARTSTAT ? item.params.PARTSTAT.toUpperCase() : null,
    role: item.params.ROLE ? item.params.ROLE.toUpperCase() : null,
  })).filter((item) => item.name || item.email);

  const warnings = [];
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const fromEmail = emailOf(extracted.headers.get('from'));
  const replyTo = emailOf(extracted.headers.get('reply-to'));
  if (fromEmail && organizer?.email && domainOf(fromEmail) !== domainOf(organizer.email)) {
    warnings.push({ code: 'from_mismatch', message: 'The From address is not the organizer.' });
  }
  if (replyTo && organizer?.email && domainOf(replyTo) !== domainOf(organizer.email)) {
    warnings.push({ code: 'reply_to_mismatch', message: 'Reply-To is not the organizer.' });
  }
  if (!organizer?.email && (kind === 'request' || kind === 'update' || kind === 'cancellation')) {
    warnings.push({ code: 'no_organizer', message: 'This request names no organizer.' });
  }
  if (calendarMethod && headerMethod && calendarMethod !== headerMethod) {
    warnings.push({ code: 'method_mismatch', message: 'The message method and the calendar method disagree.' });
  }
  if (start && !start.valid) {
    warnings.push({ code: 'unreadable_time', message: 'The start time could not be read.' });
  }
  if (start && start.valid && start.tzid && !isValidTimeZone(start.tzid)) {
    warnings.push({ code: 'unknown_timezone', message: 'The timezone on the start time is not a known zone.' });
  }
  if (start && start.valid && isPast(start, now) && kind !== 'cancellation') {
    warnings.push({ code: 'past', message: 'This meeting is already in the past.' });
  }

  const summary = props.SUMMARY ? props.SUMMARY.value.trim() : '';

  return {
    stored: false,
    stamp,
    kind,
    method: method || null,
    summary: summary || null,
    when: start && start.valid ? {
      month: MONTHS[start.month - 1],
      day: String(start.day),
      year: start.year,
      allDay: start.allDay,
      timeLabel: timeLabelOf(start, end),
      timezone: start.allDay ? null : (start.utc ? 'UTC' : start.tzid || null),
      startRaw: start.raw,
      endRaw: end && end.raw ? end.raw : null,
    } : null,
    organizer,
    attendees,
    location: props.LOCATION ? props.LOCATION.value.trim() : null,
    url: props.URL ? props.URL.value.trim() : null,
    sequence,
    status,
    uid: props.UID ? props.UID.value.trim() : null,
    additionalEvents: items.length - 1,
    warnings,
  };
};

module.exports = {
  readInvite,
  InviteReadError,
};
