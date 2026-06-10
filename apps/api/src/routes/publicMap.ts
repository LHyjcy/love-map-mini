/**
 * 公开地图路由：免登录、只读、隐私安全的公开地图内容渲染。
 * 通过 shareCode 找到生效的 PublicShare，再返回该情侣 visibility='public' 的地点与回忆。
 * 隐私约束（见 CLAUDE.md）：
 *   - 公开地图分享默认关闭；分享被关闭（enabled=false）或不存在时一律 404。
 *   - 绝不暴露精确坐标，经纬度统一做模糊化（fuzz）至约 110m 精度。
 *   - 不返回 openid、详细地址、定位精度等任何超出约定字段的数据。
 * 本路由为公开路由，刻意不挂 authenticate preHandler。
 */
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { AppError } from '../utils/errors.js';
import { success } from '../utils/response.js';

/** 坐标模糊化：保留 3 位小数（约 110m），避免暴露精确的家/学校/工作位置。 */
function fuzzCoord(n: Prisma.Decimal | number) {
  return Math.round(Number(n) * 1000) / 1000;
}

export async function publicMapRoutes(app: FastifyInstance): Promise<void> {
  // 公开地图：免登录，按 shareCode 返回该情侣的公开地点与回忆（坐标已模糊化）。
  app.get('/api/public-map/:shareCode', async (request) => {
    const { shareCode } = request.params as { shareCode: string };

    const share = await prisma.publicShare.findFirst({
      where: { shareCode },
    });
    if (!share || !share.enabled) {
      throw new AppError('PUBLIC_SHARE_NOT_FOUND', 'Public share not found or disabled.', 404);
    }

    const placeRows = await prisma.place.findMany({
      where: { coupleId: share.coupleId, deletedAt: null, visibility: 'public' },
      orderBy: { createdAt: 'desc' },
    });

    const places = placeRows.map((p) => ({
      id: p.id,
      title: p.title,
      placeType: p.placeType,
      city: p.city,
      latitude: fuzzCoord(p.latitude),
      longitude: fuzzCoord(p.longitude),
    }));

    const memoryRows = await prisma.memory.findMany({
      where: { coupleId: share.coupleId, deletedAt: null, visibility: 'public' },
      orderBy: { createdAt: 'desc' },
    });

    const memories = memoryRows.map((m) => ({
      id: m.id,
      title: m.title,
      memoryDate: m.memoryDate,
      placeId: m.placeId,
    }));

    // 足迹（省份/城市点亮）：仅基于公开内容计算，绝不泄露私密/仅情侣可见数据。
    // 候选地点：本情侣、未删除、visibility='public'，且具备行政区划 adcode（provinceId/cityId 非空）。
    const footprintPlaces = placeRows.filter(
      (p) => p.provinceId != null && p.cityId != null
    );
    // 点亮规则：placeType='visited' 直接点亮；否则需至少有一条公开回忆。
    // 公开回忆集合（仅取关联到候选地点的 placeId，集合判断即可）。
    const candidatePlaceIds = footprintPlaces.map((p) => p.id);
    const publicMemoryPlaceIds = new Set<string>();
    if (candidatePlaceIds.length > 0) {
      const memWithPublic = await prisma.memory.findMany({
        where: {
          coupleId: share.coupleId,
          deletedAt: null,
          visibility: 'public',
          placeId: { in: candidatePlaceIds },
        },
        select: { placeId: true },
      });
      for (const m of memWithPublic) publicMemoryPlaceIds.add(m.placeId);
    }

    const litProvinceIdSet = new Set<string>();
    const litCityIdSet = new Set<string>();
    for (const p of footprintPlaces) {
      const lit = p.placeType === 'visited' || publicMemoryPlaceIds.has(p.id);
      if (!lit) continue;
      // provinceId/cityId 已在过滤阶段确认非空。
      litProvinceIdSet.add(p.provinceId as string);
      litCityIdSet.add(p.cityId as string);
    }

    const litProvinceIds = Array.from(litProvinceIdSet);
    const litCityIds = Array.from(litCityIdSet);
    const footprint = {
      litProvinceIds,
      litCityIds,
      provinceCount: litProvinceIds.length,
      cityCount: litCityIds.length,
    };

    return success({ share: { title: share.title }, places, memories, footprint });
  });
}
