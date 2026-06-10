/**
 * 地点投票路由：情侣双方对共享地点投票（想去 want / 一般 meh / 不想去 no）。
 * 所有接口要求登录，并基于当前 active 情侣关系按 coupleId 做越权隔离。
 * 投票前先校验地点确实属于当前情侣（且未软删除），否则 404 PLACE_NOT_FOUND。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireActiveCouple } from '../utils/couple.js';
import { AppError } from '../utils/errors.js';
import { success } from '../utils/response.js';
import { parse } from '../utils/validation.js';

const voteSchema = z.object({
  vote: z.enum(['want', 'meh', 'no']),
});

type VoteRow = { userId: string; vote: string };

/** 按 want/meh/no 汇总票数，并标记当前用户自己的投票（无则为 null）。 */
function buildTally(rows: VoteRow[], userId: string) {
  const tally = {
    want: 0,
    meh: 0,
    no: 0,
    mine: null as string | null,
  };
  for (const row of rows) {
    if (row.vote === 'want') tally.want += 1;
    else if (row.vote === 'meh') tally.meh += 1;
    else if (row.vote === 'no') tally.no += 1;
    if (row.userId === userId) tally.mine = row.vote;
  }
  return tally;
}

export async function placeVoteRoutes(app: FastifyInstance): Promise<void> {
  // 对某个地点投票（或改票）。先校验地点归属当前情侣，再 upsert 当前用户的投票。
  app.post('/api/places/:id/vote', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };
    const body = parse(voteSchema, request.body);

    const place = await prisma.place.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!place) {
      throw new AppError('PLACE_NOT_FOUND', 'Place not found.', 404);
    }

    await prisma.placeVote.upsert({
      where: { placeId_userId: { placeId: id, userId } },
      create: { coupleId: couple.id, placeId: id, userId, vote: body.vote },
      update: { vote: body.vote },
    });

    const rows = await prisma.placeVote.findMany({
      where: { coupleId: couple.id, placeId: id },
      select: { userId: true, vote: true },
    });

    return success({ tally: buildTally(rows, userId) });
  });

  // 读取某个地点的投票汇总。越权或不存在均返回 404。
  app.get('/api/places/:id/votes', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);
    const { id } = request.params as { id: string };

    const place = await prisma.place.findFirst({
      where: { id, coupleId: couple.id, deletedAt: null },
    });
    if (!place) {
      throw new AppError('PLACE_NOT_FOUND', 'Place not found.', 404);
    }

    const rows = await prisma.placeVote.findMany({
      where: { coupleId: couple.id, placeId: id },
      select: { userId: true, vote: true },
    });

    return success({ tally: buildTally(rows, userId) });
  });
}
