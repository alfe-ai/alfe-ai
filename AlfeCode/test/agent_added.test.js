
// Test added by assistant: basic array and promise checks
test('array includes value', () => {
  const arr = [1, 2, 3];
  expect(arr).toContain(2);
});

test('resolves promise', async () => {
  const p = Promise.resolve('ok');
  await expect(p).resolves.toBe('ok');
});
