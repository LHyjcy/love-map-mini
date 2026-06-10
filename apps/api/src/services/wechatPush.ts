/**
 * 微信订阅消息服务端下发（PRD 4.9 / Phase 后续）。
 *
 * 安全要求（CLAUDE.md）：
 * - AppId/AppSecret 仅从环境变量读取，绝不写死、绝不返回前端、绝不打印到日志。
 * - access_token 仅服务端短暂使用并内存缓存，绝不返回前端、绝不写入可读日志。
 * - 错误信息只透出微信 errcode/errmsg，绝不透出含密钥的 url。
 */
import { AppError } from '../utils/errors.js';

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const SEND_URL = 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send';

/** 内存缓存的 access_token；进程重启即失效，符合微信 token 短时复用建议。 */
let cachedToken: { token: string; expiresAt: number } | null = null;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
}

interface SubscribeSendResponse {
  errcode?: number;
  errmsg?: string;
  msgid?: number;
}

/**
 * 获取（并缓存）微信全局 access_token。
 * 未配置 AppId/AppSecret 时抛 501，调用方可据此在开发环境安全降级。
 */
export async function getAccessToken(): Promise<string> {
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;

  if (!appId || !appSecret) {
    throw new AppError(
      'WECHAT_NOT_CONFIGURED',
      'WeChat push is not configured on the server.',
      501
    );
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.token;
  }

  const url =
    `${TOKEN_URL}?grant_type=client_credential` +
    `&appid=${encodeURIComponent(appId)}` +
    `&secret=${encodeURIComponent(appSecret)}`;

  let payload: TokenResponse;
  try {
    const res = await fetch(url, { method: 'GET' });
    payload = (await res.json()) as TokenResponse;
  } catch {
    // 网络层失败：不泄露 url（含 secret）。
    throw new AppError('WECHAT_UPSTREAM_ERROR', 'Failed to reach WeChat service.', 502);
  }

  if (payload.errcode || !payload.access_token || !payload.expires_in) {
    throw new AppError(
      'WECHAT_UPSTREAM_ERROR',
      payload.errmsg || 'Failed to obtain WeChat access token.',
      502
    );
  }

  // 提前 60s 过期，避免临界点用到失效 token。
  cachedToken = {
    token: payload.access_token,
    expiresAt: now + (payload.expires_in - 60) * 1000,
  };

  return cachedToken.token;
}

/**
 * 下发一条订阅消息。
 * data 为模板字段映射（如 { thing1: { value: '...' } }）。
 * errcode!=0 抛 502，错误只含微信 errmsg，不含密钥。
 */
export async function sendSubscribeMessage(
  openid: string,
  templateId: string,
  data: Record<string, { value: string }>,
  page?: string
): Promise<SubscribeSendResponse> {
  const accessToken = await getAccessToken();

  const url = `${SEND_URL}?access_token=${encodeURIComponent(accessToken)}`;

  const body = {
    touser: openid,
    template_id: templateId,
    page,
    data,
  };

  let payload: SubscribeSendResponse;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    payload = (await res.json()) as SubscribeSendResponse;
  } catch {
    // 网络层失败：不泄露 url（含 access_token）。
    throw new AppError('WECHAT_UPSTREAM_ERROR', 'Failed to reach WeChat service.', 502);
  }

  if (payload.errcode) {
    throw new AppError(
      'WECHAT_PUSH_FAILED',
      payload.errmsg || 'WeChat subscribe message push failed.',
      502
    );
  }

  return payload;
}
