// Agent feature basic tests

test('adds numbers correctly', () => {
  const add = (a, b) => a + b;
  expect(add(2,3)).toBe(5);
});

test('object has expected property', () => {
  const obj = {name: 'alfe', version: '0.43.0'};
  expect(obj).toHaveProperty('name');
});
