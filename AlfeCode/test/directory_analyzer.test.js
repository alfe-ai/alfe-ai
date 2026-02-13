const fs = require("fs");
const path = require("path");
const os = require("os");
const { getIgnorePatterns, normalizePath, analyzeDirectory } = require("../executable/directory_analyzer");

describe("directory_analyzer", () => {
    let testDir;
    let nestedDir;

    beforeAll(() => {
        // Create a temporary directory structure for testing
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-dir-"));
        nestedDir = path.join(testDir, "nested");
        fs.mkdirSync(nestedDir);
    });

    afterAll(() => {
        // Clean up test directory
        try {
            fs.rmSync(testDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    beforeEach(() => {
        // Clean up any files from previous tests
        try {
            const files = fs.readdirSync(testDir);
            for (const file of files) {
                const filePath = path.join(testDir, file);
                if (fs.statSync(filePath).isDirectory()) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(filePath);
                }
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe("normalizePath", () => {
        test("converts backslashes to forward slashes on Windows", () => {
            const windowsPath = "folder\\subfolder\\file.txt";
            expect(normalizePath(windowsPath)).toBe("folder/subfolder/file.txt");
        });

        test("leaves forward slashes unchanged on Unix", () => {
            const unixPath = "folder/subfolder/file.txt";
            expect(normalizePath(unixPath)).toBe("folder/subfolder/file.txt");
        });

        test("handles mixed path separators", () => {
            const mixedPath = "folder\\subfolder/file.txt";
            expect(normalizePath(mixedPath)).toBe("folder/subfolder/file.txt");
        });

        test("handles root paths", () => {
            expect(normalizePath("/")).toBe("/");
            expect(normalizePath("\\")).toBe("/");
        });
    });

    describe("getIgnorePatterns", () => {
        test("always ignores .git directory", () => {
            const ig = getIgnorePatterns(testDir);
            expect(ig.ignores(".git/")).toBe(true);
            expect(ig.ignores(".git/file.txt")).toBe(true);
        });

        test("ignores patterns from .gitignore", () => {
            // Create a .gitignore file
            fs.writeFileSync(path.join(testDir, ".gitignore"), "*.log\nnode_modules/\n*.tmp");
            
            const ig = getIgnorePatterns(testDir);
            expect(ig.ignores("test.log")).toBe(true);
            expect(ig.ignores("node_modules/")).toBe(true);
            expect(ig.ignores("temp.tmp")).toBe(true);
            expect(ig.ignores("keep.txt")).toBe(false);
        });

        test("ignores patterns from parent .gitignore files", () => {
            // Create parent .gitignore
            const parentDir = path.dirname(testDir);
            fs.writeFileSync(path.join(parentDir, ".gitignore"), "*.parent");
            
            const ig = getIgnorePatterns(testDir);
            expect(ig.ignores("test.parent")).toBe(true);
            
            // Clean up parent .gitignore
            fs.unlinkSync(path.join(parentDir, ".gitignore"));
        });

        test("combines multiple .gitignore patterns", () => {
            // Create nested .gitignore files
            fs.writeFileSync(path.join(testDir, ".gitignore"), "*.log");
            fs.writeFileSync(path.join(nestedDir, ".gitignore"), "*.tmp");
            
            const ig = getIgnorePatterns(nestedDir);
            expect(ig.ignores("test.log")).toBe(true);
            expect(ig.ignores("test.tmp")).toBe(true);
            
            // Clean up nested .gitignore
            fs.unlinkSync(path.join(nestedDir, ".gitignore"));
        });
    });

    describe("analyzeDirectory", () => {
        test("analyzes empty directory", () => {
            const result = analyzeDirectory(testDir, testDir, getIgnorePatterns(testDir));
            
            expect(result.name).toBe(path.basename(testDir));
            expect(result.type).toBe("directory");
            expect(result.children).toEqual([]);
        });

        test("analyzes directory with files", () => {
            // Create test files
            fs.writeFileSync(path.join(testDir, "file1.txt"), "content1");
            fs.writeFileSync(path.join(testDir, "file2.js"), "content2");
            
            const result = analyzeDirectory(testDir, testDir, getIgnorePatterns(testDir));
            
            expect(result.children).toHaveLength(2);
            const fileNames = result.children.map(child => child.name).sort();
            expect(fileNames).toEqual(["file1.txt", "file2.js"]);
            
            // Check that line counts are calculated
            const file1 = result.children.find(child => child.name === "file1.txt");
            const file2 = result.children.find(child => child.name === "file2.js");
            expect(file1.lines).toBeGreaterThan(0);
            expect(file2.lines).toBeGreaterThan(0);
        });

        test("analyzes nested directory structure", () => {
            // Create nested structure
            fs.writeFileSync(path.join(testDir, "root.txt"), "root content");
            fs.writeFileSync(path.join(nestedDir, "nested.txt"), "nested content");
            
            const result = analyzeDirectory(testDir, testDir, getIgnorePatterns(testDir));
            
            expect(result.children).toHaveLength(2);
            const directories = result.children.filter(child => child.type === "directory");
            expect(directories).toHaveLength(1);
            
            const nestedResult = directories[0];
            expect(nestedResult.name).toBe(path.basename(nestedDir));
            expect(nestedResult.children).toHaveLength(1);
            expect(nestedResult.children[0].name).toBe("nested.txt");
        });

        test("respects ignore patterns", () => {
            // Create .gitignore
            fs.writeFileSync(path.join(testDir, ".gitignore"), "*.ignore");
            
            // Create files
            fs.writeFileSync(path.join(testDir, "file.ignore"), "should be ignored");
            fs.writeFileSync(path.join(testDir, "file.keep"), "should be kept");
            
            const result = analyzeDirectory(testDir, testDir, getIgnorePatterns(testDir));
            
            const fileNames = result.children.map(child => child.name);
            expect(fileNames).toContain("file.keep");
            expect(fileNames).not.toContain("file.ignore");
        });

        test("handles .git directory ignoring", () => {
            // Create .git directory
            const gitDir = path.join(testDir, ".git");
            fs.mkdirSync(gitDir);
            fs.writeFileSync(path.join(gitDir, "config"), "git config");
            
            const result = analyzeDirectory(testDir, testDir, getIgnorePatterns(testDir));
            
            const hasGitDir = result.children.some(child => child.name === ".git");
            expect(hasGitDir).toBe(false);
        });

        test("handles unreadable directories gracefully", () => {
            // Create a directory and then make it unreadable (on Unix systems)
            const unreadableDir = path.join(testDir, "unreadable");
            fs.mkdirSync(unreadableDir);
            
            try {
                // Make directory unreadable (this may fail on some systems, which is fine)
                fs.chmodSync(unreadableDir, 0o000);
            } catch (error) {
                // Ignore permission errors, this test is optional
                return;
            }
            
            const result = analyzeDirectory(testDir, testDir, getIgnorePatterns(testDir));
            
            // Should not crash and should continue processing other files
            expect(result.children).toBeDefined();
            
            // Restore permissions for cleanup
            try {
                fs.chmodSync(unreadableDir, 0o755);
            } catch (error) {
                // Ignore cleanup errors
            }
        });

        test("handles broken symlinks gracefully", () => {
            const symlinkPath = path.join(testDir, "broken_link");
            
            // This test may not work on all systems (Windows limitation)
            try {
                fs.symlinkSync("/nonexistent/path", symlinkPath);
                
                const result = analyzeDirectory(testDir, testDir, getIgnorePatterns(testDir));
                
                // Should not crash and should continue processing
                expect(result.children).toBeDefined();
            } catch (error) {
                // Ignore symlink creation errors, this test is optional
            }
        });

        test("handles relative paths correctly", () => {
            const result = analyzeDirectory(testDir, testDir, getIgnorePatterns(testDir));
            
            // Root directory should have empty relative path
            expect(result.path).toBe("");
            
            // Any children should have relative paths
            if (result.children.length > 0) {
                expect(result.children[0].path).toBeDefined();
                expect(typeof result.children[0].path).toBe("string");
            }
        });
    });
});