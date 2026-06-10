/**
 * 情侣问答路由：每日一题，双方各自作答，双方都回答后才可互看对方答案。
 * 所有接口都要求登录，并基于当前 active 情侣关系做越权隔离（coupleId）。
 * 隐私要求：在双方都作答之前，绝不向任一方返回对方的答案内容。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { pickQuestionForToday } from '../services/qaQuestions.js';
import { requireActiveCouple } from '../utils/couple.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const answerSchema = z.object({
  answer: z.string().min(1).max(500),
});

/**
 * 构造当前用户视角下的当日问答状态。
 * 仅当双方都已作答（revealed）时才包含双方答案，否则不泄露对方内容。
 */
async function buildState(coupleId: string, userId: string, partnerId: string | null) {
  const q = pickQuestionForToday();

  const mineRow = await prisma.qaAnswer.findUnique({
    where: {
      coupleId_userId_questionKey: { coupleId, userId, questionKey: q.key },
    },
  });

  const partnerRow = partnerId
    ? await prisma.qaAnswer.findUnique({
        where: {
          coupleId_userId_questionKey: { coupleId, userId: partnerId, questionKey: q.key },
        },
      })
    : null;

  const revealed = !!(mineRow && partnerRow);

  return {
    question: q,
    mineAnswer: mineRow?.answer ?? null,
    partnerAnswered: !!partnerRow,
    revealed,
    ...(revealed
      ? { answers: { mine: mineRow!.answer, partner: partnerRow!.answer } }
      : {}),
  };
}

export async function qaRoutes(app: FastifyInstance): Promise<void> {
  // 查询当日问题及当前作答状态（不泄露未揭晓的对方答案）。
  app.get('/api/qa/today', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const partnerId = couple.userAId === userId ? couple.userBId : couple.userAId;

    return success(await buildState(couple.id, userId, partnerId));
  });

  // 提交/更新当前用户的当日答案，并返回最新状态。
  app.post('/api/qa/today', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const partnerId = couple.userAId === userId ? couple.userBId : couple.userAId;

    const { answer } = parse(answerSchema, request.body);
    const q = pickQuestionForToday();

    await prisma.qaAnswer.upsert({
      where: {
        coupleId_userId_questionKey: {
          coupleId: couple.id,
          userId,
          questionKey: q.key,
        },
      },
      create: {
        coupleId: couple.id,
        userId,
        questionKey: q.key,
        answer,
      },
      update: { answer },
    });

    return success(await buildState(couple.id, userId, partnerId));
  });
}
