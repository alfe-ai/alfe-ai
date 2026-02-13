const fs = require('fs');
const path = require('path');
const serverDefs = require('../server_defs');

// Mock rdsStore to disable it for testing
jest.mock('../rds_store', () => ({
    enabled: false,
    getSetting: jest.fn(),
    setSetting: jest.fn(),
    getSessionSetting: jest.fn(),
    setSessionSetting: jest.fn(),
    prefetchSessionSetting: jest.fn(),
}));

describe('server_defs exported functions', () => {
    let tempDir;
    let originalEnv;
    let originalCwd;

    beforeEach(() => {
        // Create a temporary directory for tests
        tempDir = path.join(__dirname, 'temp_test_dir');
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        fs.mkdirSync(tempDir, { recursive: true });

        // Save original environment and working directory
        originalEnv = process.env.CODEX_CONFIG_PATH;
        originalCwd = process.cwd();

        // Set test environment
        process.chdir(tempDir);
        delete process.env.CODEX_CONFIG_PATH;
        
        // Clear any cached module
        jest.resetModules();
    });

    afterEach(() => {
        // Clean up temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }

        // Restore original environment and working directory
        if (originalEnv) {
            process.env.CODEX_CONFIG_PATH = originalEnv;
        } else {
            delete process.env.CODEX_CONFIG_PATH;
        }
        process.chdir(originalCwd);
    });

    describe('sanitizeSessionId', () => {
        test('should sanitize valid session ID', () => {
            expect(serverDefs.sanitizeSessionId('valid-session_123')).toBe('valid-session_123');
        });

        test('should replace invalid characters', () => {
            expect(serverDefs.sanitizeSessionId('invalid@session#test')).toBe('invalid_session_test');
        });

        test('should truncate long session IDs', () => {
            const longId = 'a'.repeat(150);
            const result = serverDefs.sanitizeSessionId(longId);
            expect(result.length).toBeLessThanOrEqual(120);
        });

        test('should return fallback key for empty/invalid input', () => {
            expect(serverDefs.sanitizeSessionId('')).toBe('default');
            expect(serverDefs.sanitizeSessionId(null)).toBe('default');
            expect(serverDefs.sanitizeSessionId(undefined)).toBe('default');
            expect(serverDefs.sanitizeSessionId(123)).toBe('default');
        });
    });

    describe('loadRepoConfig', () => {
        test('should create new config file if none exists', () => {
            const config = serverDefs.loadRepoConfig('test-session-1');
            expect(config).toEqual({});
        });

        test('should load existing config file', () => {
            const sessionRoot = path.join(__dirname, '..', 'data', 'sessions', 'test-session-2', 'config');
            fs.mkdirSync(sessionRoot, { recursive: true });
            
            const testConfig = { test: 'value' };
            fs.writeFileSync(path.join(sessionRoot, 'repo_config.json'), JSON.stringify(testConfig));
            
            const config = serverDefs.loadRepoConfig('test-session-2');
            expect(config).toEqual(testConfig);
        });
    });

    describe('repo JSON operations', () => {
        test('getRepoJsonPath should return correct path', () => {
            const repoName = 'test-repo';
            const sessionId = 'test-session-3';
            const expectedPath = path.join(__dirname, '..', 'data', 'sessions', 'test-session-3', 'repos', 'test-repo.json');
            const actualPath = serverDefs.getRepoJsonPath(repoName, sessionId);
            expect(actualPath).toBe(expectedPath);
        });

        test('loadRepoJson should create empty file if none exists', () => {
            const repoName = 'test-repo';
            const sessionId = 'test-session-4';
            const config = serverDefs.loadRepoJson(repoName, sessionId);
            expect(config).toEqual({});
        });

        test('saveRepoJson should write data to file', () => {
            const repoName = 'test-repo';
            const sessionId = 'test-session-5';
            const testData = { test: 'value' };
            
            serverDefs.saveRepoJson(repoName, testData, sessionId);
            const loadedData = serverDefs.loadRepoJson(repoName, sessionId);
            expect(loadedData).toEqual(testData);
        });
    });

    describe('codex configuration', () => {
        test('getDefaultCodexModel should return default model', () => {
            const model = serverDefs.getDefaultCodexModel();
            expect(typeof model).toBe('string');
            expect(model.length).toBeGreaterThan(0);
        });

        test('loadCodexConfig should return config object', () => {
            const config = serverDefs.loadCodexConfig();
            expect(config).toHaveProperty('defaultModel');
            expect(config).toHaveProperty('defaultAgentInstructions');
            expect(typeof config.defaultModel).toBe('string');
            expect(typeof config.defaultAgentInstructions).toBe('string');
        });

        test('saveCodexConfig should write config to file', () => {
            const testConfig = {
                defaultModel: 'openai/gpt-4',
                defaultAgentInstructions: 'Test instructions'
            };
            
            serverDefs.saveCodexConfig(testConfig);
            const loadedConfig = serverDefs.loadCodexConfig();
            expect(loadedConfig.defaultModel).toBe('openai/gpt-4');
            expect(loadedConfig.defaultAgentInstructions).toBe('Test instructions');
        });
    });

    describe('session codex model operations', () => {
        test('getSessionCodexModel should return empty string for non-existent session', () => {
            const model = serverDefs.getSessionCodexModel('non-existent-session');
            expect(model).toBe('');
        });

        test('setSessionCodexModel should store valid model', () => {
            const result = serverDefs.setSessionCodexModel('test-session', 'openai/gpt-4');
            expect(result).toBe('openai/gpt-4');
        });

        test('resolveCodexModelForSession should return default model when no session override', () => {
            const defaultModel = serverDefs.getDefaultCodexModel();
            const resolvedModel = serverDefs.resolveCodexModelForSession('test-session');
            expect(resolvedModel).toBe(defaultModel);
        });
    });

    describe('constants', () => {
        test('DEFAULT_CODEX_MODEL should be a string', () => {
            expect(typeof serverDefs.DEFAULT_CODEX_MODEL).toBe('string');
            expect(serverDefs.DEFAULT_CODEX_MODEL.length).toBeGreaterThan(0);
        });

        test('CODEX_MODEL_PATTERN should be a RegExp', () => {
            expect(serverDefs.CODEX_MODEL_PATTERN).toBeInstanceOf(RegExp);
        });
    });
});