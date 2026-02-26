// Test for hello world functionality
test('hello world test', () => {
  const message = 'hello world';
  expect(message).toBe('hello world');
});

test('hello world contains world', () => {
  const message = 'hello world';
  expect(message).toContain('world');
});