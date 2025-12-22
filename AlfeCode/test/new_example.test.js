const request = require('supertest');
const app = require('../executable/server_webserver');

describe('Basic smoke test', () => {
    it('server module should export a function or object', () => {
        expect(app).toBeDefined();
    });
});
