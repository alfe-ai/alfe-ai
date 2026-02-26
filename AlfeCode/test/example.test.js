// Example test file demonstrating the testing pattern
// This is a sample test to show how tests are structured in this project

test('example test - string operations', () => {
  const message = 'Hello World';
  expect(message).toBe('Hello World');
  expect(message).toContain('World');
  expect(message.length).toBe(11);
});

test('example test - number operations', () => {
  const a = 5;
  const b = 10;
  expect(a + b).toBe(15);
  expect(a * b).toBe(50);
  expect(a < b).toBe(true);
});

test('example test - array operations', () => {
  const items = [1, 2, 3, 4, 5];
  expect(items).toHaveLength(5);
  expect(items).toContain(3);
  expect(items[0]).toBe(1);
  expect(items[items.length - 1]).toBe(5);
});