/**
 * 情侣邀请码生成。使用 crypto.randomInt 而非 Math.random，避免可预测。
 * 6 位数字，前导零补齐。唯一性由数据库唯一约束 + 调用方重试保证。
 */
import { randomInt } from 'node:crypto';

export function generateInviteCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}
