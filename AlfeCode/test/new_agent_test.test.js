// New test added by agent
test('object has property', () => {
  const obj = { a: 1, b: 2 };
  expect(obj).toHaveProperty('b');
});
