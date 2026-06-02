/**
 * 统一的 Zod 校验入口。所有写接口都应先用 parse 校验输入，
 * 校验失败抛出 AppError（VALIDATION_ERROR），由 errorHandler 转成统一错误响应。
 */
import type { ZodType } from 'zod';
import { AppError } from './errors.js';

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join('.') || 'body';
    const message = first?.message ?? 'invalid input';
    throw new AppError('VALIDATION_ERROR', `${path}: ${message}`, 400);
  }
  return result.data;
}
