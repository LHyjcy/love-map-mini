/**
 * 上传凭证路由（Phase 12）。
 * 客户端先调此接口拿临时凭证直传对象存储，再用 POST /api/media 保存元数据。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireActiveCouple } from '../utils/couple.js';
import { success } from '../utils/response.js';
import { createUploadCredential } from '../services/storage.js';
import { parse } from '../utils/validation.js';

const credentialSchema = z.object({
  mimeType: z.string().min(1).max(100),
});

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  // 签发图片上传凭证。需登录且已绑定情侣。
  app.post('/api/media/upload-credential', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    await requireActiveCouple(userId);

    const { mimeType } = parse(credentialSchema, request.body);
    const credential = createUploadCredential(mimeType);
    return success({ credential });
  });
}
