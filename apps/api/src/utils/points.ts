/**
 * 积分流水服务。所有积分变更都必须经由此处写入 PointLedger（不可变流水），
 * 余额 = 流水求和。禁止直接改用户字段。可在事务内调用（传入 tx）。
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db.js';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export type PointSource = 'checkin' | 'task' | 'memory' | 'signin' | 'manual' | 'redeem';

export interface RecordPointsInput {
  coupleId: string;
  userId: string;
  sourceType: PointSource;
  points: number; // 兑换/扣减为负数
  sourceId?: string;
  description?: string;
}

/** 当前用户在该情侣关系下的积分余额（流水求和）。 */
export async function getBalance(
  coupleId: string,
  userId: string,
  client: PrismaLike = prisma
): Promise<number> {
  const agg = await client.pointLedger.aggregate({
    where: { coupleId, userId },
    _sum: { points: true },
  });
  return agg._sum.points ?? 0;
}

/** 记一条积分流水。 */
export function recordPoints(input: RecordPointsInput, client: PrismaLike = prisma) {
  return client.pointLedger.create({
    data: {
      coupleId: input.coupleId,
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      points: input.points,
      description: input.description,
    },
  });
}
