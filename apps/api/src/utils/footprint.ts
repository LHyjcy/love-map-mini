/**
 * 足迹（点亮地图）统计工具。基于情侣共享的地点与回忆，计算点亮的省 / 市。
 * 「点亮」定义：placeType='visited' 或该地点存在 ≥1 条未删除回忆。
 * 仅统计 provinceId / cityId（adcode）非空的地点；读取一律过滤 deletedAt: null。
 * 所有查询基于传入的 coupleId 做越权隔离。
 */
import { prisma } from '../db.js';

/** 查询某情侣每个 placeId 的未删除回忆数，返回 Map<placeId, count>；可选按 placeIds 收窄范围。 */
async function memoryCountByPlace(
  coupleId: string,
  placeIds?: string[]
): Promise<Map<string, number>> {
  const grouped = await prisma.memory.groupBy({
    by: ['placeId'],
    where: {
      coupleId,
      deletedAt: null,
      ...(placeIds !== undefined ? { placeId: { in: placeIds } } : {}),
    },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const row of grouped) {
    map.set(row.placeId, row._count._all);
  }
  return map;
}

/** 判断地点是否点亮：visited 或存在回忆，且行政区划 adcode 完整。 */
function isLit(
  place: { placeType: string; provinceId: string | null; cityId: string | null },
  memoryCount: number
): boolean {
  if (place.provinceId === null || place.cityId === null) {
    return false;
  }
  return place.placeType === 'visited' || memoryCount > 0;
}

/** 计算某情侣的足迹概览：点亮省数、城市数、地点总数、回忆总数及对应 adcode 列表。 */
export async function computeFootprint(coupleId: string) {
  // 两个查询互相独立，并行执行。
  const [places, memoryCounts] = await Promise.all([
    prisma.place.findMany({
      where: { coupleId, deletedAt: null },
      select: { id: true, placeType: true, provinceId: true, cityId: true },
    }),
    memoryCountByPlace(coupleId),
  ]);

  const litProvinceSet = new Set<string>();
  const litCitySet = new Set<string>();
  for (const place of places) {
    const count = memoryCounts.get(place.id) ?? 0;
    if (isLit(place, count)) {
      // 经 isLit 校验后 provinceId / cityId 必非空。
      litProvinceSet.add(place.provinceId as string);
      litCitySet.add(place.cityId as string);
    }
  }

  // Memory.placeId 非空，回忆总数即各 placeId 分组计数之和，无需再发一次 count 查询。
  let memoryCount = 0;
  for (const count of memoryCounts.values()) {
    memoryCount += count;
  }

  const litProvinceIds = [...litProvinceSet];
  const litCityIds = [...litCitySet];

  return {
    provinceCount: litProvinceIds.length,
    cityCount: litCityIds.length,
    placeCount: places.length,
    memoryCount,
    litProvinceIds,
    litCityIds,
  };
}

/** 列出某省内点亮的城市，并给出每个城市的地点数与回忆数。 */
export async function litCitiesByProvince(coupleId: string, provinceId: string) {
  const places = await prisma.place.findMany({
    where: { coupleId, deletedAt: null, provinceId },
    select: { id: true, placeType: true, provinceId: true, cityId: true },
  });

  // 只统计本省地点的回忆数，避免对整个情侣全量 groupBy。
  const memoryCounts = await memoryCountByPlace(
    coupleId,
    places.map((p) => p.id)
  );

  // 按 cityId 聚合点亮地点的地点数与回忆数。
  const byCity = new Map<string, { placeCount: number; memoryCount: number }>();
  const litCitySet = new Set<string>();
  for (const place of places) {
    const count = memoryCounts.get(place.id) ?? 0;
    if (!isLit(place, count)) {
      continue;
    }
    const cityId = place.cityId as string;
    litCitySet.add(cityId);
    const entry = byCity.get(cityId) ?? { placeCount: 0, memoryCount: 0 };
    entry.placeCount += 1;
    entry.memoryCount += count;
    byCity.set(cityId, entry);
  }

  const cities = [...byCity.entries()].map(([cityId, agg]) => ({
    cityId,
    placeCount: agg.placeCount,
    memoryCount: agg.memoryCount,
  }));

  return {
    provinceId,
    litCityIds: [...litCitySet],
    cities,
  };
}

/** 列出某城市（cityId）下该情侣的地点与回忆，供城市详情页使用。 */
export async function placesAndMemoriesByCity(coupleId: string, cityId: string) {
  const places = await prisma.place.findMany({
    where: { coupleId, deletedAt: null, cityId },
    select: {
      id: true,
      title: true,
      placeType: true,
      latitude: true,
      longitude: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const placeIds = places.map((p) => p.id);

  // 带出正文、心情、标签与照片（media），供「地图上直接看图文」的立体卡片展示。
  const memories =
    placeIds.length === 0
      ? []
      : await prisma.memory.findMany({
          where: { coupleId, deletedAt: null, placeId: { in: placeIds } },
          select: {
            id: true,
            title: true,
            content: true,
            mood: true,
            tags: true,
            memoryDate: true,
            placeId: true,
            media: {
              where: { deletedAt: null },
              orderBy: { sortOrder: 'asc' },
              select: { id: true, fileUrl: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

  return {
    cityId,
    places: places.map((p) => ({
      id: p.id,
      title: p.title,
      placeType: p.placeType,
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
    })),
    memories: memories.map((m) => ({
      id: m.id,
      title: m.title,
      content: m.content,
      mood: m.mood,
      tags: m.tags,
      memoryDate: m.memoryDate,
      placeId: m.placeId,
      photos: m.media.map((x) => x.fileUrl),
      cover: m.media.length > 0 ? m.media[0].fileUrl : null,
    })),
  };
}
