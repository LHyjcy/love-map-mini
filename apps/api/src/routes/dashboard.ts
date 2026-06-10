/**
 * 首页聚合路由：返回在一起天数、积分余额、最近回忆、待办任务、即将到来的事件。
 * 只读，要求登录，并基于当前情侣关系（coupleId）做越权校验。
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { getBalance } from '../utils/points.js';
import { success } from '../utils/response.js';

/** 事件日期距今的整天数（今天 00:00 为基准，负数表示已过去）。 */
function daysUntil(date: Date): number {
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((d0.getTime() - t0.getTime()) / 86400000);
}

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  // 首页聚合数据。
  app.get('/api/dashboard', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);

    const now = new Date();
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const daysTogether = couple.togetherAt
      ? Math.max(0, daysUntil(couple.togetherAt) * -1)
      : null;

    // 四个查询互相独立，并行执行以缩短首页响应时间。
    const [pointsBalance, recentMemories, pendingTasks, events] = await Promise.all([
      getBalance(couple.id, userId),
      prisma.memory.findMany({
        where: { coupleId: couple.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, title: true, memoryDate: true },
      }),
      prisma.task.count({
        where: {
          coupleId: couple.id,
          deletedAt: null,
          status: { in: ['pending', 'accepted'] },
        },
      }),
      prisma.event.findMany({
        where: {
          coupleId: couple.id,
          deletedAt: null,
          eventDate: { gte: today0 },
        },
        orderBy: { eventDate: 'asc' },
        take: 5,
      }),
    ]);

    const upcomingEvents = events.map((e) => ({
      id: e.id,
      title: e.title,
      eventType: e.eventType,
      eventDate: e.eventDate,
      daysUntil: daysUntil(e.eventDate),
    }));

    return success({
      daysTogether,
      pointsBalance,
      recentMemories,
      pendingTasks,
      upcomingEvents,
    });
  });
}
