// Feature toggle tests
describe('Feature toggles', () => {
  test('default feature is enabled', () => {
    const features = { newUI: true, betaMode: false };
    expect(features.newUI).toBeTruthy();
  });

  test('betaMode is disabled by default', () => {
    const features = { newUI: true, betaMode: false };
    expect(features.betaMode).toBeFalsy();
  });
});
