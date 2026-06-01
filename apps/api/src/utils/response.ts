/**
 * 统一 API 响应工具。
 * 全项目所有接口都应使用以下结构，保持成功/错误格式一致。
 */

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

export function success<T>(data: T): SuccessResponse<T> {
  return { success: true, data };
}

export function failure(code: string, message: string): ErrorResponse {
  return { success: false, error: { code, message } };
}
