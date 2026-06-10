/**
 * HTTP 层集成测试（无需数据库）。
 * 用 Fastify app.inject 直接打入路由，覆盖鉴权门禁、写校验、统一错误、
 * 微信未配置等在触达 Prisma 之前就能确定的行为，适合 CI。
 *
 * 数据路径（登录入库、绑定、CRUD）需连 MySQL，已在本地用临时 SQLite 端到端验证，
 * 不在此自动化（见 docs/REVIEW_REPORT.md 待办：CI 加带 MySQL 的集成测试）。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildServer } from '../src/server.js';

const app = buildServer();

test.before(async () => {
  await app.ready();
});

test.after(async () => {
  await app.close();
});

test('GET /health → 200 success', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.success, true);
  assert.equal(body.data.status, 'ok');
  assert.equal(body.data.service, 'love-map-mini-api');
});

test('unknown route → 404 NOT_FOUND', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error.code, 'NOT_FOUND');
});

for (const url of ['/api/me', '/api/places', '/api/dashboard', '/api/points/balance', '/api/public-shares', '/api/export', '/api/co-checkin', '/api/notifications/templates', '/api/footprint/overview', '/api/geo/national', '/api/map/markers', '/api/location/status', '/api/location/partner/latest', '/api/map/distance?fromLat=1&fromLng=1&toLat=2&toLng=2', '/api/moods/today', '/api/qa/today', '/api/review', '/api/places/test-id/votes', '/api/profile', '/api/feedback']) {
  test(`GET ${url} without token → 401`, async () => {
    const res = await app.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error.code, 'UNAUTHORIZED');
  });
}

test('POST /api/notifications/subscribe without token → 401', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/notifications/subscribe',
    payload: {},
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error.code, 'UNAUTHORIZED');
});

test('POST /api/ai/memory-copy without token → 401', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/ai/memory-copy',
    payload: {},
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error.code, 'UNAUTHORIZED');
});

test('POST /api/account/delete without token → 401', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/account/delete',
    payload: {},
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error.code, 'UNAUTHORIZED');
});

test('POST /api/media/upload-credential without token → 401', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/media/upload-credential',
    payload: { mimeType: 'image/jpeg' },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error.code, 'UNAUTHORIZED');
});

test('POST /api/auth/mock-login with empty body → 400 VALIDATION_ERROR', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/auth/mock-login', payload: {} });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, 'VALIDATION_ERROR');
});

test('POST /api/auth/wechat-login missing code → 400 VALIDATION_ERROR', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/auth/wechat-login', payload: {} });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, 'VALIDATION_ERROR');
});

test('POST /api/auth/wechat-login when unconfigured → 501 WECHAT_NOT_CONFIGURED', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/wechat-login',
    payload: { code: 'test-code' },
  });
  assert.equal(res.statusCode, 501);
  assert.equal(res.json().error.code, 'WECHAT_NOT_CONFIGURED');
});
