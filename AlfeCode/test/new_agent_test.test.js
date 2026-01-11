
// New Jest test added by the agent
test('object has expected properties', () => {
  const obj = { a: 1, b: 2 };
  expect(obj).toHaveProperty('a');
  expect(obj.b).toBe(2);
});
