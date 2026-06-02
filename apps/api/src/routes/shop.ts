/**
 * 积分商城路由：商品的增删改查，以及用积分兑换商品、查看背包、核销/取消兑换。
 * 所有接口都要求登录，并基于当前 active 情侣关系做越权隔离（coupleId）。
 * 兑换与取消都涉及积分流水变更，统一在事务内完成：
 *   - 兑换：校验库存与余额 → 扣库存 → 记一条负积分流水（redeem）→ 生成 unused 兑换记录。
 *   - 取消：仅 unused 可取消 → 置为 cancelled → 退回积分（正流水）并回补库存。
 * 余额始终通过 getBalance（积分流水求和）读取，不直接改用户字段。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { AppError } from '../utils/errors.js';
import { getBalance, recordPoints } from '../utils/points.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const itemStatuses = ['active', 'inactive'] as const;

const createSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().optional(),
  pricePoints: z.number().int().min(0),
  stock: z.number().int().min(0),
  status: z.enum(itemStatuses).optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  pricePoints: z.number().int().min(0).optional(),
  stock: z.number().int().min(0).optional(),
  status: z.enum(itemStatuses).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(itemStatuses).optional(),
});

export async function shopRoutes(app: FastifyInstance): Promise<void> {
  // 创建商品：创建者发起，归属当前情侣关系。
  app.post('/api/shop/items', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const body = parse(createSchema, request.body);

    const item = await prisma.shopItem.create({
      data: {
        coupleId: couple.id,
        creatorId: userId,
        title: body.title,
        description: body.description,
        pricePoints: body.pricePoints,
        stock: body.stock,
        status: body.status ?? 'active',
      },
    });

    return success({ item });
  });

  // 商品列表：仅当前情侣关系，支持按 status 过滤，按创建时间倒序。
  app.get('/api/shop/items', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const query = parse(listQuerySchema, request.query);

    const items = await prisma.shopItem.findMany({
      where: {
        coupleId: couple.id,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return success({ items });
  });

  // 商品详情：越权隔离，缺失返回 404。
  app.get('/api/shop/items/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };

    const item = await prisma.shopItem.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!item) {
      throw new AppError('NOT_FOUND', 'Shop item not found.', 404);
    }

    return success({ item });
  });

  // 更新商品：可改标题/描述/价格/库存/状态。越权隔离，缺失返回 404。
  app.patch('/api/shop/items/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };
    const body = parse(updateSchema, request.body);

    const item = await prisma.shopItem.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!item) {
      throw new AppError('NOT_FOUND', 'Shop item not found.', 404);
    }

    const updated = await prisma.shopItem.update({
      where: { id: item.id },
      data: {
        title: body.title,
        description: body.description,
        pricePoints: body.pricePoints,
        stock: body.stock,
        status: body.status,
      },
    });

    return success({ item: updated });
  });

  // 删除商品：软删除（deletedAt）。越权隔离，缺失返回 404。
  app.delete('/api/shop/items/:id', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };

    const item = await prisma.shopItem.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!item) {
      throw new AppError('NOT_FOUND', 'Shop item not found.', 404);
    }

    await prisma.shopItem.update({
      where: { id: item.id },
      data: { deletedAt: new Date() },
    });

    return success({ id: item.id });
  });

  // 兑换商品：用积分购买。事务内校验库存与余额，扣库存、记负积分流水、生成兑换记录。
  app.post('/api/shop/items/:id/redeem', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };

    const redemption = await prisma.$transaction(async (tx) => {
      const item = await tx.shopItem.findFirst({
        where: { id, coupleId: couple.id, deletedAt: null, status: 'active' },
      });
      if (!item) {
        throw new AppError('ITEM_UNAVAILABLE', 'Item not available.', 404);
      }
      if (item.stock <= 0) {
        throw new AppError('OUT_OF_STOCK', 'Item is out of stock.', 409);
      }

      const balance = await getBalance(couple.id, userId, tx);
      if (balance < item.pricePoints) {
        throw new AppError('INSUFFICIENT_POINTS', 'Not enough points.', 409);
      }

      await tx.shopItem.update({
        where: { id: item.id },
        data: { stock: { decrement: 1 } },
      });

      if (item.pricePoints > 0) {
        await recordPoints(
          {
            coupleId: couple.id,
            userId,
            sourceType: 'redeem',
            points: -item.pricePoints,
            sourceId: item.id,
            description: `Redeem: ${item.title}`,
          },
          tx
        );
      }

      return tx.redemption.create({
        data: {
          coupleId: couple.id,
          itemId: item.id,
          buyerId: userId,
          status: 'unused',
        },
      });
    });

    const balance = await getBalance(couple.id, userId);

    return success({ redemption, balance });
  });

  // 我的背包：当前情侣关系下、由我购买的兑换记录，按创建时间倒序。
  app.get('/api/shop/redemptions', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);

    const redemptions = await prisma.redemption.findMany({
      where: { coupleId: couple.id, buyerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    return success({ redemptions });
  });

  // 核销兑换：仅本人的 unused 记录可核销，置为 used 并记录核销时间。
  app.post(
    '/api/shop/redemptions/:id/use',
    { preHandler: [app.authenticate] },
    async (request) => {
      const userId = request.user.sub;
      const couple = await requireActiveCouple(userId);
      const { id } = request.params as { id: string };

      const redemption = await prisma.redemption.findFirst({
        where: { id, coupleId: couple.id, buyerId: userId },
      });
      if (!redemption) {
        throw new AppError('NOT_FOUND', 'Redemption not found.', 404);
      }
      if (redemption.status !== 'unused') {
        throw new AppError('REDEMPTION_NOT_USABLE', 'Redemption cannot be used.', 409);
      }

      const updated = await prisma.redemption.update({
        where: { id: redemption.id },
        data: { status: 'used', usedAt: new Date() },
      });

      return success({ redemption: updated });
    }
  );

  // 取消兑换：仅本人的 unused 记录可取消。事务内置为 cancelled，退回积分并回补库存。
  // 退款依据兑换时商品价格；商品可能已被软删除，仍按其 pricePoints 退款。
  app.post(
    '/api/shop/redemptions/:id/cancel',
    { preHandler: [app.authenticate] },
    async (request) => {
      const userId = request.user.sub;
      const couple = await requireActiveCouple(userId);
      const { id } = request.params as { id: string };

      const redemption = await prisma.redemption.findFirst({
        where: { id, coupleId: couple.id, buyerId: userId },
      });
      if (!redemption) {
        throw new AppError('NOT_FOUND', 'Redemption not found.', 404);
      }
      if (redemption.status !== 'unused') {
        throw new AppError('REDEMPTION_NOT_CANCELLABLE', 'Redemption cannot be cancelled.', 409);
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.redemption.update({
          where: { id: redemption.id },
          data: { status: 'cancelled' },
        });

        const item = await tx.shopItem.findUnique({ where: { id: redemption.itemId } });
        if (item && item.pricePoints > 0) {
          await recordPoints(
            {
              coupleId: couple.id,
              userId,
              sourceType: 'redeem',
              points: item.pricePoints,
              sourceId: item.id,
              description: `Refund: ${item.title}`,
            },
            tx
          );
          await tx.shopItem.update({
            where: { id: item.id },
            data: { stock: { increment: 1 } },
          });
        }

        return next;
      });

      return success({ redemption: updated });
    }
  );
}
