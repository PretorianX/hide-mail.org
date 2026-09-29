import ENTRIES, { guideFor, guideEntries, guidePathFor } from './mailGradeGuide';

describe('mailGradeGuide', () => {
  test('covers every known finding id with cause and fix', () => {
    const entries = guideEntries();
    expect(entries.length).toBe(Object.keys(ENTRIES).length);
    expect(entries.length).toBeGreaterThan(20);

    entries.forEach((entry) => {
      expect(entry.id).toMatch(/^[a-z0-9_]+$/);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.cause.length).toBeGreaterThan(10);
      expect(entry.fix.length).toBeGreaterThan(10);
      expect(guideFor(entry.id)).toEqual({
        title: entry.title,
        cause: entry.cause,
        fix: entry.fix,
      });
    });
  });

  test('builds deep links into the guide page', () => {
    expect(guidePathFor('spam_phrases')).toBe('/grade/guide#spam_phrases');
    expect(guideFor('not_a_real_finding')).toBeNull();
  });
});
