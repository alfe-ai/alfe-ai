
// Agent-added Jest test
test('string reverse works', () => {
  const reverse = (s) => s.split('').reverse().join('');
  expect(reverse('abc')).toBe('cba');
});
