// Utility function tests for Alfe AI application

/**
 * Simple utility function to demonstrate testing patterns
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Test suite for utility functions
describe('Utility Functions', () => {
  test('capitalize should convert first character to uppercase', () => {
    expect(capitalize('hello')).toBe('Hello');
    expect(capitalize('world')).toBe('World');
    expect(capitalize('')).toBe('');
  });

  test('formatDate should return YYYY-MM-DD format', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    expect(formatDate(date)).toBe('2024-01-15');
  });

  test('formatDate should handle different date inputs', () => {
    const today = new Date();
    const formatted = formatDate(today);
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// Test suite for array utilities
describe('Array Utilities', () => {
  test('array filtering should work correctly', () => {
    const numbers = [1, 2, 3, 4, 5];
    const evens = numbers.filter(n => n % 2 === 0);
    expect(evens).toEqual([2, 4]);
  });

  test('array mapping should transform values', () => {
    const numbers = [1, 2, 3];
    const doubled = numbers.map(n => n * 2);
    expect(doubled).toEqual([2, 4, 6]);
  });
});