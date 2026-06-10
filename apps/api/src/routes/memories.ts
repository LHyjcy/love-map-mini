/**
 * 回忆路由：在某个地点下创建/查询/更新/删除情侣回忆。
 * 所有接口都要求登录，并基于当前情侣关系（coupleId）做越权校验。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { assertTextAllowed } from '../services/contentSec.js';
import { requireActiveCouple } from '../utils/couple.js';
import { AppError } from '../utils/errors.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const visibilitySchema = z.enum(['private', 'couple', 'public']);

const tagsSchema = z.array(z.string().min(1).max(20)).max(8).optional();

const createSchema = z.object({
  placeId: z.string().min(1),
  title: z.string().min(1).max(100),
  content: z.string().optional(),
  mood: z.string().optional(),
  memoryDate: z.string().datetime().optional(),
  visibility: visibilitySchema.optional(),
  tags: tagsSchema,
});

const updateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  content: z.string().optional(),
  mood: z.string().optional(),
  memoryDate: z.string().datetime().optional(),
  visibility: visibilitySchema.optional(),
  tags: tagsSchema,
});

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const listQuerySchema = z.object({
  placeId: z.string().min(1).optional(),
  tag: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// 将标签数组规范化为逗号分隔字符串：去空白、去空值、去重。
function normalizeTags(tags: string[]): string {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result.join(',');
}

// 已删除的媒体不返回，并按 sortOrder 升序排列。
const mediaInclude = {
  media: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' as const } },
};

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  // 创建回忆：先校验 placeId 属于当前情侣，再写入。
  app.post('/api/memories', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const body = parse(createSchema, request.body);

    const place = await prisma.place.findFirst({
      where: { id: body.placeId, coupleId: couple.id, deletedAt: null },
    });
    if (!place) {
      throw new AppError('PLACE_NOT_FOUND', 'Place not found.', 404);
    }

    // UGC 内容安全审核（未配微信时放行）。
    await assertTextAllowed([body.title, body.content].filter(Boolean).join('\n'));

    const memory = await prisma.memory.create({
      data: {
        coupleId: couple.id,
        placeId: body.placeId,
        createdById: userId,
        title: body.title,
        content: body.content,
        mood: body.mood,
        memoryDate: body.memoryDate ? new Date(body.memoryDate) : undefined,
        visibility: body.visibility,
        tags: body.tags ? normalizeTags(body.tags) : undefined,
      },
    });

    return success({ memory });
  });

  // 查询当前情侣的回忆列表，可按 placeId / tag 过滤，附带未删除媒体。
  // 游标分页：limit 默认 20（最大 100），cursor 为上一页 nextCursor（最后一条回忆 id）。
  app.get('/api/memories', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const query = parse(listQuerySchema, request.query);
    // Zod default(20) 已在运行时兜底；?? 仅用于收窄 parse 推导出的输入类型。
    const limit = query.limit ?? 20;

    // 多取 1 条用于判断是否还有下一页；id 作为 createdAt 相同时的稳定排序兜底。
    const rows = await prisma.memory.findMany({
      where: {
        coupleId: couple.id,
        deletedAt: null,
        ...(query.placeId ? { placeId: query.placeId } : {}),
        ...(query.tag ? { tags: { contains: query.tag } } : {}),
      },
      include: mediaInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const memories = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? memories[memories.length - 1].id : null;

    return success({ memories, nextCursor });
  });

  // 查询单条回忆，附带未删除媒体。
  app.get('/api/memories/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = parse(idParamsSchema, request.params);

    const memory = await prisma.memory.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
      include: mediaInclude,
    });
    if (!memory) {
      throw new AppError('NOT_FOUND', 'Memory not found.', 404);
    }

    return success({ memory });
  });

  // 更新回忆字段。
  app.patch('/api/memories/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = parse(idParamsSchema, request.params);
    const body = parse(updateSchema, request.body);

    const existing = await prisma.memory.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Memory not found.', 404);
    }

    const memory = await prisma.memory.update({
      where: { id: existing.id },
      data: {
        title: body.title,
        content: body.content,
        mood: body.mood,
        memoryDate: body.memoryDate ? new Date(body.memoryDate) : undefined,
        visibility: body.visibility,
        tags: body.tags !== undefined ? normalizeTags(body.tags) : undefined,
      },
    });

    return success({ memory });
  });

  // 软删除回忆：置 deletedAt，保留历史。
  app.delete('/api/memories/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = parse(idParamsSchema, request.params);

    const existing = await prisma.memory.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Memory not found.', 404);
    }

    await prisma.memory.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });

    return success({ id: existing.id });
  });
}
