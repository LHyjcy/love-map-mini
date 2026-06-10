/**
 * 地图聚合标记路由：把情侣的地点 / 回忆 / 本人打卡聚合成统一 marker 列表。
 * 要求登录，并基于当前 active 情侣关系按 coupleId 做越权隔离；读取一律过滤 deletedAt: null。
 * 隐私约束：checkin 只返回请求者本人的记录，绝不在此暴露伴侣位置（伴侣位置归 LocationShare 模块负责）。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const markerKinds = ['place', 'memory', 'checkin'] as const;
type MarkerKind = (typeof markerKinds)[number];

const querySchema = z.object({
  kinds: z.string().optional(),
});

/** 把逗号分隔的 kinds 解析为去重后的集合；缺省或无合法值时返回全部。 */
function resolveKinds(raw: string | undefined): Set<MarkerKind> {
  if (raw === undefined || raw.trim() === '') {
    return new Set(markerKinds);
  }
  const picked = raw
    .split(',')
    .map((k) => k.trim())
    .filter((k): k is MarkerKind => (markerKinds as readonly string[]).includes(k));
  return picked.length > 0 ? new Set(picked) : new Set(markerKinds);
}

export async function mapMarkerRoutes(app: FastifyInstance): Promise<void> {
  // 聚合地图标记：根据 kinds 返回地点 / 回忆 / 本人打卡的轻量 marker。
  app.get('/api/map/markers', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { kinds } = parse(querySchema, request.query);
    const wanted = resolveKinds(kinds);

    const markers: Array<{
      kind: MarkerKind;
      id: string;
      latitude: number;
      longitude: number;
      title: string;
      placeType?: string;
    }> = [];

    // 三类查询互相独立，按需并行执行；各自加 take 上限避免一次性拉取过多行。
    const [places, memories, checkins] = await Promise.all([
      wanted.has('place')
        ? prisma.place.findMany({
            where: { coupleId: couple.id, deletedAt: null },
            select: { id: true, latitude: true, longitude: true, title: true, placeType: true },
            orderBy: { createdAt: 'desc' },
            take: 500,
          })
        : [],
      wanted.has('memory')
        ? // 回忆本身无坐标，坐标来自关联的 place；place 缺失或已软删的回忆跳过。
          prisma.memory.findMany({
            where: { coupleId: couple.id, deletedAt: null, place: { deletedAt: null } },
            select: {
              id: true,
              title: true,
              place: { select: { latitude: true, longitude: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 500,
          })
        : [],
      wanted.has('checkin')
        ? // 仅请求者本人的打卡；不暴露伴侣位置。
          prisma.checkin.findMany({
            where: { coupleId: couple.id, userId, deletedAt: null },
            select: { id: true, latitude: true, longitude: true, address: true },
            orderBy: { createdAt: 'desc' },
            take: 200,
          })
        : [],
    ]);

    for (const p of places) {
      markers.push({
        kind: 'place',
        id: p.id,
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
        title: p.title,
        placeType: p.placeType,
      });
    }

    for (const m of memories) {
      if (!m.place) continue;
      markers.push({
        kind: 'memory',
        id: m.id,
        latitude: Number(m.place.latitude),
        longitude: Number(m.place.longitude),
        title: m.title,
      });
    }

    for (const c of checkins) {
      markers.push({
        kind: 'checkin',
        id: c.id,
        latitude: Number(c.latitude),
        longitude: Number(c.longitude),
        title: c.address ?? '打卡',
      });
    }

    return success({ markers });
  });
}
