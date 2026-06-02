/**
 * 隐私授权路由：记录用户对定位、相册、相机、公开分享等权限的同意/撤销。
 * PrivacyConsent 为「按用户」维度（无 coupleId），且为追加写（append-only），不做软删除。
 * 所有接口都要求登录，并基于当前用户做越权隔离。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const consentSchema = z.object({
  consentType: z.enum(['location', 'album', 'camera', 'public_share']),
  version: z.string().min(1).max(50),
  agreed: z.boolean(),
});

export async function privacyRoutes(app: FastifyInstance): Promise<void> {
  // 查询当前用户的全部授权记录（追加写历史，最新在前）。
  app.get('/api/privacy/consents', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;

    const consents = await prisma.privacyConsent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return success({ consents });
  });

  // 记录一次授权或撤销。追加写：每次都新增一行，不更新历史记录。
  app.post('/api/privacy/consents', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const { consentType, version, agreed } = parse(consentSchema, request.body);

    const now = new Date();
    const consent = await prisma.privacyConsent.create({
      data: {
        userId,
        consentType,
        version,
        // 同意写 agreedAt、撤销写 revokedAt，二者互斥。
        agreedAt: agreed ? now : null,
        revokedAt: agreed ? null : now,
      },
    });

    return success({ consent });
  });
}
