/**
 * 本地磁盘照片存储路由（disk provider，私用自托管，免 COS）。
 * - PUT /api/media/upload?key&exp&sig：接收原始图片字节，HMAC 短时签名鉴权（免登录头，
 *   与小程序既有 cloudUpload 的裸字节 PUT 流程兼容），写入磁盘根目录。
 * - GET /files/*：公开静态返回图片（私用场景；objectKey 为不可猜的随机名）。
 * 仅 STORAGE_PROVIDER=disk 时有意义；不依赖任何新包。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import {
  MAX_UPLOAD_BYTES,
  verifyDiskUploadToken,
  diskFilePath,
  contentTypeForKey,
} from '../services/storage.js';
import { success, failure } from '../utils/response.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** 校验文件首字节魔数是否为允许的图片格式（JPEG/PNG/GIF/WEBP），防止伪装成图片的任意内容落盘。 */
function isAllowedImageMagic(buf: Buffer): boolean {
  // JPEG: ff d8 ff
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG: 89 50 4e 47
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return true;
  }
  // GIF: 'GIF8'
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'GIF8') return true;
  // WEBP: 'RIFF' (0-3) + 'WEBP' (8-11)
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return true;
  }
  return false;
}

export function registerDiskStorage(app: FastifyInstance): void {
  // 把图片类型按原始字节缓冲（用于接收 PUT 上传体）。
  for (const t of IMAGE_TYPES) {
    try {
      app.addContentTypeParser(t, { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    } catch {
      // 重复注册等异常忽略
    }
  }

  // 接收上传（签名鉴权，免登录头）。
  app.put(
    '/api/media/upload',
    { bodyLimit: MAX_UPLOAD_BYTES + 1024 },
    async (request, reply) => {
      const q = request.query as { key?: string; exp?: string; sig?: string };
      const key = q.key ?? '';
      const exp = Number(q.exp);
      const sig = q.sig ?? '';
      if (!key || !verifyDiskUploadToken(key, exp, sig)) {
        return reply.status(403).send(failure('UPLOAD_FORBIDDEN', '上传签名无效或已过期'));
      }
      const target = diskFilePath(key);
      if (!target) {
        return reply.status(400).send(failure('BAD_OBJECT_KEY', '非法的对象路径'));
      }
      const body = request.body as unknown;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return reply.status(400).send(failure('EMPTY_BODY', '空的上传内容'));
      }
      if (body.length > MAX_UPLOAD_BYTES) {
        return reply.status(413).send(failure('FILE_TOO_LARGE', '文件超过大小限制'));
      }
      // 魔数校验：只允许真实的 JPEG/PNG/GIF/WEBP 字节，拒绝伪装的任意文件。
      if (!isAllowedImageMagic(body)) {
        return reply.status(400).send(failure('INVALID_IMAGE', '上传内容不是允许的图片格式'));
      }
      // 防重放：签名在有效期内可重复使用，目标文件已存在时拒绝覆盖。
      let exists = false;
      try {
        await fs.access(target);
        exists = true;
      } catch {
        // 文件不存在，可以写入
      }
      if (exists) {
        return reply.status(409).send(failure('ALREADY_UPLOADED', '该对象已上传，不允许重复上传'));
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, body);
      return success({ ok: true, objectKey: key, size: body.length });
    }
  );

  // 静态返回图片（私用场景，objectKey 不可猜）。
  app.get('/files/*', async (request, reply) => {
    const objectKey = (request.params as { '*'?: string })['*'] ?? '';
    const target = objectKey ? diskFilePath(objectKey) : null;
    if (!target) {
      return reply.status(404).send(failure('NOT_FOUND', 'File not found'));
    }
    // 软删除检查：已删除的照片必须立刻停止对外提供（“可删除照片”隐私承诺）。
    // 无元数据行时仍然放行：上传发生在元数据登记之前。
    const media = await prisma.media.findFirst({ where: { objectKey } });
    if (media && media.deletedAt !== null) {
      return reply.status(404).send(failure('NOT_FOUND', 'File not found'));
    }
    try {
      const buf = await fs.readFile(target);
      reply.header('Cache-Control', 'private, max-age=31536000');
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.type(contentTypeForKey(objectKey));
      return reply.send(buf);
    } catch {
      return reply.status(404).send(failure('NOT_FOUND', 'File not found'));
    }
  });
}
