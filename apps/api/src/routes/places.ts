/**
 * 地点路由：情侣共享的地图地点（足迹/愿望/计划）。
 * 所有接口都要求登录，并基于当前 active 情侣关系按 coupleId 做越权隔离。
 * 读取一律过滤 deletedAt: null；删除为软删除，绝不物理删除。
 */
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
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
      },
    });

    return success({ place: toPlaceView(place) });
  });

  // 列出当前情侣的地点，可按 placeType 过滤，按创建时间倒序。
  app.get('/api/places', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { placeType } = parse(listQuerySchema, request.query);

    const rows = await prisma.place.findMany({
      where: {
        coupleId: couple.id,
        deletedAt: null,
        ...(placeType !== undefined ? { placeType } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return success({ places: rows.map(toPlaceView) });
  });

  // 地图标记轻量列表：仅返回绘制 marker 所需字段。
  app.get('/api/places/markers', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);

    const rows = await prisma.place.findMany({
      where: { coupleId: couple.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const markers = rows.map((p) => ({
      id: p.id,
      title: p.title,
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
      placeType: p.placeType,
    }));

    return success({ markers });
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
