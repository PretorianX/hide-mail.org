const {
  createGroupId,
  isValidGroupId,
  groupIdFromHeaders,
} = require('../../utils/inboxGroupId');

describe('inboxGroupId', () => {
  it('mints 32 lowercase hex characters', () => {
    const groupId = createGroupId();

    expect(groupId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('does not repeat itself', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createGroupId()));

    expect(ids.size).toBe(50);
  });

  it('accepts a well formed id', () => {
    expect(isValidGroupId('0123456789abcdef0123456789abcdef')).toBe(true);
  });

  it.each([
    ['too short', '0123456789abcdef'],
    ['too long', '0123456789abcdef0123456789abcdef0'],
    ['non hex', '0123456789abcdefg123456789abcdef'],
    ['empty', ''],
    ['missing', undefined],
    ['not a string', 12345],
  ])('rejects an id that is %s', (_label, value) => {
    expect(isValidGroupId(value)).toBe(false);
  });

  it('reads the group from the request header, case insensitively', () => {
    const groupId = groupIdFromHeaders({
      'x-inbox-group': '0123456789ABCDEF0123456789abcdef',
    });

    expect(groupId).toBe('0123456789abcdef0123456789abcdef');
  });

  it('trims surrounding whitespace', () => {
    expect(groupIdFromHeaders({ 'x-inbox-group': '  0123456789abcdef0123456789abcdef  ' }))
      .toBe('0123456789abcdef0123456789abcdef');
  });

  it('returns null when the header is absent', () => {
    expect(groupIdFromHeaders({})).toBeNull();
  });

  it('returns null rather than a malformed group', () => {
    expect(groupIdFromHeaders({ 'x-inbox-group': 'not-a-group' })).toBeNull();
  });
});
