const axios = require('axios');
const https = require('https');
const assert = require('assert');

async function runTests() {
  const port = process.env.AURORA_PORT || process.env.PORT || 3000;
  const protocol = 'https';
  const baseUrl = `${protocol}://localhost:${port}`;
  const httpsAgent = new https.Agent({ rejectUnauthorized: false });

  const opts = { httpsAgent };

  // Always fetch and print the current queue
  const getRes = await axios
    .get(`${baseUrl}/api/pipelineQueue`, opts)
    .catch((err) => err.response || err);
  assert.strictEqual(getRes.status, 200, `Expected 200, got ${getRes.status}`);
  assert.ok(Array.isArray(getRes.data), 'Response should be an array');
  console.log('✓ GET /api/pipelineQueue');
  console.log('Current queue:\n', JSON.stringify(getRes.data, null, 2));

  // Test POST /api/pipelineQueue with missing fields
  const badPost = await axios
    .post(`${baseUrl}/api/pipelineQueue`, {}, opts)
    .catch((err) => err.response || err);
  assert.strictEqual(badPost.status, 400, `Expected 400, got ${badPost.status}`);
  console.log('✓ POST /api/pipelineQueue rejects missing fields');

  // Only create a job when the --create flag is provided
  if (process.argv.includes('--create')) {
    const postBody = { file: 'test.png', type: 'upscale' };
    const postRes = await axios
      .post(`${baseUrl}/api/pipelineQueue`, postBody, opts)
      .catch((err) => err.response || err);
    assert.strictEqual(postRes.status, 200, `Expected 200, got ${postRes.status}`);
    assert.ok(postRes.data && postRes.data.jobId, 'Response should contain jobId');
    console.log('✓ POST /api/pipelineQueue creates job');

    const listRes = await axios
      .get(`${baseUrl}/api/pipelineQueue`, opts)
      .catch((err) => err.response || err);
    assert.strictEqual(listRes.status, 200, `Expected 200, got ${listRes.status}`);
    assert.ok(
      listRes.data.some((j) => j.id === postRes.data.jobId),
      'Job should appear in queue'
    );
    console.log('✓ Job appears in queue');
    console.log('Updated queue:\n', JSON.stringify(listRes.data, null, 2));
  }

  if (process.argv.includes('--reorder')) {
    const listRes = await axios
      .get(`${baseUrl}/api/pipelineQueue`, opts)
      .catch((err) => err.response || err);
    assert.strictEqual(listRes.status, 200, `Expected 200, got ${listRes.status}`);
    const ids = listRes.data.map((j) => j.id).reverse();
    const reorderRes = await axios
      .post(`${baseUrl}/api/pipelineQueue/reorder`, { ids }, opts)
      .catch((err) => err.response || err);
    assert.strictEqual(reorderRes.status, 200, `Expected 200, got ${reorderRes.status}`);
    console.log('✓ POST /api/pipelineQueue/reorder');
  }
}

runTests().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
