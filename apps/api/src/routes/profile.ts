/**
 * Love Map 档案：双方累积的「关于 TA」小事实 + 已揭晓的问答历史。
 * 所有接口要求登录，并基于当前 active 情侣关系按 coupleId 越权隔离。
 * 问答历史仅包含「双方都回答过」的题目（双方回答后才可互看）。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { AppError } from '../utils/errors.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const factSchema = z.object({
  key: z.string().min(1).max(40),
  value: z.string().min(1).max(200),
});

function partnerIdOf(couple: { userAId: string; userBId: string | null }, userId: string): string | null {
  return couple.userAId === userId ? couple.userBId : couple.userAId;
}

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  // 档案总览：我的/对方的小事实 + 已揭晓的问答历史。
  app.get('/api/profile', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const partnerId = partnerIdOf(couple, userId);

    const facts = await prisma.profileFact.findMany({
      where: { coupleId: couple.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, userId: true, key: true, value: true },
    });
    const mine = facts.filter((f) => f.userId === userId).map((f) => ({ id: f.id, key: f.key, value: f.value }));
    const partner = partnerId
      ? facts.filter((f) => f.userId === partnerId).map((f) => ({ id: f.id, key: f.key, value: f.value }))
      : [];

    // 问答历史：仅双方都回答的题目，按最近回答时间倒序，取 30。
    const answers = await prisma.qaAnswer.findMany({
      where: { coupleId: couple.id },
      orderBy: { createdAt: 'desc' },
      select: { questionKey: true, userId: true, answer: true, createdAt: true },
    });
    const byKey = new Map<string, { mine?: string; partner?: string; at: Date }>();
    for (const a of answers) {
      const entry = byKey.get(a.questionKey) ?? { at: a.createdAt };
      if (a.createdAt > entry.at) entry.at = a.createdAt;
      if (a.userId === userId) entry.mine = a.answer;
      else if (partnerId && a.userId === partnerId) entry.partner = a.answer;
      byKey.set(a.questionKey, entry);
    }
    const qaHistory = [...byKey.entries()]
      .filter(([, v]) => v.mine !== undefined && v.partner !== undefined)
      .sort((x, y) => y[1].at.getTime() - x[1].at.getTime())
      .slice(0, 30)
      .map(([questionKey, v]) => ({ questionKey, mineAnswer: v.mine, partnerAnswer: v.partner }));

    return success({ mine, partner, qaHistory });
  });

  // 新增/更新一条「关于我」的小事实（按 key upsert）。
  app.post('/api/profile/fact', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { key, value } = parse(factSchema, request.body);

    const fact = await prisma.profileFact.upsert({
      where: { coupleId_userId_key: { coupleId: couple.id, userId, key } },
      create: { coupleId: couple.id, userId, key, value },
      update: { value },
      select: { id: true, key: true, value: true },
    });

    return success({ fact });
  });

  // 删除自己的一条小事实。
  app.delete('/api/profile/fact/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };

    const existing = await prisma.profileFact.findFirst({
      where: { id, coupleId: couple.id, userId },
    });
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Profile fact not found.', 404);
    }
    await prisma.profileFact.delete({ where: { id: existing.id } });

    return success({ id: existing.id });
  });
}
