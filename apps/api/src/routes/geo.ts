/**
 * 行政区划边界路由：为地图页提供省/市级 GeoJSON 边界数据。
 * 边界本身是公开地理数据（来源 DataV.GeoAtlas），不含任何情侣隐私信息，
 * 因此只要求登录（app.authenticate），不做 coupleId 越权隔离。
 * 数据优先读取本地缓存 assets/geo/<adcode>_full.json；缺失时回源拉取并落盘缓存。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../utils/errors.js';
import { success } from '../utils/response.js';

/** 已解析的边界 JSON 内存缓存，按 adcode 索引。 */
const boundaryCache = new Map<string, unknown>();

/**
 * 定位 assets/geo 目录。
 * 源码位于 src/routes，编译产物位于 dist/src/routes，两者相对 ../../assets/geo
 * 都会落到 apps/api/assets/geo（dist 镜像了 src 的目录深度）。
 * 作为兜底再尝试以进程工作目录解析。
 */
function geoDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../assets/geo');
}

/**
 * 读取指定 adcode 的边界 JSON。
 * 1. 命中内存缓存直接返回。
 * 2. 读取本地文件（geoDir 优先，cwd 兜底）。
 * 3. 本地缺失（ENOENT）则回源 DataV 拉取，校验 res.ok，落盘缓存后返回。
 */
async function loadBoundary(adcode: string): Promise<unknown> {
  const cached = boundaryCache.get(adcode);
  if (cached !== undefined) {
    return cached;
  }

  const fileName = `${adcode}_full.json`;
  const primaryPath = path.join(geoDir(), fileName);
  const fallbackPath = path.resolve(process.cwd(), 'assets/geo', fileName);

  let raw: string | null = null;
  let targetPath = primaryPath;
  try {
    raw = await fs.readFile(primaryPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
    try {
      raw = await fs.readFile(fallbackPath, 'utf8');
      targetPath = fallbackPath;
    } catch (err2) {
      if ((err2 as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err2;
      }
      raw = null;
    }
  }

  if (raw !== null) {
    const parsed = JSON.parse(raw);
    boundaryCache.set(adcode, parsed);
    return parsed;
  }

  // 本地无缓存：回源拉取。
  const url = `https://geo.datav.aliyun.com/areas_v3/bound/${adcode}_full.json`;
  let parsed: unknown;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new AppError(
        'GEO_NOT_AVAILABLE',
        `Failed to fetch boundary for adcode ${adcode}: HTTP ${res.status}`,
        502
      );
    }
    parsed = await res.json();
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(
      'GEO_NOT_AVAILABLE',
      `Failed to fetch boundary for adcode ${adcode}: ${(err as Error).message}`,
      502
    );
  }

  // 落盘缓存（失败不影响本次返回）。
  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, JSON.stringify(parsed), 'utf8');
  } catch {
    // 忽略缓存写入错误。
  }

  boundaryCache.set(adcode, parsed);
  return parsed;
}

export async function geoRoutes(app: FastifyInstance): Promise<void> {
  // 全国边界（省级）。
  app.get('/api/geo/national', { preHandler: [app.authenticate] }, async (_request, reply) => {
    const data = await loadBoundary('100000');
    reply.header('Cache-Control', 'public, max-age=86400');
    return success(data);
  });

  // 指定省/市边界，adcode 为 6 位行政区划代码。
  app.get('/api/geo/province/:adcode', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { adcode } = request.params as { adcode: string };
    if (!/^\d{6}$/.test(adcode)) {
      throw new AppError('VALIDATION_ERROR', 'adcode must be a 6-digit code.', 400);
    }
    const data = await loadBoundary(adcode);
    reply.header('Cache-Control', 'public, max-age=86400');
    return success(data);
  });
}
