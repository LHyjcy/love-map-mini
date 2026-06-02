/**
 * 积分路由：余额查询、积分流水、每日签到。
 * 所有接口都要求登录，并基于当前情侣关系（coupleId）做越权校验。
 * 积分变更只能写入不可变流水 PointLedger，余额 = 流水求和。
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { AppError } from '../utils/errors.js';
import { getBalance, recordPoints } from '../utils/points.js';
import { success } from '../utils/response.js';

const SIGNIN_POINTS = 5;

export async function pointRoutes(app: FastifyInstance): Promise<void> {
  // 查询当前用户在该情侣关系下的积分余额。
  app.get('/api/points/balance', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);

    const balance = await getBalance(couple.id, userId);

    return success({ balance });
  });

  // 查询积分流水（最近 100 条，倒序）。
  app.get('/api/points/ledger', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);

    const ledger = await prisma.pointLedger.findMany({
      where: { coupleId: couple.id, userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return success({ ledger });
  });

  // 每日签到：每天仅可签到一次，成功记一条 signin 流水。
  app.post('/api/points/signin', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const existing = await prisma.pointLedger.findFirst({
      where: {
        coupleId: couple.id,
        userId,
        sourceType: 'signin',
        createdAt: { gte: start },
      },
    });
    if (existing) {
      throw new AppError('ALREADY_SIGNED_IN_TODAY', 'You have already signed in today.', 409);
    }

    const entry = await recordPoints({
      coupleId: couple.id,
      userId,
      sourceType: 'signin',
      points: SIGNIN_POINTS,
      description: 'Daily sign-in',
    });
    const balance = await getBalance(couple.id, userId);

    return success({ ledger: entry, balance });
  });
}
