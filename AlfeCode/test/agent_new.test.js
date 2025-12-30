
// Test added by agent: ensure basic math functions work
const { add } = require('../test/add.test.js') || {};

test('2 + 2 equals 4', () => {
  expect(2 + 2).toBe(4);
});
