/**
 * 应用级错误类型与统一错误处理。
 * 业务模块抛出 AppError，由 Fastify errorHandler 转成统一错误响应。
 */
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { failure } from './response.js';

export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function registerErrorHandler(reply: FastifyReply, error: FastifyError | AppError) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send(failure(error.code, error.message));
  }

  const statusCode = (error as FastifyError).statusCode ?? 500;
  const code = statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
  const message =
    statusCode >= 500 ? 'Internal server error' : error.message || 'Bad request';
  return reply.status(statusCode).send(failure(code, message));
}

/**
 * 将服务器级错误（statusCode >= 500）异步落库到 ErrorLog。
 * 即发即忘：绝不阻塞响应，绝不抛出。
 */
function logServerError(request: FastifyRequest, error: FastifyError | AppError) {
  try {
    const statusCode =
      error instanceof AppError ? error.statusCode : (error.statusCode ?? 500);
    if (statusCode < 500) {
      return;
    }

    const code = error instanceof AppError ? error.code : null;
    const rawMessage = typeof error.message === 'string' ? error.message : null;
    const message = rawMessage ? rawMessage.slice(0, 500) : null;
    const userId =
      (request.user as { sub?: string } | undefined)?.sub ?? null;

    // 只落库路径部分：查询串可能含 WS 鉴权令牌、上传签名等可重放凭据（令牌/签名不落库）
    const [path] = request.url.split('?');
    const url = request.url.includes('?') ? `${path}?[redacted]` : path;

    void prisma.errorLog
      .create({
        data: {
          method: request.method,
          url,
          statusCode,
          code,
          message,
          userId,
        },
      })
      .catch(() => {});
  } catch {
    // 日志记录失败绝不影响响应
  }
}

/** Fastify setErrorHandler 入口 */
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  logServerError(request, error);
  return registerErrorHandler(reply, error);
}
