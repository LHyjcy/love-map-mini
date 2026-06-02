/**
 * 微信小程序登录服务（Phase 11）。
 * 用 wx.login 拿到的临时 code 调 code2session 换取 openid/unionid/session_key。
 *
 * 安全要求（CLAUDE.md）：
 * - AppSecret 仅从环境变量读取，绝不写死、绝不返回前端、绝不打印到日志。
 * - session_key 仅服务端短暂使用，绝不返回前端、绝不持久化到可读日志。
 */
import { config } from '../config.js';
import { AppError } from '../utils/errors.js';

const CODE2SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';

export interface WechatSession {
  openid: string;
  unionid?: string;
  sessionKey: string;
}

/** 用临时 code 换取会话信息。失败抛 AppError，错误信息不含密钥。 */
export async function code2session(code: string): Promise<WechatSession> {
  if (!config.wechatConfigured) {
    throw new AppError(
      'WECHAT_NOT_CONFIGURED',
      'WeChat login is not configured on the server.',
      501
    );
  }

  const url =
    `${CODE2SESSION_URL}?appid=${encodeURIComponent(config.wechatAppId)}` +
    `&secret=${encodeURIComponent(config.wechatAppSecret)}` +
    `&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;

  let payload: {
    openid?: string;
    unionid?: string;
    session_key?: string;
    errcode?: number;
    errmsg?: string;
  };

  try {
    const res = await fetch(url, { method: 'GET' });
    payload = (await res.json()) as typeof payload;
  } catch {
    // 网络层失败：不泄露 url（含 secret）。
    throw new AppError('WECHAT_UPSTREAM_ERROR', 'Failed to reach WeChat service.', 502);
  }

  if (payload.errcode || !payload.openid || !payload.session_key) {
    // 仅透出微信的 errcode，不透出 url/secret。
    const code = payload.errcode ? `WECHAT_${payload.errcode}` : 'WECHAT_LOGIN_FAILED';
    throw new AppError(code, 'WeChat login failed. Please try again.', 401);
  }

  return {
    openid: payload.openid,
    unionid: payload.unionid,
    sessionKey: payload.session_key,
  };
}
