/**
 * 回顾路由：情侣共享的月度 / 年度回顾统计。
 * 所有接口都要求登录，并基于当前 active 情侣关系按 coupleId 做越权隔离。
 * 读取一律过滤 deletedAt: null。
 * 回忆类统计以 Memory.memoryDate（为空回落 createdAt）落在区间内为准；
 * 地点类统计以 Place.visitedAt（为空回落 createdAt）落在区间内为准。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { AppError } from '../utils/errors.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const reviewQuerySchema = z.object({
  period: z.enum(['month', 'year']).optional(),
  value: z.string().optional(),
});

/**
 * 由 period + value 推导出半开区间 [start, end)。
 * month: value 形如 YYYY-MM，缺省取当前自然月。
 * year:  value 形如 YYYY，缺省取当前自然年。
 */
function resolveRange(
  period: 'month' | 'year',
  value: string | undefined
): { start: Date; end: Date; value: string } {
  const now = new Date();

  if (period === 'year') {
    let year = now.getUTCFullYear();
    if (value !== undefined) {
      if (!/^\d{4}$/.test(value)) {
        throw new AppError('VALIDATION_ERROR', 'value: expected YYYY for year period', 400);
      }
      year = Number(value);
    }
    return {
      start: new Date(Date.UTC(year, 0, 1)),
      end: new Date(Date.UTC(year + 1, 0, 1)),
      value: String(year),
    };
  }

  // month
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth(); // 0-based
  if (value !== undefined) {
    const m = /^(\d{4})-(\d{2})$/.exec(value);
    if (!m) {
      throw new AppError('VALIDATION_ERROR', 'value: expected YYYY-MM for month period', 400);
    }
    year = Number(m[1]);
    month = Number(m[2]) - 1;
    if (month < 0 || month > 11) {
      throw new AppError('VALIDATION_ERROR', 'value: month must be 01-12', 400);
    }
  }
  const mm = String(month + 1).padStart(2, '0');
  return {
    start: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month + 1, 1)),
    value: `${year}-${mm}`,
  };
}

export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  // 月度 / 年度回顾：聚合区间内的回忆、地点、城市、省份、照片、标签等统计。
  app.get('/api/review', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const query = parse(reviewQuerySchema, request.query);

    const period = query.period ?? 'month';
    const { start, end, value } = resolveRange(period, query.value);

    // memoryDate 为空时回落 createdAt：区间命中即 (memoryDate ∈ [start,end)) 或 (memoryDate=null 且 createdAt ∈ [start,end))。
    const memoryInRange = {
      coupleId: couple.id,
      deletedAt: null,
      OR: [
        { memoryDate: { gte: start, lt: end } },
        { memoryDate: null, createdAt: { gte: start, lt: end } },
      ],
    };

    // visitedAt 为空时回落 createdAt。
    const placeInRange = {
      coupleId: couple.id,
      deletedAt: null,
      OR: [
        { visitedAt: { gte: start, lt: end } },
        { visitedAt: null, createdAt: { gte: start, lt: end } },
      ],
    };

    const [memoryCount, places, recentMemories, taggedMemories] = await Promise.all([
      prisma.memory.count({ where: memoryInRange }),
      prisma.place.findMany({
        where: placeInRange,
        select: { provinceId: true, cityId: true },
      }),
      prisma.memory.findMany({
        where: memoryInRange,
        select: { id: true, title: true, memoryDate: true, createdAt: true },
        orderBy: [{ memoryDate: 'desc' }, { createdAt: 'desc' }],
        take: 6,
      }),
      prisma.memory.findMany({
        where: { ...memoryInRange, tags: { not: null } },
        select: { tags: true },
      }),
    ]);

    const placeCount = places.length;
    const cityCount = new Set(places.map((p) => p.cityId).filter((id): id is string => id !== null))
      .size;
    const provinceCount = new Set(
      places.map((p) => p.provinceId).filter((id): id is string => id !== null)
    ).size;

    // 照片数：区间内回忆所关联、未删除的 Media 数量。
    const photoCount = await prisma.media.count({
      where: { coupleId: couple.id, deletedAt: null, memory: memoryInRange },
    });

    // 标签词频：逗号拆分、去空白、忽略空串，取前 5。
    const tagFreq = new Map<string, number>();
    for (const m of taggedMemories) {
      if (!m.tags) continue;
      for (const raw of m.tags.split(',')) {
        const tag = raw.trim();
        if (tag === '') continue;
        tagFreq.set(tag, (tagFreq.get(tag) ?? 0) + 1);
      }
    }
    const topTags = [...tagFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));

    return success({
      period,
      value,
      range: { start, end },
      memoryCount,
      placeCount,
      cityCount,
      provinceCount,
      photoCount,
      topTags,
      recentMemories: recentMemories.map((m) => ({
        id: m.id,
        title: m.title,
        memoryDate: m.memoryDate ?? m.createdAt,
      })),
    });
  });
}
