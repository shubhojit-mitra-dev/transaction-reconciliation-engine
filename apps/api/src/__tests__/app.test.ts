import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app';

describe('Express App Base', () => {
  it('GET /health should return 200 OK', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
