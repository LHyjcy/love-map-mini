/**
 * 今日心情路由：每人每天为情侣关系记录一条心情（mood），可附简短备注。
 * Mood 以 (coupleId, userId, day) 为天然唯一键，同一天重复提交为 upsert。
 * 所有接口都要求登录，并基于当前情侣关系（coupleId）做越权隔离。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const moodSchema = z.object({
  mood: z.enum(['happy', 'miss', 'tired', 'angry', 'hug', 'calm']),
  note: z.string().max(100).optional(),
});

/** 取服务端本地日 'YYYY-MM-DD'。 */
function todayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  return `${y}-${MM}-${DD}`;
}

export async function moodRoutes(app: FastifyInstance): Promise<void> {
  // 记录/更新「今日心情」：同一人同一天为 upsert。
  app.post('/api/moods', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { mood, note } = parse(moodSchema, request.body);

    const day = todayStr();
    const row = await prisma.mood.upsert({
      where: { coupleId_userId_day: { coupleId: couple.id, userId, day } },
      create: { coupleId: couple.id, userId, mood, note: note ?? null, day },
      update: { mood, note: note ?? null },
    });

    return success({ mood: row });
  });

  // 查询今日双方心情：mine 为当前用户，partner 为情侣另一方（无则 null）。
  app.get('/api/moods/today', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);

    const day = todayStr();
    const partnerId = couple.userAId === userId ? couple.userBId : couple.userAId;

    const rows = await prisma.mood.findMany({
      where: {
        coupleId: couple.id,
        day,
        userId: { in: partnerId ? [userId, partnerId] : [userId] },
      },
      select: {
        id: true,
        userId: true,
        mood: true,
        note: true,
        day: true,
        createdAt: true,
      },
    });

    const mine = rows.find((r) => r.userId === userId) ?? null;
    const partner = partnerId ? rows.find((r) => r.userId === partnerId) ?? null : null;

    return success({ mine, partner });
  });
}
