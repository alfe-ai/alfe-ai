// Second simple Jest test added by the agent
test('object property exists', () => {
  const obj = { a: 1, b: 2 };
  expect(obj).toHaveProperty('b');
});
