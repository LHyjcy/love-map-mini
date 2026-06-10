/**
 * 订阅消息路由（PRD 4.9）。
 *
 * /subscribe 持久化一条 ReminderSubscription（订阅记录）；真正的微信下发在
 * 提醒时间到达后由 /run-due 触发（subscribeMessage 服务端发送）。所有接口都要求登录。
 *
 * 安全：所有写/读都先取当前 active 情侣关系，用 coupleId 做越权隔离。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';
import { requireActiveCouple } from '../utils/couple.js';
import { sendSubscribeMessage } from '../services/wechatPush.js';

const subscribeSchema = z.object({
  templateId: z.string().min(1).max(100),
  eventId: z.string().optional(),
  remindAt: z.string().datetime().optional(),
});

// 提醒类订阅消息模板文案占位列表。
const TEMPLATES = [
  { key: 'anniversary', title: '纪念日提醒', desc: '在重要日子前提醒你们' },
  { key: 'plan', title: '约会计划提醒', desc: '计划当天提醒' },
];

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  // 受理一条订阅：校验入参后落库为 ReminderSubscription。
  // 真正的微信 subscribeMessage 服务端下发在 remindAt 到达后由 /run-due 触发。
  app.post('/api/notifications/subscribe', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const { templateId, eventId, remindAt } = parse(subscribeSchema, request.body);
    const couple = await requireActiveCouple(userId);

    await prisma.reminderSubscription.create({
      data: {
        coupleId: couple.id,
        userId,
        templateId,
        eventId: eventId ?? null,
        remindAt: remindAt ? new Date(remindAt) : null,
      },
    });

    return success({ accepted: true, templateId });
  });

  // 返回提醒类订阅消息模板文案占位列表。
  app.get('/api/notifications/templates', { preHandler: [app.authenticate] }, async () => {
    return success({ templates: TEMPLATES });
  });

  // 触发本情侣到期（remindAt <= now 且未发送）的订阅消息下发。
  // 未配置微信时安全降级返回 configured:false，便于开发环境调用。
  app.post('/api/notifications/run-due', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);

    // 微信未配置时不进入下发循环，直接安全返回。
    if (!process.env.WECHAT_APP_ID || !process.env.WECHAT_APP_SECRET) {
      return success({ sent: 0, failed: 0, configured: false });
    }

    const now = new Date();
    const due = await prisma.reminderSubscription.findMany({
      where: {
        coupleId: couple.id,
        sentAt: null,
        remindAt: { lte: now },
      },
    });

    let sent = 0;
    let failed = 0;

    for (const sub of due) {
      try {
        const user = await prisma.user.findUnique({ where: { id: sub.userId } });
        if (!user?.openid) {
          // 无 openid 无法下发，记为失败但不中断其余。
          failed += 1;
          continue;
        }

        const when = sub.remindAt ?? now;
        await sendSubscribeMessage(
          user.openid,
          sub.templateId,
          {
            thing1: { value: '情侣地图提醒' },
            time2: { value: when.toISOString() },
          },
          '/pages/home/home'
        );

        await prisma.reminderSubscription.update({
          where: { id: sub.id },
          data: { sentAt: new Date() },
        });
        sent += 1;
      } catch {
        // 单条失败不影响其余下发。
        failed += 1;
      }
    }

    return success({ sent, failed });
  });
}
