import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app';

describe('Swagger Documentation endpoint', () => {
  it('should serve the Swagger UI at /docs/', async () => {
    // Note: swagger-ui-express typically redirects /docs to /docs/
    const res = await request(app).get('/docs/');

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
