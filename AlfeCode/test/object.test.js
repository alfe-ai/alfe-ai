// Test added by agent

test('object keys order and contents', () => {
  const obj = {a: 1, b: 2};
  expect(Object.keys(obj)).toEqual(['a', 'b']);
});
