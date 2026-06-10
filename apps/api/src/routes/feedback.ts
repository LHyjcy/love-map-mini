/**
 * 用户反馈路由（运营）：用户提交反馈、查看自己提交过的反馈。
 * Feedback 为「按用户」维度，coupleId 尽力填充（未绑定情侣时为 null，反馈仍可提交）。
 * 所有接口都要求登录，列表仅返回当前用户自己的反馈，做越权隔离。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { assertTextAllowed } from '../services/contentSec.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const createFeedbackSchema = z.object({
  content: z.string().min(1).max(1000),
  contact: z.string().max(100).optional(),
});

export async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  // 提交一条反馈。尽力填充当前情侣关系；未绑定时 coupleId 为 null，不影响提交。
  app.post('/api/feedback', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const { content, contact } = parse(createFeedbackSchema, request.body);

    // UGC 内容安全审核（未配微信时放行）。
    await assertTextAllowed(content);

    let coupleId: string | null = null;
    try {
      const couple = await requireActiveCouple(userId);
      coupleId = couple.id;
    } catch {
      // 未绑定情侣关系时忽略，coupleId 保持 null。
      coupleId = null;
    }

    const feedback = await prisma.feedback.create({
      data: {
        userId,
        coupleId,
        content,
        contact: contact ?? null,
      },
    });

    return success({ feedback: { id: feedback.id, createdAt: feedback.createdAt } });
  });

  // 查询当前用户自己提交过的反馈，最新在前，最多 50 条。
  app.get('/api/feedback', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;

    const feedback = await prisma.feedback.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return success({ feedback });
  });
}
