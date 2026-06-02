/**
 * 公开分享路由：仅维护「分享记录」骨架（PublicShare），用于开关情侣公开地图分享。
 * 隐私约束（见 CLAUDE.md）：公开地图分享默认关闭；本路由不暴露任何精确坐标。
 * 真正的公开地图内容渲染与坐标模糊化（coordinate fuzzing）属于 Phase 10，本阶段不涉及。
 * 所有接口都要求登录，且基于当前用户的生效情侣关系做 coupleId 越权隔离。
 */
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { AppError } from '../utils/errors.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const createSchema = z.object({
  title: z.string().min(1).max(100),
});

/** 生成 12 位十六进制分享码。 */
function genShareCode() {
  return randomBytes(6).toString('hex');
}

/** 创建分享记录，遇到 shareCode 唯一约束碰撞时重试（最多 5 次）。 */
async function createShareWithUniqueCode(coupleId: string, createdById: string, title: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.publicShare.create({
        data: {
          coupleId,
          createdById,
          title,
          enabled: true,
          shareCode: genShareCode(),
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        attempt < 4
      ) {
        continue; // 分享码碰撞，重试
      }
      throw err;
    }
  }
  throw new AppError('SHARE_CODE_GENERATION_FAILED', 'Could not allocate share code.', 500);
}

export async function publicShareRoutes(app: FastifyInstance): Promise<void> {
  // 创建一条公开分享记录（默认 enabled，但实际公开内容仍属 Phase 10）。
  app.post('/api/public-shares', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { title } = parse(createSchema, request.body);

    const share = await createShareWithUniqueCode(couple.id, userId, title);

    return success({ share });
  });

  // 列出当前情侣的全部分享记录（最新在前）。
  app.get('/api/public-shares', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);

    const shares = await prisma.publicShare.findMany({
      where: { coupleId: couple.id },
      orderBy: { createdAt: 'desc' },
    });

    return success({ shares });
  });

  // 关闭分享：置 enabled=false，并记录关闭时间。
  app.post('/api/public-shares/:id/disable', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };

    // 仅能操作本情侣名下的记录，否则视为不存在。
    const existing = await prisma.publicShare.findFirst({
      where: { id, coupleId: couple.id },
    });
    if (!existing) {
      throw new AppError('SHARE_NOT_FOUND', 'Public share not found.', 404);
    }

    const share = await prisma.publicShare.update({
      where: { id: existing.id },
      data: { enabled: false, disabledAt: new Date() },
    });

    return success({ share });
  });

  // 开启分享：置 enabled=true，并清除关闭时间。
  app.post('/api/public-shares/:id/enable', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };

    // 仅能操作本情侣名下的记录，否则视为不存在。
    const existing = await prisma.publicShare.findFirst({
      where: { id, coupleId: couple.id },
    });
    if (!existing) {
      throw new AppError('SHARE_NOT_FOUND', 'Public share not found.', 404);
    }

    const share = await prisma.publicShare.update({
      where: { id: existing.id },
      data: { enabled: true, disabledAt: null },
    });

    return success({ share });
  });
}
