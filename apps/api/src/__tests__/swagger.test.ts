import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app';

describe('Swagger Documentation endpoint', () => {
  it('should serve the Swagger UI at /docs/', async () => {
    // Note: Due to API Gateway stripping trailing slashes, we explicitly redirect
    // /docs and /docs/ to /docs/index.html in our app configuration.
    const res = await request(app).get('/docs/index.html');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Swagger UI');
  });

  it('should serve the raw swagger.json payload', async () => {
    const res = await request(app).get('/docs/swagger.json');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.openapi).toBe('3.0.0');
    expect(res.body.info.title).toBe('Transaction Reconciliation Engine API');
  });
});
