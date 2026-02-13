/**
 * Test file for basic arithmetic operations.
 * This is a simple test to demonstrate Jest testing patterns in the Alfe AI project.
 */

test('subtraction', () => {
  expect(5 - 3).toBe(2);
});

test('subtraction with negative result', () => {
  expect(3 - 5).toBe(-2);
});

test('subtraction with zero', () => {
  expect(10 - 0).toBe(10);
});

test('subtraction with decimals', () => {
  expect(7.5 - 2.5).toBe(5);
});