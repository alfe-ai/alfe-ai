// Test for string utility behavior

test('trim and lowercase', () => {
  const s = '  HeLLo WoRLD  ';
  const normalized = s.trim().toLowerCase();
  expect(normalized).toBe('hello world');
});
