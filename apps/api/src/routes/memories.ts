/**
 * 回忆路由：在某个地点下创建/查询/更新/删除情侣回忆。
 * 所有接口都要求登录，并基于当前情侣关系（coupleId）做越权校验。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { AppError } from '../utils/errors.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const visibilitySchema = z.enum(['private', 'couple', 'public']);

const createSchema = z.object({
  placeId: z.string().min(1),
  title: z.string().min(1).max(100),
  content: z.string().optional(),
  mood: z.string().optional(),
  memoryDate: z.string().datetime().optional(),
  visibility: visibilitySchema.optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  content: z.string().optional(),
  mood: z.string().optional(),
  memoryDate: z.string().datetime().optional(),
  visibility: visibilitySchema.optional(),
});

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const listQuerySchema = z.object({
  placeId: z.string().min(1).optional(),
});

// 已删除的媒体不返回，并按 sortOrder 升序排列。
const mediaInclude = {
  media: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' as const } },
};

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  // 创建回忆：先校验 placeId 属于当前情侣，再写入。
  app.post('/api/memories', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const body = parse(createSchema, request.body);

    const place = await prisma.place.findFirst({
      where: { id: body.placeId, coupleId: couple.id, deletedAt: null },
    });
    if (!place) {
      throw new AppError('PLACE_NOT_FOUND', 'Place not found.', 404);
    }

    const memory = await prisma.memory.create({
      data: {
        coupleId: couple.id,
        placeId: body.placeId,
        createdById: userId,
        title: body.title,
        content: body.content,
        mood: body.mood,
        memoryDate: body.memoryDate ? new Date(body.memoryDate) : undefined,
        visibility: body.visibility,
      },
    });

    return success({ memory });
  });

  // 查询当前情侣的回忆列表，可按 placeId 过滤，附带未删除媒体。
  app.get('/api/memories', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const query = parse(listQuerySchema, request.query);

    const memories = await prisma.memory.findMany({
      where: {
        coupleId: couple.id,
        deletedAt: null,
        ...(query.placeId ? { placeId: query.placeId } : {}),
      },
      include: mediaInclude,
      orderBy: { createdAt: 'desc' },
    });

    return success({ memories });
  });

  // 查询单条回忆，附带未删除媒体。
  app.get('/api/memories/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = parse(idParamsSchema, request.params);

    const memory = await prisma.memory.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
      include: mediaInclude,
    });
    if (!memory) {
      throw new AppError('NOT_FOUND', 'Memory not found.', 404);
    }

    return success({ memory });
  });

  // 更新回忆字段。
  app.patch('/api/memories/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(updateSchema, request.body);

    const existing = await prisma.memory.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Memory not found.', 404);
    }

    const memory = await prisma.memory.update({
      where: { id: existing.id },
      data: {
        title: body.title,
        content: body.content,
        mood: body.mood,
        memoryDate: body.memoryDate ? new Date(body.memoryDate) : undefined,
        visibility: body.visibility,
      },
    });

    return success({ memory });
  });

  // 软删除回忆：置 deletedAt，保留历史。
  app.delete('/api/memories/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = parse(idParamsSchema, request.params);

    const existing = await prisma.memory.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Memory not found.', 404);
    }

    await prisma.memory.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });

    return success({ id: existing.id });
  });
}
