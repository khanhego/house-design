/** Chuỗi giao diện tiếng Việt (02b §9). Phase 1 chỉ có tiếng Việt; gom vào đây để P3 thêm ngôn ngữ. */
export const vi = {
  common: {
    retry: 'Thử lại',
    loading: 'Đang tải…',
    error: 'Đã có lỗi, thử lại sau.',
    network: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
    forbidden: 'Bạn không có quyền xem trang này.',
    saved: 'Đã lưu',
    copyLink: 'Sao chép link',
    copied: 'Đã sao chép link',
    close: 'Đóng',
    cancel: 'Huỷ',
  },
  houseType: {
    apartment: 'Căn hộ',
    townhouse: 'Nhà phố',
    villa: 'Biệt thự',
    cottage: 'Nhà vườn',
  } as Record<string, string>,
  houseTypePlural: {
    all: 'Tất cả',
    apartment: 'Căn hộ',
    townhouse: 'Nhà phố',
    villa: 'Biệt thự',
    cottage: 'Nhà vườn',
  } as Record<string, string>,
}

const nf = new Intl.NumberFormat('vi-VN')
const nf2 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
export const fmtInt = (n: number) => nf.format(n)
export const fmtArea = (m2: number) => `${nf2.format(m2)} m²`
export const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
    : '—'
export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)) : '—'
