/**
 * RFC 4180 CSV encoder with formula-injection neutralization.
 * Prefixes cells that begin with spreadsheet formula/control triggers with `'`.
 */

const FORMULA_TRIGGER_RE = /^[=+\-@\t\r]|^[ ]+[=+\-@]/;

export const escapeCsvCell = (value) => {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (FORMULA_TRIGGER_RE.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export const encodeCsvRow = (fields) => fields.map(escapeCsvCell).join(',');

export const encodeCsv = (headers, rows) =>
  [encodeCsvRow(headers), ...rows.map(encodeCsvRow)].join('\n');
