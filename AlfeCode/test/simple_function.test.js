// Test for a simple utility function
test('simple addition function', () => {
  // Define a simple addition function
  const add = (a, b) => a + b;
  
  // Test cases
  expect(add(2, 3)).toBe(5);
  expect(add(-1, 1)).toBe(0);
  expect(add(0, 0)).toBe(0);
  expect(add(1.5, 2.5)).toBe(4);
});