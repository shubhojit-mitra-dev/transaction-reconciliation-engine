import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app';

describe('Global Error Handler', () => {
  it('should return JSON error for an unhandled route (404)', async () => {
    const res = await request(app).get('/this-route-does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    // Must be JSON, NOT the default Express HTML page
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('should return 500 JSON error when a route throws', async () => {
    const res = await request(app).get('/test-error');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
