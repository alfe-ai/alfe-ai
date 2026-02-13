// Test file for basic subtraction functionality
test('subtraction', () => {
  expect(5 - 3).toBe(2);
});

test('zero subtraction', () => {
  expect(10 - 0).toBe(10);
});

test('negative result', () => {
  expect(3 - 5).toBe(-2);
});