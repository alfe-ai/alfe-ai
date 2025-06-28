const axios = require('axios');
const assert = require('assert');

async function runTests() {
  const port = process.env.AURORA_PORT || process.env.PORT || 3000;
  const baseUrl = `http://localhost:${port}`;

  // Test GET /api/pipelineQueue
  const getRes = await axios.get(`${baseUrl}/api/pipelineQueue`).catch(err => err.response || err);
  assert.strictEqual(getRes.status, 200, `Expected 200, got ${getRes.status}`);
  assert.ok(Array.isArray(getRes.data), 'Response should be an array');
  console.log('✓ GET /api/pipelineQueue');

  // Test POST /api/pipelineQueue with missing fields
  const badPost = await axios.post(`${baseUrl}/api/pipelineQueue`, {}).catch(err => err.response || err);
  assert.strictEqual(badPost.status, 400, `Expected 400, got ${badPost.status}`);
  console.log('✓ POST /api/pipelineQueue rejects missing fields');

  // Test successful POST /api/pipelineQueue
  const postBody = { file: 'test.png', type: 'upscale' };
  const postRes = await axios.post(`${baseUrl}/api/pipelineQueue`, postBody).catch(err => err.response || err);
  assert.strictEqual(postRes.status, 200, `Expected 200, got ${postRes.status}`);
  assert.ok(postRes.data && postRes.data.jobId, 'Response should contain jobId');
  console.log('✓ POST /api/pipelineQueue creates job');

  const listRes = await axios.get(`${baseUrl}/api/pipelineQueue`).catch(err => err.response || err);
  assert.strictEqual(listRes.status, 200, `Expected 200, got ${listRes.status}`);
  assert.ok(listRes.data.some(j => j.id === postRes.data.jobId), 'Job should appear in queue');
  console.log('✓ Job appears in queue');
}

runTests().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
