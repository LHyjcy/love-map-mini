/**
 * 鉴权插件：基于 @fastify/jwt 的登录态校验。
 * - registerAuth 必须在注册业务路由之前调用：先同步 decorate('authenticate')，再注册 jwt。
 * - 业务路由通过 { preHandler: [app.authenticate] } 强制要求登录。
 */
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { AppError } from '../utils/errors.js';

export interface AuthTokenPayload {
  sub: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthTokenPayload;
    user: AuthTokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authenticateHandler(request: FastifyRequest, _reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    throw new AppError('UNAUTHORIZED', 'Authentication required or token invalid.', 401);
  }

  // 注销后令牌立即失效：JWT 只校验签名，账号软删除后令牌仍在有效期内，
  // 故每次请求用一次主键查询确认用户存在且未被软删除（开销极小）。
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: { deletedAt: true },
  });
  if (!user || user.deletedAt) {
    throw new AppError('UNAUTHORIZED', 'Authentication required or token invalid.', 401);
  }
}

/** 同步注册鉴权能力。decorate 先于路由注册执行，保证 app.authenticate 可用。 */
export function registerAuth(app: FastifyInstance): void {
  app.decorate('authenticate', authenticateHandler);
  void app.register(fastifyJwt, { secret: config.jwtSecret });
}

/** 签发登录令牌。app.jwt 在 ready 后可用（请求处理阶段调用，安全）。 */
export function signToken(app: FastifyInstance, payload: AuthTokenPayload): string {
  return app.jwt.sign(payload, { expiresIn: config.jwtExpiresIn });
}
