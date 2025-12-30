// Agent-created Jest test

test('reverse string', () => {
  const rev = s => s.split('').reverse().join('');
  expect(rev('abc')).toBe('cba');
});
