/**
 * AI 文案路由：差异化文案生成。
 * 所有接口都要求登录（app.authenticate）；本组接口不涉及具体 coupleId 资源，
 * 仅生成文案，因此不做情侣越权校验，但必须是已认证用户。
 *
 * 底层由 services/aiCopy 提供 LLM 抽象 + 模板回落：
 * 没有 AI Key 时返回 source: 'template'，开发环境也可正常使用。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { genMemoryCopy, genReviewSummary, genShareCaption } from '../services/aiCopy.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const tagsSchema = z.array(z.string().trim().min(1).max(50)).max(8);

const memoryCopySchema = z.object({
  placeTitle: z.string().trim().max(100).optional(),
  tags: tagsSchema.optional(),
  mood: z.string().trim().max(50).optional(),
  date: z.string().trim().max(50).optional(),
});

const shareCaptionSchema = z.object({
  placeTitle: z.string().trim().max(100).optional(),
  tags: tagsSchema.optional(),
  count: z.number().int().min(0).max(100000).optional(),
});

const reviewSummarySchema = z.object({
  memoryCount: z.number().int().min(0).max(1000000),
  placeCount: z.number().int().min(0).max(1000000),
  cityCount: z.number().int().min(0).max(1000000),
  provinceCount: z.number().int().min(0).max(1000000),
  photoCount: z.number().int().min(0).max(1000000),
  topTags: tagsSchema.optional(),
  period: z.string().trim().max(50).optional(),
});

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  // 回忆文案：根据地点、标签、心情、日期生成标题与小故事。
  app.post('/api/ai/memory-copy', { preHandler: [app.authenticate] }, async (request) => {
    const body = parse(memoryCopySchema, request.body);
    const result = await genMemoryCopy(body);
    return success(result);
  });

  // 分享配文：根据地点、标签、数量生成一句话分享文案。
  app.post('/api/ai/share-caption', { preHandler: [app.authenticate] }, async (request) => {
    const body = parse(shareCaptionSchema, request.body);
    const result = await genShareCaption(body);
    return success(result);
  });

  // 回顾总结：根据回顾统计数据生成一段温暖小结。
  app.post('/api/ai/review-summary', { preHandler: [app.authenticate] }, async (request) => {
    const body = parse(reviewSummarySchema, request.body);
    const result = await genReviewSummary(body);
    return success(result);
  });
}
