const isValidTimeZone = (timeZone) => {
  try {
    Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
};

const offsetMs = (utcMs, timeZone) => {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  dtf.formatToParts(new Date(utcMs)).forEach((part) => {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
  });
  let hour = Number(parts.hour);
  let day = Number(parts.day);
  if (hour === 24) {
    hour = 0;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    day,
    hour,
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - utcMs;
};

const zonedToUtcMs = (parts, timeZone) => {
  const wall = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour || 0,
    parts.minute || 0,
    parts.second || 0
  );
  const first = wall - offsetMs(wall, timeZone);
  return wall - offsetMs(first, timeZone);
};

module.exports = {
  isValidTimeZone,
  zonedToUtcMs,
};
