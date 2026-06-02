/**
 * 情侣任务路由：创建任务、列表/详情、状态流转（接受/拒绝/完成/确认/取消）。
 * 所有接口都要求登录，并基于当前 active 情侣关系做越权隔离（coupleId）。
 * 状态机：pending → accepted/rejected/cancelled；accepted → completed/cancelled；
 * completed → confirmed（创建者确认时一次性发放积分给被指派人）。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { AppError } from '../utils/errors.js';
import { recordPoints } from '../utils/points.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const taskStatuses = [
  'pending',
  'accepted',
  'rejected',
  'completed',
  'confirmed',
  'cancelled',
] as const;

const createSchema = z.object({
  title: z.string().min(1).max(100),
  assigneeId: z.string(),
  description: z.string().optional(),
  points: z.number().int().min(0).optional(),
  dueAt: z.string().datetime().optional(),
  relatedPlaceId: z.string().optional(),
});

const listQuerySchema = z.object({
  status: z.enum(taskStatuses).optional(),
});

type CoupleRow = {
  id: string;
  userAId: string;
  userBId: string | null;
};

/** 取当前用户在该情侣关系中的伴侣 id（可能为 null，表示尚未绑定 B）。 */
function partnerId(couple: CoupleRow, userId: string): string | null {
  return couple.userAId === userId ? couple.userBId : couple.userAId;
}

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  // 创建任务：创建者发起，指派给伴侣，初始状态 pending。
  app.post('/api/tasks', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const body = parse(createSchema, request.body);

    const partner = partnerId(couple, userId);
    if (!partner || body.assigneeId !== partner) {
      throw new AppError('INVALID_ASSIGNEE', 'Assignee must be your partner.', 400);
    }

    const task = await prisma.task.create({
      data: {
        coupleId: couple.id,
        creatorId: userId,
        assigneeId: body.assigneeId,
        title: body.title,
        description: body.description,
        points: body.points ?? 0,
        status: 'pending',
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
        relatedPlaceId: body.relatedPlaceId,
      },
    });

    return success({ task });
  });

  // 任务列表：仅当前情侣关系，支持按 status 过滤，按创建时间倒序。
  app.get('/api/tasks', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const query = parse(listQuerySchema, request.query);

    const tasks = await prisma.task.findMany({
      where: {
        coupleId: couple.id,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return success({ tasks });
  });

  // 任务详情：越权隔离，缺失返回 404。
  app.get('/api/tasks/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };

    const task = await prisma.task.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!task) {
      throw new AppError('NOT_FOUND', 'Task not found.', 404);
    }

    return success({ task });
  });

  // 接受：被指派人将 pending → accepted。
  app.post('/api/tasks/:id/accept', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };

    const task = await prisma.task.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!task) {
      throw new AppError('NOT_FOUND', 'Task not found.', 404);
    }
    if (task.assigneeId !== userId) {
      throw new AppError('FORBIDDEN', 'Only the assignee can accept this task.', 403);
    }
    if (task.status !== 'pending') {
      throw new AppError('INVALID_TASK_TRANSITION', 'Task is not pending.', 409);
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { status: 'accepted' },
    });

    return success({ task: updated });
  });

  // 拒绝：被指派人将 pending → rejected。
  app.post('/api/tasks/:id/reject', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };

    const task = await prisma.task.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!task) {
      throw new AppError('NOT_FOUND', 'Task not found.', 404);
    }
    if (task.assigneeId !== userId) {
      throw new AppError('FORBIDDEN', 'Only the assignee can reject this task.', 403);
    }
    if (task.status !== 'pending') {
      throw new AppError('INVALID_TASK_TRANSITION', 'Task is not pending.', 409);
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { status: 'rejected' },
    });

    return success({ task: updated });
  });

  // 完成：被指派人将 accepted → completed。
  app.post('/api/tasks/:id/complete', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };

    const task = await prisma.task.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!task) {
      throw new AppError('NOT_FOUND', 'Task not found.', 404);
    }
    if (task.assigneeId !== userId) {
      throw new AppError('FORBIDDEN', 'Only the assignee can complete this task.', 403);
    }
    if (task.status !== 'accepted') {
      throw new AppError('INVALID_TASK_TRANSITION', 'Task is not accepted.', 409);
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { status: 'completed' },
    });

    return success({ task: updated });
  });

  // 确认：创建者将 completed → confirmed，并一次性给被指派人发放积分（事务内）。
  // 发放只发生一次，由 completed → confirmed 的状态守卫保证。
  app.post('/api/tasks/:id/confirm', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };

    const task = await prisma.task.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!task) {
      throw new AppError('NOT_FOUND', 'Task not found.', 404);
    }
    if (task.creatorId !== userId) {
      throw new AppError('FORBIDDEN', 'Only the creator can confirm this task.', 403);
    }
    if (task.status !== 'completed') {
      throw new AppError('INVALID_TASK_TRANSITION', 'Task is not completed.', 409);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.task.update({
        where: { id: task.id },
        data: { status: 'confirmed' },
      });
      if (task.points > 0) {
        await recordPoints(
          {
            coupleId: couple.id,
            userId: task.assigneeId,
            sourceType: 'task',
            sourceId: task.id,
            points: task.points,
            description: `Task: ${task.title}`,
          },
          tx
        );
      }
      return next;
    });

    return success({ task: updated });
  });

  // 取消：创建者将 pending/accepted → cancelled。
  app.post('/api/tasks/:id/cancel', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };

    const task = await prisma.task.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!task) {
      throw new AppError('NOT_FOUND', 'Task not found.', 404);
    }
    if (task.creatorId !== userId) {
      throw new AppError('FORBIDDEN', 'Only the creator can cancel this task.', 403);
    }
    if (task.status !== 'pending' && task.status !== 'accepted') {
      throw new AppError('INVALID_TASK_TRANSITION', 'Task cannot be cancelled.', 409);
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { status: 'cancelled' },
    });

    return success({ task: updated });
  });
}
