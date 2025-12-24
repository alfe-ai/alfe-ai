const { sum } = require('../alfe/utils/math');

describe('Unit tests for simple utilities', () => {
  test('sum adds two numbers', () => {
    expect(sum(2, 3)).toBe(5);
  });

  test('sum handles negative numbers', () => {
    expect(sum(-2, 3)).toBe(1);
  });
});
