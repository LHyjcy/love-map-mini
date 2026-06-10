/**
 * 位置打卡路由：情侣共享的"我在这里"打卡，以及查看伴侣最近一次共享位置。
 * 所有接口都要求登录，并基于当前 active 情侣关系按 coupleId 做越权隔离。
 * 读取一律过滤 deletedAt: null；删除为软删除，绝不物理删除。
 *
 * 隐私保证（情侣应用核心约束）：
 * - 不做后台持续定位，没有任何自动上报；每次打卡都由用户主动发起。
 * - shareScope 默认为 'self'，即默认仅本人可见，不向伴侣暴露位置。
 * - 伴侣位置仅当某条打卡 shareScope 为 'partner' 或 'memory'，且未过期（expiresAt 为空或在未来）时才可见。
 * - shareScope='partner' 且未指定有效期时，默认 120 分钟后过期，避免位置被无限期可见；
 *   shareScope='memory'（保存为共同回忆）是用户显式的永久动作，不套默认过期。
 * - 用户可随时软删除自己的打卡记录。
 */
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { AppError } from '../utils/errors.js';
import { haversineMeters } from '../utils/geo.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';
import { recordConsentGranted } from '../utils/consent.js';

const shareScopeSchema = z.enum(['self', 'partner', 'memory']);

// shareScope='partner' 且未指定 shareTtlMinutes 时的默认共享有效期（分钟），
// 防止伴侣位置因 expiresAt 为空而被无限期可见。
const DEFAULT_PARTNER_SHARE_TTL_MINUTES = 120;

const createCheckinSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().optional(),
  accuracy: z.number().min(0).optional(),
  placeId: z.string().optional(),
  shareScope: shareScopeSchema.optional(),
  shareTtlMinutes: z.number().int().min(1).max(1440).optional(),
});

type CheckinRow = {
  id: string;
  coupleId: string;
  userId: string;
  placeId: string | null;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  address: string | null;
  accuracy: number | null;
  shareScope: string;
  expiresAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
};

/** Decimal 经纬度转 number，保证 JSON 输出干净。 */
function toCheckinView(c: CheckinRow) {
  return {
    id: c.id,
    coupleId: c.coupleId,
    userId: c.userId,
    placeId: c.placeId,
    latitude: Number(c.latitude),
    longitude: Number(c.longitude),
    address: c.address,
    accuracy: c.accuracy,
    shareScope: c.shareScope,
    expiresAt: c.expiresAt,
    createdAt: c.createdAt,
  };
}

export async function checkinRoutes(app: FastifyInstance): Promise<void> {
  // 主动打卡：记录一次位置。默认 shareScope='self'，即仅本人可见，不暴露给伴侣。
  app.post('/api/checkins', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const body = parse(createCheckinSchema, request.body);

    // 若指定关联地点，校验该地点属于当前情侣关系（越权或不存在均 404）。
    if (body.placeId !== undefined) {
      const place = await prisma.place.findFirst({
        where: { id: body.placeId, coupleId: couple.id, deletedAt: null },
      });
      if (!place) {
        throw new AppError('PLACE_NOT_FOUND', 'Place not found.', 404);
      }
    }

    // 过期时间规则：
    // - shareScope='partner'：用调用方给定的有效期；未给定时默认 120 分钟，避免位置无限期可见。
    // - shareScope='memory'：仅在显式给定有效期时设置；保存为共同回忆是显式的永久动作，不套默认过期。
    // - shareScope='self'：仅本人可见，不设过期。
    const shareScope = body.shareScope ?? 'self';
    let ttlMinutes: number | undefined;
    if (shareScope === 'partner') {
      ttlMinutes = body.shareTtlMinutes ?? DEFAULT_PARTNER_SHARE_TTL_MINUTES;
    } else if (shareScope === 'memory') {
      ttlMinutes = body.shareTtlMinutes;
    }
    const expiresAt =
      ttlMinutes !== undefined ? new Date(Date.now() + ttlMinutes * 60000) : null;

    const checkin = await prisma.checkin.create({
      data: {
        coupleId: couple.id,
        userId,
        latitude: body.latitude,
        longitude: body.longitude,
        shareScope,
        expiresAt,
        ...(body.placeId !== undefined ? { placeId: body.placeId } : {}),
        ...(body.address !== undefined ? { address: body.address } : {}),
        ...(body.accuracy !== undefined ? { accuracy: body.accuracy } : {}),
      },
    });

    // 行为即授权：向伴侣共享位置属于显式同意，补记 location 授权台账（失败不阻断打卡）。
    if (shareScope !== 'self') {
      await recordConsentGranted(userId, 'location').catch(() => {});
    }

    return success({ checkin: toCheckinView(checkin) });
  });

  // 列出我自己的打卡记录（仅本人，按时间倒序，最多 50 条）。
  app.get('/api/checkins', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);

    const rows = await prisma.checkin.findMany({
      where: { coupleId: couple.id, userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return success({ checkins: rows.map(toCheckinView) });
  });

  // 查看伴侣最近一次"有效共享"的位置。
  // 隐私：仅返回伴侣 shareScope 为 partner/memory 且未过期的打卡；否则一律返回 null。
  app.get(
    '/api/checkins/partner-latest',
    { preHandler: [app.authenticate] },
    async (request) => {
      const userId = request.user.sub;
      const couple = await requireActiveCouple(userId);

      const partnerId = couple.userAId === userId ? couple.userBId : couple.userAId;
      if (!partnerId) {
        return success({ checkin: null, distanceMeters: null });
      }

      const partner = await prisma.checkin.findFirst({
        where: {
          coupleId: couple.id,
          userId: partnerId,
          deletedAt: null,
          shareScope: { in: ['partner', 'memory'] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!partner) {
        return success({ checkin: null, distanceMeters: null });
      }

      // 取我自己最近一次打卡用于估算两人距离；没有则距离为 null。
      const mine = await prisma.checkin.findFirst({
        where: { coupleId: couple.id, userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });

      const distanceMeters = mine
        ? haversineMeters(
            Number(mine.latitude),
            Number(mine.longitude),
            Number(partner.latitude),
            Number(partner.longitude)
          )
        : null;

      return success({ checkin: toCheckinView(partner), distanceMeters });
    }
  );

  // 软删除自己的打卡：置 deletedAt，保留历史记录。越权或不存在均返回 404。
  app.delete('/api/checkins/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };

    const existing = await prisma.checkin.findFirst({
      where: { id, userId, coupleId: couple.id, deletedAt: null },
    });
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Checkin not found.', 404);
    }

    await prisma.checkin.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return success({ id });
  });
}
