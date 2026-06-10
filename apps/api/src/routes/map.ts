/**
 * 地图服务路由（MapProvider 适配层对外接口）。
 * 均要求登录。仅做逆地址/搜索/距离/路线/坐标转换，不涉及情侣数据。
 * key 仅后端读取；无 key 时逆地址/搜索/路线返回 501 MAP_NOT_CONFIGURED，distance 仍可用（Haversine）。
 * 搜索做最简单的进程内去抖（同 keyword 300ms 内拒绝），避免误触发刷量。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../utils/errors.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';
import { getMapProvider, reverseGeocodeCached } from '../services/map/index.js';

const latlngQuery = z.object({ lat: z.string(), lng: z.string() });
const searchQuery = z.object({ keyword: z.string().min(1).max(100), lat: z.string().optional(), lng: z.string().optional() });
const distanceQuery = z.object({ fromLat: z.string(), fromLng: z.string(), toLat: z.string(), toLng: z.string() });
const routeQuery = distanceQuery.extend({ mode: z.string().optional() });
const convertBody = z.object({
  latitude: z.number(),
  longitude: z.number(),
  fromType: z.string().min(1),
  toType: z.string().min(1),
});

function num(v: string, name: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new AppError('VALIDATION_ERROR', `参数 ${name} 不是合法数字。`, 400);
  }
  return n;
}

// keyword -> 上次查询时间戳（进程内去抖）。
const lastSearchAt = new Map<string, number>();

export async function mapServiceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/map/reverse-geocode', { preHandler: [app.authenticate] }, async (request) => {
    const q = parse(latlngQuery, request.query);
    const result = await reverseGeocodeCached(num(q.lat, 'lat'), num(q.lng, 'lng'));
    return success(result);
  });

  app.get('/api/map/search-poi', { preHandler: [app.authenticate] }, async (request) => {
    const q = parse(searchQuery, request.query);
    const now = Date.now();
    const prev = lastSearchAt.get(q.keyword) ?? 0;
    if (now - prev < 300) {
      throw new AppError('RATE_LIMITED', '搜索过于频繁，请稍后再试。', 429);
    }
    lastSearchAt.set(q.keyword, now);
    const opts =
      q.lat !== undefined && q.lng !== undefined
        ? { lat: num(q.lat, 'lat'), lng: num(q.lng, 'lng') }
        : undefined;
    const result = await getMapProvider().searchPoi(q.keyword, opts);
    return success(result);
  });

  app.get('/api/map/distance', { preHandler: [app.authenticate] }, async (request) => {
    const q = parse(distanceQuery, request.query);
    const result = await getMapProvider().distance(
      { lat: num(q.fromLat, 'fromLat'), lng: num(q.fromLng, 'fromLng') },
      { lat: num(q.toLat, 'toLat'), lng: num(q.toLng, 'toLng') }
    );
    return success(result);
  });

  app.get('/api/map/route', { preHandler: [app.authenticate] }, async (request) => {
    const q = parse(routeQuery, request.query);
    const result = await getMapProvider().routePlan(
      { lat: num(q.fromLat, 'fromLat'), lng: num(q.fromLng, 'fromLng') },
      { lat: num(q.toLat, 'toLat'), lng: num(q.toLng, 'toLng') },
      q.mode
    );
    return success(result);
  });

  app.post('/api/map/coordinate-convert', { preHandler: [app.authenticate] }, async (request) => {
    const b = parse(convertBody, request.body);
    const result = await getMapProvider().coordinateConvert(b.latitude, b.longitude, b.fromType, b.toType);
    return success(result);
  });
}
