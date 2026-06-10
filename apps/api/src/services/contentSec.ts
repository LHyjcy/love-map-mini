/**
 * UGC 文本内容安全审核（微信审核硬要求）。
 * 调用微信 security.msgSecCheck（v2）。
 * - 未配置 WECHAT_APP_ID/SECRET 时直接放行（开发态 bypass）。
 * - 网络/解析异常一律「放行（fail-open）」，避免微信抖动阻断正常用户；绝不记录密钥/token。
 * 调用方使用 assertTextAllowed(text)：不通过时统一抛 AppError('CONTENT_REJECTED', ..., 400)。
 */
import { AppError } from '../utils/errors.js';

interface TokenCache {
  token: string;
  expireAt: number; // ms
}
let cache: TokenCache | null = null;

async function getAccessToken(): Promise<string | null> {
  const appid = process.env.WECHAT_APP_ID?.trim();
  const secret = process.env.WECHAT_APP_SECRET?.trim();
  if (!appid || !secret) return null;
  if (cache && cache.expireAt > Date.now()) return cache.token;
  try {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`;
    const res = await fetch(url);
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    cache = {
      token: data.access_token,
      expireAt: Date.now() + ((data.expires_in ?? 7200) - 60) * 1000,
    };
    return cache.token;
  } catch {
    return null;
  }
}

/** 文本审核。返回 { pass, reason? }。空串/未配置/异常均放行。 */
export async function checkText(text: string): Promise<{ pass: boolean; reason?: string }> {
  const content = (text ?? '').trim();
  if (content === '') return { pass: true };

  const token = await getAccessToken();
  if (!token) return { pass: true }; // 开发态 / 未配置微信：放行

  try {
    const res = await fetch(`https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 2, scene: 1, content }),
    });
    const data = (await res.json()) as {
      errcode?: number;
      result?: { suggest?: string };
    };
    // errcode!=0 视为不可判定 → fail-open 放行（避免误伤），但 risky 明确拦截。
    const suggest = data.result?.suggest;
    if (suggest === 'risky') {
      return { pass: false, reason: 'risky' };
    }
    return { pass: true };
  } catch {
    return { pass: true }; // fail-open
  }
}

/** 文本审核断言：审核不通过时统一抛 AppError('CONTENT_REJECTED', ..., 400)，通过时静默返回。 */
export async function assertTextAllowed(text: string): Promise<void> {
  const moderation = await checkText(text);
  if (!moderation.pass) {
    throw new AppError('CONTENT_REJECTED', '内容可能包含违规信息，请修改后再试', 400);
  }
}
