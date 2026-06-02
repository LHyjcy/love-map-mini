/**
 * 认证路由：mock 登录（仅开发）、微信登录占位（Phase 11）、当前用户信息。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { signToken } from '../plugins/auth.js';
import { AppError } from '../utils/errors.js';
import { failure, success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const genderSchema = z.enum(['unknown', 'male', 'female']);

const mockLoginSchema = z.object({
  nickname: z.string().min(1).max(30),
  mockId: z.string().min(1).max(50),
  avatarUrl: z.string().url().optional(),
  gender: genderSchema.optional(),
});

type PublicUser = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  gender: string;
  birthday: Date | null;
  createdAt: Date;
};

function toPublicUser(u: {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  gender: string;
  birthday: Date | null;
  createdAt: Date;
}): PublicUser {
  return {
    id: u.id,
    nickname: u.nickname,
    avatarUrl: u.avatarUrl,
    gender: u.gender,
    birthday: u.birthday,
    createdAt: u.createdAt,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // 开发联调用 mock 登录，生产禁用。无密码，仅用 mockId 区分用户。
  app.post('/api/auth/mock-login', async (request) => {
    if (!config.mockLoginEnabled) {
      throw new AppError('MOCK_LOGIN_DISABLED', 'Mock login is disabled in production.', 403);
    }
    const { nickname, mockId, avatarUrl, gender } = parse(mockLoginSchema, request.body);
    const openid = `mock:${mockId}`;

    const user = await prisma.user.upsert({
      where: { openid },
      update: {
        nickname,
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        ...(gender !== undefined ? { gender } : {}),
      },
      create: {
        openid,
        nickname,
        avatarUrl,
        gender: gender ?? 'unknown',
      },
    });

    const token = signToken(app, { sub: user.id });
    return success({ token, user: toPublicUser(user) });
  });

  // 微信登录占位：真实实现见 Phase 11，绝不在此读取/硬编码 AppSecret。
  app.post('/api/auth/wechat-login', async (_request, reply) => {
    return reply
      .status(501)
      .send(failure('NOT_IMPLEMENTED', 'WeChat login will be implemented in Phase 11.'));
  });

  // 当前登录用户信息。
  app.get('/api/me', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found.', 404);
    }
    return success({ user: toPublicUser(user) });
  });
}
