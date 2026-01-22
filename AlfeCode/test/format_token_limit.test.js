const { formatTokenLimit } = require("../executable/webserver/utils");

describe("formatTokenLimit", () => {
  test("formats thousands with K", () => {
    expect(formatTokenLimit(32000)).toBe("32\u202FK");
  });

  test("formats millions with M", () => {
    expect(formatTokenLimit(1000000)).toBe("1\u202FM");
  });

  test("returns N/A for invalid values", () => {
    expect(formatTokenLimit(null)).toBe("N/A");
  });
});
