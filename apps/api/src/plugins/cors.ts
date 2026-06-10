import type { FastifyInstance } from 'fastify';

/**
 * 极简手写 CORS（不依赖 @fastify/cors）。
 *
 * 目的：仅让已部署的静态 web-share 页面（不同源）能在浏览器中调用公开只读接口
 *       GET /api/public-map/:shareCode。
 *
 * 说明：
 * - CORS 头只对 /api/public-map/ 路径下发；其余私有接口不下发任何 CORS 头，
 *   保留浏览器同源策略这一层防护（公开接口为只读 GET，不需要 Authorization）。
 * - 公开接口不携带凭据，放行任意源是可接受的；默认 Access-Control-Allow-Origin 为 '*'。
 * - 生产环境应将 PUBLIC_WEB_ORIGIN 设置为 web-share 的确切部署域名
 *   （如 https://share.example.com），收紧允许的来源。
 * - 公开路径的预检请求（OPTIONS）在本 onRequest 钩子内直接以 204 结束，
 *   不会落到 setNotFoundHandler 的 404 处理上。
 */
export function registerCors(app: FastifyInstance): void {
  const allowOrigin = process.env.PUBLIC_WEB_ORIGIN || '*';

  app.addHook('onRequest', (request, reply, done) => {
    // 仅对公开地图接口下发 CORS 头，私有接口保持同源限制
    const path = request.url.split('?')[0];
    if (!path.startsWith('/api/public-map/')) {
      done();
      return;
    }

    reply.header('Access-Control-Allow-Origin', allowOrigin);
    reply.header('Access-Control-Allow-Methods', 'GET,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    reply.header('Access-Control-Max-Age', '86400');

    // 预检请求：设置完头部后直接结束，避免命中 404 处理器
    if (request.method === 'OPTIONS') {
      reply.code(204).send();
      return;
    }

    done();
  });
}
