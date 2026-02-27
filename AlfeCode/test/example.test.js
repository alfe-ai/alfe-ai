// Example test file to demonstrate testing patterns
test('example test case', () => {
  // This is a simple example test
  expect(2 + 2).toBe(4);
});

test('example test with string', () => {
  // Another example with string operations
  const message = 'Hello, World!';
  expect(message).toBe('Hello, World!');
  expect(message).toHaveLength(13);
});