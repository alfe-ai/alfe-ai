// Test for new feature: basic API route response
const request = require('supertest');
const express = require('express');

describe('API route basic test', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.get('/ping', (req, res) => res.json({status: 'ok'}));
  });

  test('GET /ping returns status ok', async () => {
    const res = await request(app).get('/ping');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });
});

