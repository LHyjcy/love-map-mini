/**
 * 纪念日/计划事件路由：创建/查询/更新/删除情侣事件。
 * 所有接口都要求登录，并基于当前情侣关系（coupleId）做越权校验。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { AppError } from '../utils/errors.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const eventTypeSchema = z.enum(['anniversary', 'date', 'countdown', 'plan']);

const createSchema = z.object({
  title: z.string().min(1).max(100),
  eventType: eventTypeSchema.optional(),
  eventDate: z.string().datetime(),
  repeatRule: z.string().optional(),
  relatedPlaceId: z.string().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  eventType: eventTypeSchema.optional(),
  eventDate: z.string().datetime().optional(),
  repeatRule: z.string().optional(),
  relatedPlaceId: z.string().optional(),
});

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const listQuerySchema = z.object({
  eventType: eventTypeSchema.optional(),
});

/** 事件日期距今的整天数（今天 00:00 为基准，负数表示已过去）。 */
function daysUntil(date: Date): number {
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((d0.getTime() - t0.getTime()) / 86400000);
}

/** 在事件对象上附加 daysUntil 视图字段。 */
function toEventView<T extends { eventDate: Date }>(e: T) {
  return { ...e, daysUntil: daysUntil(e.eventDate) };
}

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  // 创建事件。
  app.post('/api/events', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const body = parse(createSchema, request.body);

    const event = await prisma.event.create({
      data: {
        coupleId: couple.id,
        creatorId: userId,
        title: body.title,
        eventType: body.eventType,
        eventDate: new Date(body.eventDate),
        repeatRule: body.repeatRule,
        relatedPlaceId: body.relatedPlaceId,
      },
    });

    return success({ event: toEventView(event) });
  });

  // 查询当前情侣的事件列表，可按 eventType 过滤，按 eventDate 升序。
  app.get('/api/events', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const query = parse(listQuerySchema, request.query);

    const rows = await prisma.event.findMany({
      where: {
        coupleId: couple.id,
        deletedAt: null,
        ...(query.eventType ? { eventType: query.eventType } : {}),
      },
      orderBy: { eventDate: 'asc' },
    });

    return success({ events: rows.map(toEventView) });
  });

  // 查询单个事件。
  app.get('/api/events/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = parse(idParamsSchema, request.params);

    const event = await prisma.event.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!event) {
      throw new AppError('NOT_FOUND', 'Event not found.', 404);
    }

    return success({ event: toEventView(event) });
  });

  // 更新事件字段。
  app.patch('/api/events/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(updateSchema, request.body);

    const existing = await prisma.event.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Event not found.', 404);
    }

    const event = await prisma.event.update({
      where: { id: existing.id },
      data: {
        title: body.title,
        eventType: body.eventType,
        eventDate: body.eventDate ? new Date(body.eventDate) : undefined,
        repeatRule: body.repeatRule,
        relatedPlaceId: body.relatedPlaceId,
      },
    });

    return success({ event: toEventView(event) });
  });

  // 软删除事件：置 deletedAt，保留历史。
  app.delete('/api/events/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = parse(idParamsSchema, request.params);

    const existing = await prisma.event.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Event not found.', 404);
    }

    await prisma.event.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });

    return success({ id: existing.id });
  });
}
