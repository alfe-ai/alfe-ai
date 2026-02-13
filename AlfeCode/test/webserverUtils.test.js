const { formatTokenLimit } = require("../executable/webserver/utils");

// Test for formatTokenLimit utility function
describe("formatTokenLimit", () => {
    test("formats thousands with K", () => {
        expect(formatTokenLimit(32000)).toBe("32\u202FK");
    });

    test("formats millions with M", () => {
        expect(formatTokenLimit(1000000)).toBe("1\u202FM");
    });

    test("handles decimal values correctly", () => {
        expect(formatTokenLimit(1500)).toBe("1.5\u202FK");
        expect(formatTokenLimit(1250000)).toBe("1.3\u202FM");
    });

    test("handles edge cases", () => {
        expect(formatTokenLimit(999)).toBe("999");
        expect(formatTokenLimit(1000)).toBe("1\u202FK");
        expect(formatTokenLimit(999999)).toBe("1000\u202FK");
        expect(formatTokenLimit(1000000)).toBe("1\u202FM");
    });

    test("returns N/A for invalid values", () => {
        expect(formatTokenLimit(null)).toBe("N/A");
        expect(formatTokenLimit(undefined)).toBe("N/A");
        expect(formatTokenLimit("invalid")).toBe("N/A");
        expect(formatTokenLimit(-1)).toBe("N/A");
        expect(formatTokenLimit(0)).toBe("N/A");
        expect(formatTokenLimit(NaN)).toBe("N/A");
        expect(formatTokenLimit(Infinity)).toBe("N/A");
    });

    test("handles fractional formatting correctly", () => {
        expect(formatTokenLimit(1234)).toBe("1.2\u202FK");
        expect(formatTokenLimit(12345)).toBe("12.3\u202FK");
        expect(formatTokenLimit(1234567)).toBe("1.2\u202FM");
    });

    test("maintains precision for exact values", () => {
        expect(formatTokenLimit(1000)).toBe("1\u202FK");
        expect(formatTokenLimit(1000000)).toBe("1\u202FM");
        expect(formatTokenLimit(1000000000)).toBe("1000\u202FM");
    });
});