/**
 * 临时位置共享路由。
 * 隐私（核心约束）：
 * - 仅用户主动发起的临时共享；每个会话强制有 expiresAt；用户可随时停止。
 * - 伴侣只能看到对方「active 且未过期」会话的最新位置点。
 * - 本路由不调用任何地图服务商逆地址（位置更新不触发逆地址）。
 * 所有接口都要求登录，并基于当前 active 情侣关系按 coupleId 做越权隔离。
 */
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { AppError } from '../utils/errors.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';
import { setLatest, getLatest, clearLatest } from '../services/locationStore.js';
import { broadcastToPartner } from '../plugins/ws.js';
import { recordConsentGranted } from '../utils/consent.js';

const createSessionSchema = z.object({
  durationMinutes: z.number().int().min(1).max(240),
});

const pointSchema = z.object({
  sessionId: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  coordType: z.string().optional(),
  accuracy: z.number().min(0).optional(),
  speed: z.number().optional(),
  heading: z.number().optional(),
  clientTime: z.string().datetime().optional(),
});

/** 取伴侣 userId（未绑定满则为 null）。 */
function partnerIdOf(couple: { userAId: string; userBId: string | null }, userId: string): string | null {
  return couple.userAId === userId ? couple.userBId : couple.userAId;
}

/** 会话是否「生效中」：状态 active 且未过期。 */
function isActiveSession(s: { status: string; expiresAt: Date }): boolean {
  return s.status === 'active' && s.expiresAt.getTime() > Date.now();
}

export async function locationRoutes(app: FastifyInstance): Promise<void> {
  // 开启一次临时共享会话：先停掉本人当前所有 active 会话，再新建。
  app.post('/api/location/share-session', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { durationMinutes } = parse(createSessionSchema, request.body);

    const now = new Date();
    // 结束本人旧的 active 会话（保证同一时间只有一个生效会话）。
    await prisma.locationShareSession.updateMany({
      where: { coupleId: couple.id, userId, status: 'active' },
      data: { status: 'stopped', stoppedAt: now },
    });
    await clearLatest(couple.id, userId);

    const session = await prisma.locationShareSession.create({
      data: {
        coupleId: couple.id,
        userId,
        status: 'active',
        mode: 'temporary',
        visibility: 'partner',
        startedAt: now,
        expiresAt: new Date(now.getTime() + durationMinutes * 60000),
      },
    });

    // 行为即授权：主动开启位置共享属于显式同意，补记 location 授权台账（失败不阻断）。
    await recordConsentGranted(userId, 'location').catch(() => {});

    return success({ session });
  });

  // 停止共享：仅本人；清除缓存并通知伴侣。
  app.post(
    '/api/location/share-session/:id/stop',
    { preHandler: [app.authenticate] },
    async (request) => {
      const userId = request.user.sub;
      const couple = await requireActiveCouple(userId);
      const { id } = request.params as { id: string };

      const existing = await prisma.locationShareSession.findFirst({
        where: { id, coupleId: couple.id, userId },
      });
      if (!existing) {
        throw new AppError('NOT_FOUND', 'Share session not found.', 404);
      }

      const session = await prisma.locationShareSession.update({
        where: { id: existing.id },
        data: { status: 'stopped', stoppedAt: new Date() },
      });
      await clearLatest(couple.id, userId);
      try {
        broadcastToPartner(couple.id, userId, 'partner_location_stopped', {});
      } catch {
        // WS 故障不影响 HTTP 响应
      }

      return success({ session });
    }
  );

  // 查询共享状态：我自己的生效会话 + 伴侣是否在共享。
  app.get('/api/location/status', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const partnerId = partnerIdOf(couple, userId);

    const mineRaw = await prisma.locationShareSession.findFirst({
      where: { coupleId: couple.id, userId, status: 'active' },
      orderBy: { startedAt: 'desc' },
    });
    const mine = mineRaw && isActiveSession(mineRaw) ? mineRaw : null;

    let partner: { sharing: boolean; expiresAt: Date | null } = { sharing: false, expiresAt: null };
    if (partnerId) {
      const p = await prisma.locationShareSession.findFirst({
        where: { coupleId: couple.id, userId: partnerId, status: 'active' },
        orderBy: { startedAt: 'desc' },
      });
      if (p && isActiveSession(p)) {
        partner = { sharing: true, expiresAt: p.expiresAt };
      }
    }

    return success({ mine, partner });
  });

  // 上报位置点（仅在自己开启的生效会话内）。不调用逆地址。
  app.post('/api/location/points', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const body = parse(pointSchema, request.body);

    const session = await prisma.locationShareSession.findFirst({
      where: { id: body.sessionId, coupleId: couple.id, userId },
    });
    if (!session) {
      throw new AppError('NOT_FOUND', 'Share session not found.', 404);
    }
    if (session.status !== 'active') {
      throw new AppError('SESSION_INACTIVE', 'Share session is not active.', 409);
    }
    const now = new Date();
    if (session.expiresAt.getTime() <= now.getTime()) {
      await prisma.locationShareSession.update({
        where: { id: session.id },
        data: { status: 'expired' },
      });
      await clearLatest(couple.id, userId);
      try {
        broadcastToPartner(couple.id, userId, 'partner_location_expired', {});
      } catch {
        // 忽略
      }
      throw new AppError('SESSION_EXPIRED', 'Share session has expired.', 409);
    }

    const point = await prisma.locationPoint.create({
      data: {
        sessionId: session.id,
        coupleId: couple.id,
        userId,
        latitude: body.latitude,
        longitude: body.longitude,
        coordType: body.coordType ?? 'gcj02',
        ...(body.accuracy !== undefined ? { accuracy: body.accuracy } : {}),
        ...(body.speed !== undefined ? { speed: body.speed } : {}),
        ...(body.heading !== undefined ? { heading: body.heading } : {}),
        ...(body.clientTime !== undefined ? { clientTime: new Date(body.clientTime) } : {}),
        serverTime: now,
      },
    });

    const ttlSeconds = Math.max(1, Math.ceil((session.expiresAt.getTime() - now.getTime()) / 1000));
    const payload = {
      latitude: body.latitude,
      longitude: body.longitude,
      accuracy: body.accuracy ?? null,
      serverTime: now.toISOString(),
    };
    await setLatest(couple.id, userId, payload, ttlSeconds);
    try {
      broadcastToPartner(couple.id, userId, 'partner_location_update', payload);
    } catch {
      // 忽略
    }

    return success({
      point: {
        id: point.id,
        sessionId: point.sessionId,
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        coordType: point.coordType,
        serverTime: point.serverTime,
      },
    });
  });

  // 拉取伴侣最近一次有效共享位置（WebSocket 不可用时的降级轮询）。
  app.get(
    '/api/location/partner/latest',
    { preHandler: [app.authenticate] },
    async (request) => {
      const userId = request.user.sub;
      const couple = await requireActiveCouple(userId);
      const partnerId = partnerIdOf(couple, userId);
      if (!partnerId) {
        return success({ latest: null, sharing: false });
      }

      const session = await prisma.locationShareSession.findFirst({
        where: { coupleId: couple.id, userId: partnerId, status: 'active' },
        orderBy: { startedAt: 'desc' },
      });
      if (!session || !isActiveSession(session)) {
        return success({ latest: null, sharing: false });
      }

      let latest = await getLatest(couple.id, partnerId);
      if (!latest) {
        // 缓存为空时回退到该会话最近一条未删除点位。
        const p = await prisma.locationPoint.findFirst({
          where: { sessionId: session.id, coupleId: couple.id, userId: partnerId, deletedAt: null },
          orderBy: { serverTime: 'desc' },
        });
        if (p) {
          latest = {
            latitude: Number(p.latitude),
            longitude: Number(p.longitude),
            accuracy: p.accuracy ?? null,
            serverTime: p.serverTime.toISOString(),
          };
        }
      }

      return success({ latest: latest ?? null, sharing: true });
    }
  );

  // 删除自己的某个位置点（软删除）。
  app.delete('/api/location/points/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };

    const existing = await prisma.locationPoint.findFirst({
      where: { id, coupleId: couple.id, userId, deletedAt: null },
    });
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Location point not found.', 404);
    }
    await prisma.locationPoint.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });

    return success({ id: existing.id });
  });
}

// 避免未使用类型告警（Prisma Decimal 在 toNumber 处用到）。
export type _PrismaDecimal = Prisma.Decimal;
