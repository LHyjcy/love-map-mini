/**
 * 账号注销路由（个人信息保护法要求：用户有权注销账号并删除/匿名化个人信息）。
 * 注销为不可逆的软删除 + 匿名化操作，所有接口要求登录并基于当前用户操作。
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { getActiveCoupleForUser } from '../utils/couple.js';
import { AppError } from '../utils/errors.js';
import { success } from '../utils/response.js';

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  // 注销当前账号：软删除并匿名化用户，若在情侣关系中则同时解绑。
  app.post('/api/account/delete', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;

    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found.', 404);
    }

    await prisma.$transaction(async (tx) => {
      // 若处于生效情侣关系，置为 unbound，使伴侣也失去访问权限；保留历史行。
      const couple = await getActiveCoupleForUser(userId);
      if (couple) {
        await tx.couple.update({
          where: { id: couple.id },
          data: { status: 'unbound' },
        });
      }

      // 软删除 + 匿名化：清空可识别信息。
      // 将 openid/unionid 置空（字段唯一但可空），以便同一微信账号下次可重新注册。
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          nickname: '已注销用户',
          avatarUrl: null,
          openid: null,
          unionid: null,
        },
      });
    });

    // 注：情侣共有内容（地点、回忆等）仍保留在 couple 之下，
    // 不随单方注销删除；完整数据清除由独立的运维任务处理。
    return success({ ok: true });
  });
}
