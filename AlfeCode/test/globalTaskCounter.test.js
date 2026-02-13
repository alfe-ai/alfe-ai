const path = require("path");
const fs = require("fs");
const os = require("os");
const {
    getNextTaskId,
    getNextTaskTitle,
    getNextTaskInfo,
    peekLastTaskId,
    formatTaskTitle,
    sanitizeBaseTitle,
} = require("../executable/globalTaskCounter");

const STATE_FILE = path.join(os.tmpdir(), "test_global_agent_task_state.json");
const LOCK_DIR = path.join(os.tmpdir(), ".test_locks", "global_agent_task");
const ORIGINAL_ENV = { ...process.env };

describe("globalTaskCounter", () => {
    let originalStateRoot;

    beforeAll(() => {
        // Mock environment variables to use test directories
        originalStateRoot = process.env.STERLING_GLOBAL_STATE_DIR;
        process.env.STERLING_GLOBAL_STATE_DIR = path.join(os.tmpdir(), "test_sterling_state");
        
        // Clean up any existing test state
        try {
            if (fs.existsSync(STATE_FILE)) {
                fs.unlinkSync(STATE_FILE);
            }
            if (fs.existsSync(LOCK_DIR)) {
                fs.rmSync(LOCK_DIR, { recursive: true, force: true });
            }
            if (fs.existsSync(process.env.STERLING_GLOBAL_STATE_DIR)) {
                fs.rmSync(process.env.STERLING_GLOBAL_STATE_DIR, { recursive: true, force: true });
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    afterAll(() => {
        // Restore original environment
        if (originalStateRoot) {
            process.env.STERLING_GLOBAL_STATE_DIR = originalStateRoot;
        } else {
            delete process.env.STERLING_GLOBAL_STATE_DIR;
        }
        
        // Clean up test state
        try {
            if (fs.existsSync(STATE_FILE)) {
                fs.unlinkSync(STATE_FILE);
            }
            if (fs.existsSync(LOCK_DIR)) {
                fs.rmSync(LOCK_DIR, { recursive: true, force: true });
            }
            if (fs.existsSync(process.env.STERLING_GLOBAL_STATE_DIR)) {
                fs.rmSync(process.env.STERLING_GLOBAL_STATE_DIR, { recursive: true, force: true });
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    beforeEach(() => {
        // Clean state before each test
        try {
            if (fs.existsSync(STATE_FILE)) {
                fs.unlinkSync(STATE_FILE);
            }
            if (fs.existsSync(LOCK_DIR)) {
                fs.rmSync(LOCK_DIR, { recursive: true, force: true });
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe("sanitizeBaseTitle", () => {
        test("returns default title for non-string input", () => {
            expect(sanitizeBaseTitle(null)).toBe("Alfe Agent");
            expect(sanitizeBaseTitle(undefined)).toBe("Alfe Agent");
            expect(sanitizeBaseTitle(123)).toBe("Alfe Agent");
            expect(sanitizeBaseTitle({})).toBe("Alfe Agent");
        });

        test("returns default title for empty or whitespace-only strings", () => {
            expect(sanitizeBaseTitle("")).toBe("Alfe Agent");
            expect(sanitizeBaseTitle("   ")).toBe("Alfe Agent");
            expect(sanitizeBaseTitle("\t\n")).toBe("Alfe Agent");
        });

        test("trims whitespace and normalizes internal whitespace", () => {
            expect(sanitizeBaseTitle("  My Task  ")).toBe("My Task");
            expect(sanitizeBaseTitle("My  Task")).toBe("My Task");
            expect(sanitizeBaseTitle("My\tTask\nTest")).toBe("My Task Test");
            expect(sanitizeBaseTitle("My   Task")).toBe("My Task");
        });

        test("handles special characters and newlines", () => {
            expect(sanitizeBaseTitle("Task\r\nTitle")).toBe("Task Title");
            expect(sanitizeBaseTitle("Task\t\tTitle")).toBe("Task Title");
        });
    });

    describe("formatTaskTitle", () => {
        test("formats title with default base title", () => {
            expect(formatTaskTitle("Alfe Agent", 1)).toBe("Alfe Agent Task1");
            expect(formatTaskTitle("Alfe Agent", 42)).toBe("Alfe Agent Task42");
        });

        test("formats title with custom base title", () => {
            expect(formatTaskTitle("My Custom Task", 5)).toBe("My Custom Task Task5");
        });

        test("handles sanitized base titles", () => {
            expect(formatTaskTitle("  Invalid   Title  ", 3)).toBe("Invalid Title Task3");
        });
    });

    describe("peekLastTaskId", () => {
        test("returns 0 when no state file exists", () => {
            expect(peekLastTaskId()).toBe(0);
        });

        test("returns last task id from existing state", () => {
            // Create a state file with specific content
            fs.writeFileSync(
                STATE_FILE,
                JSON.stringify({ lastTaskId: 10, updatedAt: "2023-01-01T00:00:00.000Z" })
            );
            expect(peekLastTaskId()).toBe(10);
        });

        test("returns 0 for invalid state file content", () => {
            fs.writeFileSync(STATE_FILE, "invalid json");
            expect(peekLastTaskId()).toBe(0);
        });

        test("returns 0 for state file with invalid lastTaskId", () => {
            fs.writeFileSync(
                STATE_FILE,
                JSON.stringify({ lastTaskId: "invalid", updatedAt: "2023-01-01T00:00:00.000Z" })
            );
            expect(peekLastTaskId()).toBe(0);
        });

        test("returns 0 for negative lastTaskId", () => {
            fs.writeFileSync(
                STATE_FILE,
                JSON.stringify({ lastTaskId: -5, updatedAt: "2023-01-01T00:00:00.000Z" })
            );
            expect(peekLastTaskId()).toBe(0);
        });

        test("returns 0 for non-numeric lastTaskId", () => {
            fs.writeFileSync(
                STATE_FILE,
                JSON.stringify({ lastTaskId: NaN, updatedAt: "2023-01-01T00:00:00.000Z" })
            );
            expect(peekLastTaskId()).toBe(0);
        });
    });

    describe("getNextTaskId", () => {
        test("increments task id on each call", () => {
            expect(getNextTaskId()).toBe(1);
            expect(getNextTaskId()).toBe(2);
            expect(getNextTaskId()).toBe(3);
        });

        test("starts from existing state", () => {
            // Set initial state
            fs.writeFileSync(
                STATE_FILE,
                JSON.stringify({ lastTaskId: 5, updatedAt: "2023-01-01T00:00:00.000Z" })
            );
            
            expect(getNextTaskId()).toBe(6);
            expect(getNextTaskId()).toBe(7);
        });

        test("handles corrupted state file gracefully", () => {
            fs.writeFileSync(STATE_FILE, "invalid json");
            
            expect(getNextTaskId()).toBe(1);
            expect(getNextTaskId()).toBe(2);
        });
    });

    describe("getNextTaskTitle", () => {
        test("generates title with default base title", () => {
            expect(getNextTaskTitle()).toBe("Alfe Agent Task1");
            expect(getNextTaskTitle()).toBe("Alfe Agent Task2");
        });

        test("generates title with custom base title", () => {
            expect(getNextTaskTitle("My Task")).toBe("My Task Task1");
            expect(getNextTaskTitle("My Task")).toBe("My Task Task2");
        });

        test("sanitizes base title before formatting", () => {
            expect(getNextTaskTitle("  Invalid   Title  ")).toBe("Invalid Title Task1");
        });
    });

    describe("getNextTaskInfo", () => {
        test("returns both task id and title", () => {
            const info = getNextTaskInfo("Test Task");
            expect(info).toHaveProperty("taskId");
            expect(info).toHaveProperty("title");
            expect(typeof info.taskId).toBe("number");
            expect(typeof info.title).toBe("string");
            expect(info.title).toContain("Test Task");
        });

        test("increments task id consistently", () => {
            const info1 = getNextTaskInfo("Test");
            const info2 = getNextTaskInfo("Test");
            expect(info2.taskId).toBe(info1.taskId + 1);
        });

        test("handles empty base title", () => {
            const info = getNextTaskInfo("");
            expect(info.title).toContain("Alfe Agent");
        });
    });

    describe("state persistence", () => {
        test("persists state to file after incrementing", () => {
            const initialId = getNextTaskId();
            const stateContent = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
            
            expect(stateContent.lastTaskId).toBe(initialId);
            expect(stateContent.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });

        test("updates state incrementally", () => {
            getNextTaskId(); // 1
            getNextTaskId(); // 2
            getNextTaskId(); // 3
            
            const stateContent = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
            expect(stateContent.lastTaskId).toBe(3);
        });
    });
});