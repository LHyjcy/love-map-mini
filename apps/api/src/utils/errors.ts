/**
 * 应用级错误类型与统一错误处理。
 * 业务模块抛出 AppError，由 Fastify errorHandler 转成统一错误响应。
 */
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
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

/** Fastify setErrorHandler 入口 */
export function errorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply
) {
  return registerErrorHandler(reply, error);
}
