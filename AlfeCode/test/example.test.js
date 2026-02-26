// Example test file following existing conventions
test('example test case', () => {
  // Simple test to verify the test suite is working
  expect(1 + 1).toBe(2);
});

test('example string test', () => {
  const testString = 'Hello, world!';
  expect(testString).toContain('world');
});

test('example object test', () => {
  const testObject = { name: 'test', value: 42 };
  expect(testObject.name).toBe('test');
  expect(testObject.value).toBe(42);
});