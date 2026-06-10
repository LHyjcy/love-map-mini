/**
 * verify-cos.mjs — 腾讯云 COS 直传连通性校验脚本（standalone，无外部依赖）。
 *
 * 目的：用真实的 bucket / 密钥 / region，做一次完整的
 *   预签名 PUT  ->  GET  回环验证，确认服务端签名直传是否可用。
 *
 * 仅依赖 Node 内置的 node:crypto 与全局 fetch（Node 20+/24）。
 * 预签名算法与 apps/api/src/services/storage.ts 的 cosPresignedPutUrl 完全一致
 * （COS Signature V5 / HMAC-SHA1），此处仅把 method 参数化以便同时签 put 和 get。
 *
 * 运行方式（Node 20+/24）：
 *   node --env-file=apps/api/.env scripts/verify-cos.mjs
 *
 * 需要的环境变量：
 *   STORAGE_PROVIDER         必须为 'cos'
 *   STORAGE_REGION           如 ap-guangzhou
 *   STORAGE_BUCKET           已含 APPID，如 myapp-1250000000
 *   STORAGE_ACCESS_KEY_ID    腾讯云 SecretId
 *   STORAGE_ACCESS_KEY_SECRET 腾讯云 SecretKey
 *   STORAGE_PUBLIC_BASE_URL  （可选）自定义访问域名
 *
 * 注意：本脚本验证的是“服务端用预签名 URL 直接 PUT/GET”这条链路。
 *       小程序客户端（wx.uploadFile / 浏览器 fetch）额外还需要在 COS 控制台
 *       为该 bucket 配置 CORS 跨域规则，否则客户端直传会被浏览器/小程序拦截，
 *       本脚本无法替你验证 CORS（服务端 PUT 不受 CORS 约束）。
 */
import { randomBytes, createHmac, createHash } from 'node:crypto';

function hmacSha1Hex(key, msg) {
  return createHmac('sha1', key).update(msg).digest('hex');
}

function sha1Hex(msg) {
  return createHash('sha1').update(msg).digest('hex');
}

/**
 * 生成 COS（腾讯云）的预签名 URL，使用 COS Signature V5（HMAC-SHA1）。
 * 与 storage.ts 的 cosPresignedPutUrl 算法完全一致，仅把 method 参数化
 * （storage.ts 中固定为 'put'，这里允许传 'get' 以验证回读）。
 * bucket 已包含 APPID（如 myapp-1250000000）。
 */
function cosPresignedUrl(method, objectKey, region, bucket, secretId, secretKey) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 600; // 10 分钟有效期
  const keyTime = `${now};${exp}`;
  const signKey = hmacSha1Hex(secretKey, keyTime);
  // 保留斜杠，对每个分段做 URL 编码
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  const uriPath = '/' + encodedKey;
  const m = method.toLowerCase();
  const httpString = `${m}\n${uriPath}\n\n\n`; // method(lowercase)\nuri\nquery(empty)\nheaders(empty)\n
  const sha1HttpString = sha1Hex(httpString);
  const stringToSign = `sha1\n${keyTime}\n${sha1HttpString}\n`;
  const signature = hmacSha1Hex(signKey, stringToSign);

  const host = `${bucket}.cos.${region}.myqcloud.com`;
  const query =
    `q-sign-algorithm=sha1&q-ak=${secretId}` +
    `&q-sign-time=${keyTime}&q-key-time=${keyTime}` +
    `&q-header-list=&q-url-param-list=&q-signature=${signature}`;
  const url = `https://${host}/${encodedKey}?${query}`;
  return { url, host };
}

/** 截断响应体，避免日志过长。 */
function truncate(s, n = 500) {
  if (typeof s !== 'string') return String(s);
  return s.length > n ? s.slice(0, n) + `…(truncated, ${s.length} chars)` : s;
}

async function main() {
  const provider = process.env.STORAGE_PROVIDER;
  const region = process.env.STORAGE_REGION;
  const bucket = process.env.STORAGE_BUCKET;
  const secretId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretKey = process.env.STORAGE_ACCESS_KEY_SECRET;
  const publicBase = (process.env.STORAGE_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');

  // 1) 校验 provider 与必填项
  if (provider !== 'cos') {
    console.error(
      `❌ STORAGE_PROVIDER 必须为 'cos'（当前为 '${provider ?? '(未设置)'}'）。\n` +
        '   本脚本仅校验腾讯云 COS。'
    );
    printUsage();
    process.exit(1);
  }

  const missing = [];
  if (!region) missing.push('STORAGE_REGION');
  if (!bucket) missing.push('STORAGE_BUCKET');
  if (!secretId) missing.push('STORAGE_ACCESS_KEY_ID');
  if (!secretKey) missing.push('STORAGE_ACCESS_KEY_SECRET');
  if (missing.length) {
    console.error(`❌ 缺少必填环境变量: ${missing.join(', ')}。`);
    printUsage();
    process.exit(1);
  }

  // 2) 构造测试对象 key
  const objectKey = `uploads/_verify_${randomBytes(8).toString('hex')}.txt`;
  const body = 'love-map-mini cos verify';
  const fileUrl = publicBase
    ? `${publicBase}/${objectKey}`
    : `https://${bucket}.cos.${region}.myqcloud.com/${objectKey}`;

  console.log('🔧 COS 配置:');
  console.log(`   region      = ${region}`);
  console.log(`   bucket      = ${bucket}`);
  console.log(`   objectKey   = ${objectKey}`);
  console.log(`   publicBase  = ${publicBase || '(none, 使用默认 cos 域名)'}`);
  console.log('');

  // 3) 预签名 PUT 并上传
  const { url: putUrl, host } = cosPresignedUrl(
    'put',
    objectKey,
    region,
    bucket,
    secretId,
    secretKey
  );

  console.log(`⬆️  PUT https://${host}/${objectKey}`);
  let putRes;
  try {
    putRes = await fetch(putUrl, {
      method: 'PUT',
      body,
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (err) {
    console.error(`❌ PUT 请求异常: ${err?.message ?? err}`);
    process.exit(1);
  }
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '');
    console.error(`❌ PUT 失败: HTTP ${putRes.status} ${putRes.statusText}`);
    console.error(`   响应: ${truncate(text)}`);
    process.exit(1);
  }
  console.log(`   ✅ PUT 成功 (HTTP ${putRes.status})`);

  // 4) 预签名 GET 回读并比对内容
  const { url: getUrl } = cosPresignedUrl(
    'get',
    objectKey,
    region,
    bucket,
    secretId,
    secretKey
  );

  console.log(`⬇️  GET https://${host}/${objectKey}`);
  let getRes;
  try {
    getRes = await fetch(getUrl, { method: 'GET' });
  } catch (err) {
    console.error(`❌ GET 请求异常: ${err?.message ?? err}`);
    process.exit(1);
  }
  if (!getRes.ok) {
    const text = await getRes.text().catch(() => '');
    console.error(`❌ GET 失败: HTTP ${getRes.status} ${getRes.statusText}`);
    console.error(`   响应: ${truncate(text)}`);
    process.exit(1);
  }
  const got = await getRes.text();
  if (got !== body) {
    console.error('❌ GET 内容与上传内容不一致。');
    console.error(`   期望: ${truncate(body)}`);
    console.error(`   实际: ${truncate(got)}`);
    process.exit(1);
  }
  console.log(`   ✅ GET 成功且内容一致 (HTTP ${getRes.status})`);

  // 5) 成功
  console.log('');
  console.log('✅ COS 直传回环验证通过 (presign → PUT → GET)。');
  console.log(`   fileUrl = ${fileUrl}`);
  console.log('');
  console.log(
    'ℹ️  说明: 本脚本验证的是服务端用预签名 URL 直接 PUT/GET。\n' +
      '   小程序客户端直传还需在 COS 控制台为该 bucket 配置 CORS 跨域规则。'
  );
}

function printUsage() {
  console.error('');
  console.error('运行方式 (Node 20+/24):');
  console.error('  node --env-file=apps/api/.env scripts/verify-cos.mjs');
  console.error('需要的环境变量: STORAGE_PROVIDER=cos, STORAGE_REGION, STORAGE_BUCKET,');
  console.error('  STORAGE_ACCESS_KEY_ID, STORAGE_ACCESS_KEY_SECRET, [STORAGE_PUBLIC_BASE_URL]');
}

main().catch((err) => {
  console.error(`❌ 未预期错误: ${err?.stack ?? err}`);
  process.exit(1);
});
