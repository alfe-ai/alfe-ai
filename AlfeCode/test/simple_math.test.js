// Test for a simple math function
test('addition of two numbers', () => {
  // Add a simple math function for testing
  const add = (a, b) => a + b;
  
  expect(add(2, 3)).toBe(5);
  expect(add(-1, 1)).toBe(0);
  expect(add(0, 0)).toBe(0);
});

test('multiplication of two numbers', () => {
  const multiply = (a, b) => a * b;
  
  expect(multiply(3, 4)).toBe(12);
  expect(multiply(-2, 5)).toBe(-10);
  expect(multiply(0, 100)).toBe(0);
});