/** Lỗi nghiệp vụ → `{ error: { code, message, fields?, ...extra } }` (02 §6). */
export class AppError extends Error {
  readonly status: number
  readonly code: string
  readonly fields?: Record<string, string>
  readonly extra?: Record<string, unknown>

  constructor(status: number, code: string, message: string, opts: { fields?: Record<string, string>; extra?: Record<string, unknown> } = {}) {
    super(message)
    this.status = status
    this.code = code
    this.fields = opts.fields
    this.extra = opts.extra
  }
}

export const notFound = (what = 'Không tìm thấy') => new AppError(404, 'NOT_FOUND', what)
export const forbidden = (msg = 'Bạn không có quyền thực hiện thao tác này') => new AppError(403, 'FORBIDDEN', msg)
export const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập')
export const invalidState = (state: string) =>
  new AppError(409, 'INVALID_STATE', 'Thao tác không hợp với trạng thái hiện tại', { extra: { state } })
export const validation = (fields: Record<string, string>, message = 'Dữ liệu chưa hợp lệ') =>
  new AppError(400, 'VALIDATION_ERROR', message, { fields })
