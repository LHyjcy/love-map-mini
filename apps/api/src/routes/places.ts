/**
 * 地点路由：情侣共享的地图地点（足迹/愿望/计划）。
 * 所有接口都要求登录，并基于当前 active 情侣关系按 coupleId 做越权隔离。
 * 读取一律过滤 deletedAt: null；删除为软删除，绝不物理删除。
 */
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { resolveAdcode } from '../services/adcode.js';
import { requireActiveCouple } from '../utils/couple.js';
import { AppError } from '../utils/errors.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const placeTypeSchema = z.enum(['visited', 'wishlist', 'plan']);
const visibilitySchema = z.enum(['private', 'couple', 'public']);

const createPlaceSchema = z.object({
  title: z.string().min(1).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  country: z.string().optional(),
  category: z.string().optional(),
  placeType: placeTypeSchema.optional(),
  visibility: visibilitySchema.optional(),
  visitedAt: z.string().datetime().optional(),
});

const updatePlaceSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  country: z.string().optional(),
  category: z.string().optional(),
  placeType: placeTypeSchema.optional(),
  visibility: visibilitySchema.optional(),
  visitedAt: z.string().datetime().optional(),
});

const listQuerySchema = z.object({
  placeType: placeTypeSchema.optional(),
  city: z.string().optional(),
  year: z.string().optional(),
});

type PlaceRow = {
  id: string;
  coupleId: string;
  createdById: string;
  title: string;
  address: string | null;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  city: string | null;
  province: string | null;
  country: string | null;
  category: string | null;
  provinceId: string | null;
  cityId: string | null;
  coordType: string | null;
  placeType: string;
  visibility: string;
  visitedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

/** Decimal 经纬度转 number，保证 JSON 输出干净。 */
function toPlaceView(p: PlaceRow) {
  return {
    id: p.id,
    coupleId: p.coupleId,
    createdById: p.createdById,
    title: p.title,
    address: p.address,
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    city: p.city,
    province: p.province,
    country: p.country,
    category: p.category,
    provinceId: p.provinceId,
    cityId: p.cityId,
    coordType: p.coordType,
    placeType: p.placeType,
    visibility: p.visibility,
    visitedAt: p.visitedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export async function placeRoutes(app: FastifyInstance): Promise<void> {
  // 新建地点，归属当前情侣关系。
  app.post('/api/places', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const body = parse(createPlaceSchema, request.body);

    // 由省/市名称归一化出行政区划 adcode（足迹地图点亮用），仅在解析成功时写入。
    const { provinceId, cityId } = resolveAdcode({ province: body.province, city: body.city });

    const place = await prisma.place.create({
      data: {
        coupleId: couple.id,
        createdById: userId,
        title: body.title,
        latitude: body.latitude,
        longitude: body.longitude,
        ...(body.address !== undefined ? { address: body.address } : {}),
        ...(body.city !== undefined ? { city: body.city } : {}),
        ...(body.province !== undefined ? { province: body.province } : {}),
        ...(body.country !== undefined ? { country: body.country } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.placeType !== undefined ? { placeType: body.placeType } : {}),
        ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
        ...(body.visitedAt !== undefined ? { visitedAt: new Date(body.visitedAt) } : {}),
        ...(provinceId !== null ? { provinceId } : {}),
        ...(cityId !== null ? { cityId } : {}),
      },
    });

    return success({ place: toPlaceView(place) });
  });

  // 列出当前情侣的地点，可按 placeType / city / year 过滤，按创建时间倒序。
  app.get('/api/places', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { placeType, city, year } = parse(listQuerySchema, request.query);

    // year 仅在为合法 4 位年份时才生效，按自然年过滤 visitedAt。
    const parsedYear = year !== undefined && /^\d{4}$/.test(year) ? Number(year) : undefined;

    const rows = await prisma.place.findMany({
      where: {
        coupleId: couple.id,
        deletedAt: null,
        ...(placeType !== undefined ? { placeType } : {}),
        ...(city !== undefined && city !== '' ? { city: { contains: city } } : {}),
        ...(parsedYear !== undefined
          ? {
              visitedAt: {
                gte: new Date(parsedYear, 0, 1),
                lt: new Date(parsedYear + 1, 0, 1),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return success({ places: rows.map(toPlaceView) });
  });

  // 单个地点详情，越权或不存在均返回 404。
  app.get('/api/places/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };

    const place = await prisma.place.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!place) {
      throw new AppError('NOT_FOUND', 'Place not found.', 404);
    }

    return success({ place: toPlaceView(place) });
  });

  // 更新地点的部分字段。
  app.patch('/api/places/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };
    const body = parse(updatePlaceSchema, request.body);

    const existing = await prisma.place.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Place not found.', 404);
    }

    // 仅当本次请求带来可解析的省/市时才更新 adcode，避免把已有值清空。
    const { provinceId, cityId } = resolveAdcode({ province: body.province, city: body.city });

    const place = await prisma.place.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.address !== undefined ? { address: body.address } : {}),
        ...(body.latitude !== undefined ? { latitude: body.latitude } : {}),
        ...(body.longitude !== undefined ? { longitude: body.longitude } : {}),
        ...(body.city !== undefined ? { city: body.city } : {}),
        ...(body.province !== undefined ? { province: body.province } : {}),
        ...(body.country !== undefined ? { country: body.country } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.placeType !== undefined ? { placeType: body.placeType } : {}),
        ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
        ...(body.visitedAt !== undefined ? { visitedAt: new Date(body.visitedAt) } : {}),
        ...(provinceId !== null ? { provinceId } : {}),
        ...(cityId !== null ? { cityId } : {}),
      },
    });

    return success({ place: toPlaceView(place) });
  });

  // 软删除地点：置 deletedAt，保留历史记录。
  app.delete('/api/places/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };

    const existing = await prisma.place.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Place not found.', 404);
    }

    await prisma.place.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return success({ id });
  });
}
