/**
 * 搜索路由：在当前情侣关系范围内，按关键词检索地点与回忆（PRD P1 搜索）。
 * 要求登录，并基于当前 active 情侣关系（coupleId）做越权隔离。
 * 读取一律过滤 deletedAt: null。
 */
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const searchQuerySchema = z.object({
  q: z.string().optional(),
});

type PlaceSearchRow = {
  id: string;
  title: string;
  address: string | null;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  city: string | null;
  placeType: string;
  visibility: string;
};

/** 与 places.ts 的 toPlaceView 保持一致的字段形状（精简版）。 */
function toPlaceSearchView(p: PlaceSearchRow) {
  return {
    id: p.id,
    title: p.title,
    address: p.address,
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    city: p.city,
    placeType: p.placeType,
    visibility: p.visibility,
  };
}

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  // 关键词搜索：地点（标题/地址/城市）与回忆（标题/内容）。
  app.get('/api/search', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { q } = parse(searchQuerySchema, request.query);

    const keyword = q?.trim();
    if (!keyword) {
      return success({ places: [], memories: [] });
    }

    const [placeRows, memoryRows] = await Promise.all([
      prisma.place.findMany({
        where: {
          coupleId: couple.id,
          deletedAt: null,
          OR: [
            { title: { contains: keyword } },
            { address: { contains: keyword } },
            { city: { contains: keyword } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.memory.findMany({
        where: {
          coupleId: couple.id,
          deletedAt: null,
          OR: [
            { title: { contains: keyword } },
            { content: { contains: keyword } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    const places = placeRows.map(toPlaceSearchView);
    const memories = memoryRows.map((m) => ({
      id: m.id,
      title: m.title,
      content: m.content,
      mood: m.mood,
      memoryDate: m.memoryDate,
      placeId: m.placeId,
    }));

    return success({ places, memories });
  });
}
