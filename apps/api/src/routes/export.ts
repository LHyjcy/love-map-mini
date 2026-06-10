/**
 * 数据导出（PRD 第 10 节风险项：解绑后数据归属/导出规则）。
 * 允许用户导出「当前情侣关系」的全部数据为 JSON。
 *
 * 隐私约束（见 CLAUDE.md）：
 * - 仅导出当前用户所属情侣（coupleId）的数据，绝不跨情侣。
 * - 不导出伴侣的 openid/unionid/sessionKey 等身份敏感字段；用户摘要仅含 id/昵称/头像。
 * - 隐私授权记录按当前 userId 维度导出。
 * - 读取一律过滤 deletedAt: null（仅对含软删除列的模型）。
 * 所有接口都要求登录，并基于当前情侣关系做越权校验。
 */
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { success } from '../utils/response.js';

/** 用户公开字段：仅暴露展示所需，绝不含 openid/unionid/sessionKey 等敏感信息。 */
const userPublicSelect = {
  id: true,
  nickname: true,
  avatarUrl: true,
} as const;

/** 将 Decimal 经纬度转为 number，保证 JSON 干净。 */
function withLatLng<T extends { latitude: Prisma.Decimal; longitude: Prisma.Decimal }>(row: T) {
  return { ...row, latitude: Number(row.latitude), longitude: Number(row.longitude) };
}

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  // 导出当前情侣关系的全部数据。
  app.get('/api/export', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const coupleId = couple.id;
    const notDeleted = { coupleId, deletedAt: null };

    const [
      users,
      places,
      memories,
      media,
      checkins,
      tasks,
      pointLedger,
      shopItems,
      redemptions,
      events,
      privacyConsents,
    ] = await Promise.all([
      // 情侣双方公开档案（A/B 任一可能为空）：仅 id/昵称/头像，绝不含 openid/unionid。
      prisma.user.findMany({
        where: {
          deletedAt: null,
          id: { in: [couple.userAId, ...(couple.userBId ? [couple.userBId] : [])] },
        },
        select: userPublicSelect,
      }),
      prisma.place.findMany({ where: notDeleted, orderBy: { createdAt: 'desc' } }),
      prisma.memory.findMany({ where: notDeleted, orderBy: { createdAt: 'desc' } }),
      // Media 含软删除列。
      prisma.media.findMany({ where: notDeleted, orderBy: { createdAt: 'desc' } }),
      prisma.checkin.findMany({ where: notDeleted, orderBy: { createdAt: 'desc' } }),
      prisma.task.findMany({ where: notDeleted, orderBy: { createdAt: 'desc' } }),
      // PointLedger 无软删除列。
      prisma.pointLedger.findMany({ where: { coupleId }, orderBy: { createdAt: 'desc' } }),
      prisma.shopItem.findMany({ where: notDeleted, orderBy: { createdAt: 'desc' } }),
      // Redemption 无软删除列。
      prisma.redemption.findMany({ where: { coupleId }, orderBy: { createdAt: 'desc' } }),
      prisma.event.findMany({ where: notDeleted, orderBy: { eventDate: 'asc' } }),
      // PrivacyConsent 按用户维度（无 coupleId），无软删除列。
      prisma.privacyConsent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    ]);

    return success({
      export: {
        couple: {
          id: couple.id,
          status: couple.status,
          togetherAt: couple.togetherAt,
          createdAt: couple.createdAt,
        },
        users,
        places: places.map(withLatLng),
        memories,
        media,
        checkins: checkins.map(withLatLng),
        tasks,
        pointLedger,
        shopItems,
        redemptions,
        events,
        privacyConsents,
      },
    });
  });
}
