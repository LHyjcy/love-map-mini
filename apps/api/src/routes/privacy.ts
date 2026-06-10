/**
 * 隐私授权路由：记录用户对定位、相册、相机、公开分享等权限的同意/撤销。
 * PrivacyConsent 为「按用户」维度（无 coupleId），且为追加写（append-only），不做软删除。
 * 所有接口都要求登录，并基于当前用户做越权隔离。
 *
 * 撤销联动（让授权开关真正生效，而不只是记台账）：
 * - 撤销 location：立即停止本人所有生效中的临时位置共享会话，并清掉伴侣可见的最新位置缓存。
 * - 撤销 public_share：立即关闭本情侣名下所有已开启的公开地图分享。
 * 反向的「行为即授权」补记见 utils/consent.ts。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { broadcastToPartner } from '../plugins/ws.js';
import { clearLatest } from '../services/locationStore.js';
import { getActiveCoupleForUser } from '../utils/couple.js';
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

    // 撤销联动：让开关立刻产生实际效果（失败不阻断台账写入的响应）。
    if (!agreed) {
      try {
        const couple = await getActiveCoupleForUser(userId);
        if (consentType === 'location' && couple) {
          // 停止本人所有生效中的共享会话 + 清缓存 + 通知伴侣。
          await prisma.locationShareSession.updateMany({
            where: { coupleId: couple.id, userId, status: 'active' },
            data: { status: 'stopped', stoppedAt: now },
          });
          await clearLatest(couple.id, userId);
          try {
            broadcastToPartner(couple.id, userId, 'partner_location_stopped', {});
          } catch {
            // WS 故障不影响 HTTP 响应
          }
        } else if (consentType === 'public_share' && couple) {
          // 关闭本情侣所有已开启的公开地图分享。
          await prisma.publicShare.updateMany({
            where: { coupleId: couple.id, enabled: true },
            data: { enabled: false, disabledAt: now },
          });
        }
      } catch {
        // 联动属于尽力而为：异常不影响授权记录本身
      }
    }

    return success({ consent });
  });
}
