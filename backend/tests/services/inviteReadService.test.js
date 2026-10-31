const { readInvite, InviteReadError } = require('../../services/inviteReadService');

const NOW = Date.parse('2026-10-31T12:00:00Z');

const event = (lines) => [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'METHOD:REQUEST',
  'BEGIN:VEVENT',
  'UID:design-review@lab.example',
  'DTSTAMP:20261001T120000Z',
  'DTSTART:20261112T150000Z',
  'DTEND:20261112T153000Z',
  'SUMMARY:Design review',
  'ORGANIZER;CN=Ada Lovelace:mailto:ada@lab.example',
  'ATTENDEE;CN=Grace Hopper;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:mailto:grace@navy.example',
  'LOCATION:Lab 3',
  'SEQUENCE:0',
  ...lines,
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

const read = (source) => readInvite(source, { now: NOW });

describe('inviteReadService', () => {
  it('reads a request into a meeting card and does not keep the source', () => {
    const report = read(event(['URL:https://meet.example/design']));

    expect(report).toEqual(expect.objectContaining({
      stored: false,
      stamp: 'REQUEST',
      kind: 'request',
      method: 'REQUEST',
      summary: 'Design review',
      sequence: 0,
      location: 'Lab 3',
      url: 'https://meet.example/design',
      additionalEvents: 0,
      warnings: [],
    }));
    expect(report.when).toEqual(expect.objectContaining({
      month: 'NOV',
      day: '12',
      year: 2026,
      allDay: false,
      timeLabel: '15:00–15:30 UTC',
      timezone: 'UTC',
    }));
    expect(report.organizer).toEqual({ name: 'Ada Lovelace', email: 'ada@lab.example' });
    expect(report.attendees).toEqual([
      {
        name: 'Grace Hopper',
        email: 'grace@navy.example',
        partstat: 'NEEDS-ACTION',
        role: 'REQ-PARTICIPANT',
      },
    ]);
    expect(JSON.stringify(report)).not.toContain('DTSTAMP');
  });

  it('stamps a later sequence as an update', () => {
    const report = read(event(['SEQUENCE:2']).replace('SEQUENCE:0\r\n', ''));

    expect(report.stamp).toBe('UPDATE');
    expect(report.kind).toBe('update');
    expect(report.sequence).toBe(2);
  });

  it('stamps a cancel method as a cancellation', () => {
    const report = read(event([]).replace('METHOD:REQUEST', 'METHOD:CANCEL'));

    expect(report.stamp).toBe('CANCEL');
    expect(report.kind).toBe('cancellation');
  });

  it('warns when From and Reply-To are not the organizer', () => {
    const source = [
      'From: Payroll <payroll@other.example>',
      'Reply-To: invoices@other.example',
      'Subject: Design review',
      'MIME-Version: 1.0',
      'Content-Type: text/calendar; method=REQUEST; charset=UTF-8',
      '',
      event([]),
    ].join('\r\n');

    const report = read(source);

    expect(report.warnings.map((warning) => warning.code)).toEqual([
      'from_mismatch',
      'reply_to_mismatch',
    ]);
  });

  it('stays quiet when From matches the organizer', () => {
    const source = [
      'From: Ada Lovelace <ada@lab.example>',
      'Content-Type: text/calendar; charset=UTF-8',
      '',
      event([]),
    ].join('\r\n');

    expect(read(source).warnings).toEqual([]);
  });

  it('reads a quoted-printable calendar part and leaves the plain part out', () => {
    const source = [
      'From: Ada Lovelace <ada@lab.example>',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="invite-bound"',
      '',
      '--invite-bound',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      'secret-original-body',
      '',
      '--invite-bound',
      'Content-Type: text/calendar; method=REQUEST; charset=UTF-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      'UID:folded@lab.example',
      'DTSTART:20261112T150000Z',
      'DURATION:PT30M',
      'SUMMARY:Design=',
      ' review',
      'ORGANIZER;CN="Lovelace, Ada":mailto:ada@lab.example',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
      '--invite-bound--',
      '',
    ].join('\r\n');

    const report = read(source);

    expect(report.summary).toBe('Design review');
    expect(report.when.timeLabel).toBe('15:00–15:30 UTC');
    expect(report.organizer).toEqual({ name: 'Lovelace, Ada', email: 'ada@lab.example' });
    expect(JSON.stringify(report)).not.toContain('secret-original-body');
  });

  it('reads an all-day meeting', () => {
    const report = read([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:offsite@lab.example',
      'DTSTART;VALUE=DATE:20261112',
      'DTEND;VALUE=DATE:20261113',
      'SUMMARY:Offsite',
      'ORGANIZER:mailto:ada@lab.example',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n'));

    expect(report.stamp).toBe('PUBLISH');
    expect(report.when).toEqual(expect.objectContaining({
      month: 'NOV',
      day: '12',
      allDay: true,
      timeLabel: 'All day',
    }));
  });

  it('warns when a zoned start is already past and when the zone is unknown', () => {
    const past = read([
      'BEGIN:VCALENDAR',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      'DTSTART;TZID=America/New_York:20261031T070000',
      'SUMMARY:Standup',
      'ORGANIZER:mailto:ada@lab.example',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n'));
    expect(past.when.timeLabel).toBe('07:00 America/New_York');
    expect(past.warnings.map((warning) => warning.code)).toContain('past');

    const unknown = read([
      'BEGIN:VCALENDAR',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      'DTSTART;TZID=Not/AZone:20261112T150000',
      'SUMMARY:Standup',
      'ORGANIZER:mailto:ada@lab.example',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n'));
    expect(unknown.warnings.map((warning) => warning.code)).toContain('unknown_timezone');
    expect(unknown.warnings.map((warning) => warning.code)).not.toContain('past');
  });

  it('reads a task when the calendar has no meeting', () => {
    const report = read([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VTODO',
      'UID:receipt@lab.example',
      'SUMMARY:File the receipt',
      'DUE:20261102T170000Z',
      'END:VTODO',
      'END:VCALENDAR',
    ].join('\n'));

    expect(report.stamp).toBe('TASK');
    expect(report.kind).toBe('task');
    expect(report.summary).toBe('File the receipt');
    expect(report.when.timeLabel).toBe('17:00 UTC');
  });

  it('counts a second meeting instead of hiding it', () => {
    const report = read([
      'BEGIN:VCALENDAR',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      'DTSTART:20261112T150000Z',
      'SUMMARY:First',
      'ORGANIZER:mailto:ada@lab.example',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'DTSTART:20261113T150000Z',
      'SUMMARY:Second',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n'));

    expect(report.summary).toBe('First');
    expect(report.additionalEvents).toBe(1);
  });

  it('reads a base64 calendar part', () => {
    const source = [
      'From: Ada Lovelace <ada@lab.example>',
      'Content-Type: text/calendar; method=REQUEST; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(event([])).toString('base64'),
    ].join('\n');

    expect(read(source).summary).toBe('Design review');
  });

  it('rejects a calendar encoding it cannot read', () => {
    const source = [
      'From: Ada <ada@lab.example>',
      'Content-Type: text/calendar; charset=ISO-8859-1',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('BEGIN:VCALENDAR\nEND:VCALENDAR\n').toString('base64'),
    ].join('\n');

    expect(() => read(source)).toThrow(expect.objectContaining({ code: 'ENCODING_UNSUPPORTED' }));
  });

  it('rejects a paste that is not a calendar', () => {
    expect(() => read('From: Ada <ada@example.com>\n\nHello')).toThrow(InviteReadError);
    try {
      read('From: Ada <ada@example.com>\n\nHello');
    } catch (error) {
      expect(error.code).toBe('NOT_A_CALENDAR');
    }
  });

  it('rejects a calendar with no meeting or task', () => {
    expect(() => read('BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR\n')).toThrow(
      expect.objectContaining({ code: 'NO_EVENT' })
    );
  });

  it('rejects an empty paste and a paste over 64 KB', () => {
    expect(() => read('  \n')).toThrow(expect.objectContaining({ code: 'EMPTY_INVITE' }));
    expect(() => read(`${'x'.repeat((64 * 1024) + 1)}`)).toThrow(
      expect.objectContaining({ code: 'INVITE_TOO_LARGE' })
    );
  });
});
