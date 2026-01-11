
// Automated test added by agent
test('object has expected properties', () => {
  const obj = { a: 1, b: 'two', c: [3] };
  expect(obj).toHaveProperty('a');
  expect(obj.b).toBe('two');
  expect(obj.c).toContain(3);
});
