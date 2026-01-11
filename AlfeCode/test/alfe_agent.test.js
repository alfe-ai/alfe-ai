
// Test added by agent: basic object behavior
test('agent object has expected properties', () => {
  const agent = { name: 'alfe', version: '0.1.0', active: true };
  expect(agent.name).toBe('alfe');
  expect(agent.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(agent.active).toBeTruthy();
});
