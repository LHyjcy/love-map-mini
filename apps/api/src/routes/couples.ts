/**
 * 情侣绑定路由：邀请码生成、接受绑定、查询当前关系、解绑。
 * 所有接口都要求登录，并基于当前用户做越权校验。
 */
import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { getActiveCoupleForUser, requireActiveCouple } from '../utils/couple.js';
import { AppError } from '../utils/errors.js';
import { generateInviteCode } from '../utils/inviteCode.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const acceptSchema = z.object({
  inviteCode: z.string().regex(/^\d{6}$/, 'inviteCode must be 6 digits'),
});

// 接受邀请的失败锁定：6 位数字邀请码空间有限，仅靠 IP 限流不足以挡住分布式暴力猜测。
// 这里按"已登录用户"维度计失败次数：1 小时窗口内最多失败 10 次，超出直接 429。
// 私用单实例部署用内存计数即可；进程重启清零可接受（攻击者也需重新积累配额）。
const ACCEPT_FAIL_WINDOW_MS = 60 * 60 * 1000;
const ACCEPT_FAIL_MAX = 10;
const acceptFailures = new Map<string, { count: number; windowStart: number }>();

function assertAcceptNotLocked(userId: string): void {
  const state = acceptFailures.get(userId);
  if (!state) return;
  if (Date.now() - state.windowStart >= ACCEPT_FAIL_WINDOW_MS) {
    acceptFailures.delete(userId);
    return;
  }
  if (state.count >= ACCEPT_FAIL_MAX) {
    throw new AppError('TOO_MANY_ATTEMPTS', '尝试次数过多，请稍后再试', 429);
  }
}

function recordAcceptFailure(userId: string): void {
  const now = Date.now();
  const state = acceptFailures.get(userId);
  if (!state || now - state.windowStart >= ACCEPT_FAIL_WINDOW_MS) {
    acceptFailures.set(userId, { count: 1, windowStart: now });
    return;
  }
  state.count += 1;
}

type PublicPartner = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  gender: string;
};

function toPublicPartner(u: {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  gender: string;
}): PublicPartner {
  return { id: u.id, nickname: u.nickname, avatarUrl: u.avatarUrl, gender: u.gender };
}

type CoupleRow = {
  id: string;
  userAId: string;
  userBId: string | null;
  status: string;
  togetherAt: Date | null;
  createdAt: Date;
};

function toCoupleView(c: CoupleRow) {
  return {
    id: c.id,
    userAId: c.userAId,
    userBId: c.userBId,
    status: c.status,
    togetherAt: c.togetherAt,
    createdAt: c.createdAt,
  };
}

/** 生成不与现有记录冲突的邀请码（唯一约束 + 重试）。 */
async function createCoupleWithUniqueCode(userId: string, expiresAt: Date) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.couple.create({
        data: {
          userAId: userId,
          status: 'pending',
          inviteCode: generateInviteCode(),
          inviteExpiresAt: expiresAt,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        attempt < 4
      ) {
        continue; // 邀请码碰撞，重试
      }
      throw err;
    }
  }
  throw new AppError('INVITE_CODE_GENERATION_FAILED', 'Could not allocate invite code.', 500);
}

export async function coupleRoutes(app: FastifyInstance): Promise<void> {
  // 生成/刷新邀请码。已绑定者不可再次邀请。
  app.post('/api/couples/invite', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;

    const active = await getActiveCoupleForUser(userId);
    if (active) {
      throw new AppError('ALREADY_BOUND', 'You are already bound to a partner.', 409);
    }

    const expiresAt = new Date(Date.now() + config.inviteTtlMs);

    // 若已有自己发起的 pending 邀请，刷新其邀请码与有效期，避免堆积。
    const pending = await prisma.couple.findFirst({
      where: { userAId: userId, status: 'pending' },
    });

    let couple;
    if (pending) {
      couple = await prisma.couple.update({
        where: { id: pending.id },
        data: { inviteCode: generateInviteCode(), inviteExpiresAt: expiresAt },
      });
    } else {
      couple = await createCoupleWithUniqueCode(userId, expiresAt);
    }

    return success({
      couple: {
        id: couple.id,
        status: couple.status,
        inviteCode: couple.inviteCode,
        inviteExpiresAt: couple.inviteExpiresAt,
      },
    });
  });

  // 接受邀请码完成绑定。
  app.post('/api/couples/accept', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    // 防暴力猜码：失败次数超限的用户直接拒绝，不再查库。
    assertAcceptNotLocked(userId);
    const { inviteCode } = parse(acceptSchema, request.body);

    const active = await getActiveCoupleForUser(userId);
    if (active) {
      throw new AppError('ALREADY_BOUND', 'You are already bound to a partner.', 409);
    }

    const couple = await prisma.couple.findUnique({ where: { inviteCode } });
    if (!couple || couple.status !== 'pending' || couple.userBId) {
      recordAcceptFailure(userId);
      throw new AppError('INVITE_INVALID', 'Invite code is invalid or already used.', 404);
    }
    if (couple.inviteExpiresAt && couple.inviteExpiresAt.getTime() < Date.now()) {
      recordAcceptFailure(userId);
      throw new AppError('INVITE_EXPIRED', 'Invite code has expired.', 410);
    }
    if (couple.userAId === userId) {
      throw new AppError('CANNOT_ACCEPT_OWN_INVITE', 'You cannot accept your own invite.', 400);
    }

    const updated = await prisma.couple.update({
      where: { id: couple.id },
      data: {
        userBId: userId,
        status: 'active',
        inviteExpiresAt: null,
        togetherAt: couple.togetherAt ?? new Date(),
      },
    });

    // 绑定成功，清空失败计数。
    acceptFailures.delete(userId);
    return success({ couple: toCoupleView(updated) });
  });

  // 查询当前情侣关系及伴侣信息；未绑定返回 couple: null。
  app.get('/api/couples/current', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await getActiveCoupleForUser(userId);
    if (!couple) {
      return success({ couple: null, partner: null });
    }

    const partnerId = couple.userAId === userId ? couple.userBId : couple.userAId;
    const partner =
      partnerId &&
      (await prisma.user.findFirst({ where: { id: partnerId, deletedAt: null } }));

    return success({
      couple: toCoupleView(couple),
      partner: partner ? toPublicPartner(partner) : null,
    });
  });

  // 解绑：软处理，置为 unbound，保留历史记录。
  app.post('/api/couples/unbind', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);

    const updated = await prisma.couple.update({
      where: { id: couple.id },
      data: { status: 'unbound' },
    });

    return success({ couple: toCoupleView(updated) });
  });
}
