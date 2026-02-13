const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');
const rdsStore = require('../rds_store');
const { loadRepoConfig, saveRepoConfig, loadRepoJson, saveRepoJson } = require('../server_defs');
const router = require('../alfe/Aurelix/dev/api_connector');

// Mock rdsStore to avoid database connections in tests
jest.mock('../rds_store', () => ({
  enabled: false,
  init: jest.fn(),
  getSetting: jest.fn(),
  setSetting: jest.fn(),
  query: jest.fn(),
  close: jest.fn()
}));

// Create test app
const app = express();
app.use(express.json());
app.use('/api', router);

describe('API Connector Tests', () => {
  const testRepo = 'test-repo';
  const testRepoPath = path.join(__dirname, 'temp-test-repo');

  beforeAll(() => {
    // Setup test directory
    if (!fs.existsSync(testRepoPath)) {
      fs.mkdirSync(testRepoPath, { recursive: true });
    }
    
    // Setup test config
    const config = loadRepoConfig() || {};
    config[testRepo] = {
      gitRepoLocalPath: testRepoPath,
      gitBranch: 'main'
    };
    saveRepoConfig(config);
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(testRepoPath)) {
      fs.rmSync(testRepoPath, { recursive: true, force: true });
    }
    
    const config = loadRepoConfig() || {};
    delete config[testRepo];
    saveRepoConfig(config);
  });

  beforeEach(() => {
    // Clear test repo data
    const dataObj = {};
    saveRepoJson(testRepo, dataObj);
  });

  describe('POST /createChat', () => {
    it('should create a new chat with global instructions', async () => {
      const response = await request(app)
        .post('/api/createChat')
        .send({ repoName: testRepo });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.repoName).toBe(testRepo);
      expect(response.body.newChatNumber).toBe(1);

      // Verify chat data was saved
      const dataObj = loadRepoJson(testRepo);
      expect(dataObj[1]).toBeDefined();
      expect(dataObj[1].status).toBe('ACTIVE');
      expect(dataObj[1].agentInstructions).toBeDefined();
      expect(dataObj[1].attachedFiles).toEqual([]);
      expect(dataObj[1].chatHistory).toEqual([]);
      expect(dataObj[1].aiProvider).toBe('openrouter');
      expect(dataObj[1].aiModel).toBe('deepseek/deepseek-chat');
    });

    it('should return error when repoName is missing', async () => {
      const response = await request(app)
        .post('/api/createChat')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('repoName is required.');
    });

    it('should increment chat numbers for existing repo', async () => {
      // Create first chat
      await request(app).post('/api/createChat').send({ repoName: testRepo });
      
      // Create second chat
      const response = await request(app)
        .post('/api/createChat')
        .send({ repoName: testRepo });

      expect(response.body.newChatNumber).toBe(2);
    });
  });

  describe('POST /createGenericChat', () => {
    it('should create a generic chat', async () => {
      const response = await request(app)
        .post('/api/createGenericChat')
        .send({ message: 'test message' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('test message');
      expect(response.body.data.chatId).toBeDefined();
      expect(response.body.data.status).toBe('ACTIVE');
    });

    it('should handle missing message', async () => {
      const response = await request(app)
        .post('/api/createGenericChat')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('No message provided');
    });
  });

  describe('GET /listFileTree/:repoName/:chatNumber', () => {
    beforeEach(() => {
      // Create test chat
      const dataObj = {
        1: {
          status: 'ACTIVE',
          agentInstructions: '',
          attachedFiles: [],
          chatHistory: [],
          aiProvider: 'openrouter',
          aiModel: 'deepseek/deepseek-chat',
          gitBranch: 'main'
        }
      };
      saveRepoJson(testRepo, dataObj);
    });

    it('should return file tree for valid repo and chat', async () => {
      const response = await request(app)
        .get(`/api/listFileTree/${testRepo}/1`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.tree).toBeDefined();
      expect(response.body.tree.name).toBe('temp-test-repo');
      expect(response.body.tree.type).toBe('directory');
      expect(response.body.tree.children).toBeDefined();
    });

    it('should return error for non-existent repo', async () => {
      const response = await request(app)
        .get('/api/listFileTree/non-existent-repo/1');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Repo 'non-existent-repo' not found.");
    });

    it('should return error for non-existent chat', async () => {
      const response = await request(app)
        .get(`/api/listFileTree/${testRepo}/999`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe(`Chat #999 not found in repo '${testRepo}'.`);
    });
  });

  describe('POST /changeBranchOfChat/:repoName/:chatNumber', () => {
    beforeEach(() => {
      // Create test chat with gitBranch
      const dataObj = {
        1: {
          status: 'ACTIVE',
          agentInstructions: '',
          attachedFiles: [],
          chatHistory: [],
          aiProvider: 'openrouter',
          aiModel: 'deepseek/deepseek-chat',
          gitBranch: 'main'
        }
      };
      saveRepoJson(testRepo, dataObj);
    });

    it('should return error for non-existent repo', async () => {
      const response = await request(app)
        .post(`/api/changeBranchOfChat/non-existent-repo/1`)
        .send({ branchName: 'test-branch' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Repo 'non-existent-repo' not found.");
    });

    it('should return error for non-existent chat', async () => {
      const response = await request(app)
        .post(`/api/changeBranchOfChat/${testRepo}/999`)
        .send({ branchName: 'test-branch' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe(`Chat #999 not found in repo '${testRepo}'.`);
    });

    it('should return error when branch name is missing', async () => {
      const response = await request(app)
        .post(`/api/changeBranchOfChat/${testRepo}/1`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("No branch name provided.");
    });

    it('should return error when new branch name is missing for createNew', async () => {
      const response = await request(app)
        .post(`/api/changeBranchOfChat/${testRepo}/1`)
        .send({ createNew: true });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("No new branch name provided.");
    });
  });
});