/**
 * 共同打卡（co-checkin）候选检测路由（PRD 共同打卡）。
 * 目标：若两位伴侣在最近一段时间内、在同一地点附近各自主动打卡过，
 * 则判定为一次“共同打卡”候选，用于前端提示「生成共同回忆」。
 *
 * 所有接口都要求登录，并基于当前 active 情侣关系按 coupleId 做越权隔离。
 * 读取一律过滤 deletedAt: null。
 *
 * 隐私保证（情侣应用核心约束，见 CLAUDE.md）：
 * - 本接口仅“读取”双方已存在的、用户主动发起的打卡记录来做匹配。
 * - 伴侣侧仅 shareScope 为 partner/memory 且未过期（expiresAt 为空或在未来）的打卡参与匹配；
 *   shareScope='self'（默认仅本人可见）的打卡绝不参与，避免向对方泄露位置。
 * - 不做后台持续定位，没有任何自动上报或后台追踪。
 */
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { haversineMeters } from '../utils/geo.js';
import { success } from '../utils/response.js';

// 候选判定阈值。
const MAX_DISTANCE_METERS = 200;
const MAX_TIME_DIFF_MINUTES = 180;
// 每人最多取最近的打卡条数，避免全表扫描。
const RECENT_LIMIT = 20;

type CheckinRow = {
  id: string;
  placeId: string | null;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  createdAt: Date;
};

export async function coCheckinRoutes(app: FastifyInstance): Promise<void> {
  // 检测一次共同打卡候选；无候选返回 candidate: null。
  app.get('/api/co-checkin', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);

    // 伴侣 id（可能尚未绑定第二人）。
    const partnerId = couple.userAId === userId ? couple.userBId : couple.userAId;
    if (!partnerId) {
      return success({ candidate: null });
    }

    const select = {
      id: true,
      placeId: true,
      latitude: true,
      longitude: true,
      createdAt: true,
    } as const;

    // 分别取双方在本情侣关系下、最近的打卡记录。
    // 隐私：伴侣侧仅取已向伴侣共享（partner/memory）且未过期的打卡，
    // 与 /api/checkins/partner-latest 的可见性规则保持一致；自己的打卡无需过滤。
    const [mineRows, partnerRows] = await Promise.all([
      prisma.checkin.findMany({
        where: { coupleId: couple.id, userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: RECENT_LIMIT,
        select,
      }),
      prisma.checkin.findMany({
        where: {
          coupleId: couple.id,
          userId: partnerId,
          deletedAt: null,
          shareScope: { in: ['partner', 'memory'] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { createdAt: 'desc' },
        take: RECENT_LIMIT,
        select,
      }),
    ]);

    // 在所有 (我的, 伴侣的) 打卡对中，找出满足距离 ≤200m 且时间差 ≤180min 的、
    // 最近（两者 createdAt 较大值最大）的一对。
    let best: {
      mine: CheckinRow;
      partner: CheckinRow;
      distanceMeters: number;
      diffMinutes: number;
      recencyMs: number;
    } | null = null;

    for (const mine of mineRows as CheckinRow[]) {
      for (const partner of partnerRows as CheckinRow[]) {
        const distanceMeters = haversineMeters(
          Number(mine.latitude),
          Number(mine.longitude),
          Number(partner.latitude),
          Number(partner.longitude)
        );
        if (distanceMeters > MAX_DISTANCE_METERS) {
          continue;
        }

        const diffMs = Math.abs(mine.createdAt.getTime() - partner.createdAt.getTime());
        const diffMinutes = diffMs / 60000;
        if (diffMinutes > MAX_TIME_DIFF_MINUTES) {
          continue;
        }

        const recencyMs = Math.max(mine.createdAt.getTime(), partner.createdAt.getTime());
        if (!best || recencyMs > best.recencyMs) {
          best = { mine, partner, distanceMeters, diffMinutes, recencyMs };
        }
      }
    }

    if (!best) {
      return success({ candidate: null });
    }

    // 任一打卡关联了地点，则查出该地点标题（限定在本情侣关系、未删除）。
    let placeId: string | null = null;
    let placeTitle: string | null = null;
    const linkedPlaceId = best.mine.placeId ?? best.partner.placeId;
    if (linkedPlaceId) {
      const place = await prisma.place.findFirst({
        where: { id: linkedPlaceId, coupleId: couple.id, deletedAt: null },
        select: { id: true, title: true },
      });
      if (place) {
        placeId = place.id;
        placeTitle = place.title;
      }
    }

    return success({
      candidate: {
        placeId,
        placeTitle,
        distanceMeters: Math.round(best.distanceMeters),
        withinMinutes: Math.round(best.diffMinutes),
        myCheckinId: best.mine.id,
        partnerCheckinId: best.partner.id,
      },
    });
  });
}
