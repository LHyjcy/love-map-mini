/**
 * 情侣关系查询工具。后续 Phase 的所有情侣资源接口都应先取得当前 active 关系，
 * 再用其 coupleId 做越权隔离。
 */
import { prisma } from '../db.js';
import { AppError } from './errors.js';

/** 取当前用户的生效（active）情侣关系；无则返回 null。 */
export function getActiveCoupleForUser(userId: string) {
  return prisma.couple.findFirst({
    where: {
      status: 'active',
      OR: [{ userAId: userId }, { userBId: userId }],
    },
  });
}

/** 取当前用户的生效情侣关系；无则抛错。 */
export async function requireActiveCouple(userId: string) {
  const couple = await getActiveCoupleForUser(userId);
  if (!couple) {
    throw new AppError('NO_ACTIVE_COUPLE', 'You are not bound to a partner yet.', 404);
  }
  return couple;
}
