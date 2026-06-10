/**
 * 计划路由：实现 PRD「计划转回忆」（plan → memory）流转。
 * 把一个 wishlist/plan 类型的地点标记为已到访（visited），并在同一事务里生成一条回忆。
 * 接口要求登录，并基于当前 active 情侣关系（coupleId）做越权隔离。
 */
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { AppError } from '../utils/errors.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const completeSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().optional(),
  mood: z.string().optional(),
  memoryDate: z.string().datetime().optional(),
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

/** Decimal 经纬度转 number，保证 JSON 输出干净（与 places.ts 一致）。 */
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

export async function planRoutes(app: FastifyInstance): Promise<void> {
  // 计划转回忆：把 wishlist/plan 地点标记为 visited，并生成一条回忆。
  app.patch('/api/plans/:id/complete', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(completeSchema, request.body);

    const plan = await prisma.place.findFirst({
      where: {
        id,
        coupleId: couple.id,
        deletedAt: null,
        placeType: { in: ['wishlist', 'plan'] },
      },
    });
    if (!plan) {
      throw new AppError('PLAN_NOT_FOUND', 'Plan place not found.', 404);
    }

    const now = new Date();

    const [place, memory] = await prisma.$transaction([
      prisma.place.update({
        where: { id: plan.id },
        data: { placeType: 'visited', visitedAt: now },
      }),
      prisma.memory.create({
        data: {
          coupleId: couple.id,
          placeId: plan.id,
          createdById: userId,
          title: body.title,
          content: body.content,
          mood: body.mood,
          memoryDate: body.memoryDate ? new Date(body.memoryDate) : undefined,
          visibility: 'couple',
        },
      }),
    ]);

    return success({ place: toPlaceView(place), memory });
  });
}
