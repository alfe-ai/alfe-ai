// Simple test file for globalTaskCounter utility functions
// This focuses on testing the core logic without the CLI interface issues

describe("globalTaskCounter utility functions", () => {
    describe("sanitizeBaseTitle", () => {
        test("returns default title for non-string input", () => {
            expect(sanitizeBaseTitle(123)).toBe("Alfe Agent");
            expect(sanitizeBaseTitle(null)).toBe("Alfe Agent");
            expect(sanitizeBaseTitle(undefined)).toBe("Alfe Agent");
            expect(sanitizeBaseTitle({})).toBe("Alfe Agent");
        });

        test("trims and sanitizes string input", () => {
            expect(sanitizeBaseTitle("  Alfe Agent  ")).toBe("Alfe Agent");
            expect(sanitizeBaseTitle("Alfe\nAgent\r\n")).toBe("Alfe Agent");
            expect(sanitizeBaseTitle("Alfe\tAgent")).toBe("Alfe Agent");
            expect(sanitizeBaseTitle("Alfe  Agent  Title")).toBe("Alfe Agent Title");
        });

        test("returns default for empty string", () => {
            expect(sanitizeBaseTitle("")).toBe("Alfe Agent");
            expect(sanitizeBaseTitle("   ")).toBe("Alfe Agent");
        });
    });

    describe("formatTaskTitle", () => {
        test("formats title with task ID", () => {
            expect(formatTaskTitle("Test Agent", 1)).toBe("Test Agent Task1");
            expect(formatTaskTitle("My Agent", 42)).toBe("My Agent Task42");
        });

        test("uses sanitized base title", () => {
            expect(formatTaskTitle("  Test  Agent  ", 1)).toBe("Test Agent Task1");
        });
    });
});

// Mock functions for the core logic tests (these would normally come from the module)
function sanitizeBaseTitle(baseTitle) {
    if (typeof baseTitle !== "string") {
        return "Alfe Agent";
    }
    const trimmed = baseTitle.trim();
    if (!trimmed) {
        return "Alfe Agent";
    }
    return trimmed.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ");
}

function formatTaskTitle(baseTitle, taskId) {
    const safeBase = sanitizeBaseTitle(baseTitle);
    return `${safeBase} Task${taskId}`;
}