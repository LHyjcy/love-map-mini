/**
 * @love-map-mini/shared
 * 跨端共享的类型、枚举与校验。Phase 1 仅占位，随后续 Phase 补充。
 */

export const PROJECT_NAME = 'love-map-mini';

// 统一 API 响应类型（与 apps/api/src/utils/response.ts 保持一致）
export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: { code: string; message: string };
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;
