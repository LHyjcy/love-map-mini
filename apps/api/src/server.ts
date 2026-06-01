import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import { healthRoutes } from './routes/health.js';
import { errorHandler } from './utils/errors.js';
import { failure } from './utils/response.js';

export function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  // 统一错误响应
  app.setErrorHandler(errorHandler);

  // 统一 404 响应
  app.setNotFoundHandler((request, reply) => {
    reply
      .status(404)
      .send(failure('NOT_FOUND', `Route ${request.method} ${request.url} not found`));
  });

  // 路由注册（Phase 1 仅 health；业务路由在后续 Phase 加入）
  app.register(healthRoutes);

  return app;
}

async function start() {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';

  try {
    await app.listen({ port, host });
    app.log.info(`love-map-mini API listening on http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// 直接运行时启动服务（被 import 时不自动启动，便于测试）
const isMain = argv[1] ? import.meta.url === pathToFileURL(argv[1]).href : false;
if (isMain) {
  void start();
}
