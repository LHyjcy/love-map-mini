# scripts

Helper scripts for love-map-mini.

## verify-cos.mjs

Standalone connectivity check for Tencent Cloud COS direct upload.

It uses the exact same COS Signature V5 (HMAC-SHA1) presign algorithm as
`apps/api/src/services/storage.ts` (`cosPresignedPutUrl`) and performs a full
round trip against a real bucket:

1. Presign a `PUT` URL and upload a tiny test object (`uploads/_verify_<random>.txt`).
2. Presign a `GET` URL, download the object, and confirm the body matches.
3. Print the resulting `fileUrl` on success, or the failing HTTP status + response on error.

No external dependencies: only the built-in `node:crypto` and the global `fetch`
(requires Node 20+ / 24).

### Run

```sh
node --env-file=apps/api/.env scripts/verify-cos.mjs
```

### Required environment variables

| Variable | Notes |
| --- | --- |
| `STORAGE_PROVIDER` | must be `cos` |
| `STORAGE_REGION` | e.g. `ap-guangzhou` |
| `STORAGE_BUCKET` | includes APPID, e.g. `myapp-1250000000` |
| `STORAGE_ACCESS_KEY_ID` | Tencent Cloud SecretId |
| `STORAGE_ACCESS_KEY_SECRET` | Tencent Cloud SecretKey |
| `STORAGE_PUBLIC_BASE_URL` | optional custom access domain |

If `STORAGE_PROVIDER` is not `cos` or any required value is missing, the script
prints a clear message and exits with code 1.

### Note on CORS

This script validates the **server-side** presigned `PUT`/`GET` path. The
miniprogram client (browser/`wx.uploadFile`) additionally requires the bucket's
**CORS** rules to be configured in the COS console; that is not (and cannot be)
checked here, since server-side PUT is not subject to CORS.
