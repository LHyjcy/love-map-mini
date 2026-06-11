/**
 * 照片媒体元数据路由：为某条回忆登记/列出/软删除照片元数据。
 * 所有接口都要求登录，并基于当前情侣关系（coupleId）做越权隔离。
 *
 * 说明：真正的签名直传（OSS/COS 临时凭证）是 Phase 12 的范围。
 * 这里只持久化客户端在上传完成后提供的照片元数据（fileUrl/objectKey 等），
 * 后端不负责文件的实际上传与存储。
 */
import { promises as fs } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { diskFilePath } from '../services/storage.js';
import { removeThumb } from '../services/thumbnails.js';
import { requireActiveCouple } from '../utils/couple.js';
import { AppError } from '../utils/errors.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const createSchema = z.object({
  memoryId: z.string().min(1),
  fileUrl: z.string().url(),
  objectKey: z.string().min(1).max(200),
  mimeType: z.string().min(1),
  width: z.number().int().min(0).optional(),
  height: z.number().int().min(0).optional(),
  size: z.number().int().min(0).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  // 登记一条照片元数据（客户端已完成上传，仅持久化元数据）。
  app.post('/api/media', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const body = parse(createSchema, request.body);

    // 校验回忆属于当前情侣且未删除。
    const memory = await prisma.memory.findFirst({
      where: { id: body.memoryId, coupleId: couple.id, deletedAt: null },
    });
    if (!memory) {
      throw new AppError('MEMORY_NOT_FOUND', 'Memory not found.', 404);
    }

    const media = await prisma.media.create({
      data: {
        coupleId: couple.id,
        memoryId: body.memoryId,
        uploaderId: userId,
        fileUrl: body.fileUrl,
        objectKey: body.objectKey,
        mimeType: body.mimeType,
        width: body.width,
        height: body.height,
        size: body.size,
        sortOrder: body.sortOrder ?? 0,
      },
    });

    return success({ media });
  });

  // 列出某条回忆下的照片元数据（情侣范围内、未删除），按 sortOrder 升序。
  app.get('/api/media', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);

    const memoryId = (request.query as { memoryId?: string }).memoryId;
    if (!memoryId) {
      throw new AppError('VALIDATION_ERROR', 'memoryId is required', 400);
    }

    const rows = await prisma.media.findMany({
      where: { memoryId, coupleId: couple.id, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });

    return success({ media: rows });
  });

  // 软删除一条照片元数据。
  app.delete('/api/media/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);

    const { id } = request.params as { id: string };

    const media = await prisma.media.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!media) {
      throw new AppError('NOT_FOUND', 'Media not found.', 404);
    }

    await prisma.media.update({
      where: { id: media.id },
      data: { deletedAt: new Date() },
    });

    // disk 模式下尽力物理删除磁盘文件，兑现“可删除照片”的隐私承诺（自托管场景）。
    // 删除失败不影响接口结果：元数据已软删除，/files 也不再对外提供该照片。
    if (config.storageProvider === 'disk' && media.objectKey) {
      const filePath = diskFilePath(media.objectKey);
      if (filePath) {
        try {
          await fs.unlink(filePath);
        } catch {
          // 文件可能已不存在或暂不可删，忽略
        }
      }
      // 缩略图一并清理
      await removeThumb(media.objectKey);
    }

    return success({ id });
  });
}
