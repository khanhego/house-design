/* Kịch bản chụp & nhập cho tour ảnh thật (item 02, SRS §11, FR-12.13). Dùng chung cho A7 và PDF gửi người chụp. */

export interface GuideSection {
  title: string
  items: string[]
  /** đánh số thay vì gạch đầu dòng */
  ordered?: boolean
}

export const GUIDE_TITLE = 'Kịch bản chụp ảnh tour "Ảnh thật"'
export const GUIDE_INTRO =
  'Người xem sẽ bấm "Tiếp" để đi từ ảnh này sang ảnh sau như đang bước trong nhà. Ảnh chụp đúng kịch bản thì chuyển cảnh mượt và tự nhiên.'

export const GUIDE: GuideSection[] = [
  {
    title: 'Thiết bị',
    items: [
      'Điện thoại đời 2020 trở về sau hoặc máy ảnh. Chụp NGANG.',
      'Dùng ống kính chính (1×). Ống siêu rộng 0,5× chỉ dùng cho phòng nhỏ hơn 8 m².',
      'Bật HDR. Nên dùng gậy hoặc chân máy để ảnh không rung, không nghiêng.',
      'iPhone: Cài đặt → Camera → Định dạng → "Tương thích nhất" để ảnh lưu dạng JPG.',
    ],
  },
  {
    title: 'Chuẩn bị nhà',
    items: [
      'Bật hết đèn, kéo rèm, dọn đồ cá nhân, đóng nắp bồn cầu, tắt TV.',
      'Không để người hoặc thú cưng trong khung hình.',
      'Chụp trong cùng một buổi (10–15 h hoặc 15–17 h) để ánh sáng các ảnh đồng đều.',
    ],
  },
  {
    title: 'Quy tắc đặt máy',
    ordered: true,
    items: [
      'Cầm máy ở tầm mắt, khoảng 1,5 m. Giữ máy thẳng đứng: đường dọc của tường phải thẳng; không ngửa, không cúi.',
      'Mỗi ảnh nhìn theo hướng sẽ đi tiếp, như đang đi lần lượt qua các phòng rồi bước ra ngoài.',
      'Quy tắc nối cảnh: chỗ đứng chụp ảnh sau phải NHÌN THẤY ĐƯỢC trong ảnh trước, cách 2–4 m. Không quay quá 90° giữa hai ảnh liền nhau; muốn đổi hướng mạnh thì chụp thêm một ảnh trung gian.',
      'Qua cửa: chụp 1 ảnh đứng trước cửa nhìn vào, rồi 1 ảnh đứng trong phòng cách cửa khoảng 1 m nhìn vào giữa phòng.',
      'Cầu thang: 1 ảnh chân thang nhìn lên, 1 ảnh giữa thang, 1 ảnh đầu thang nhìn ra sảnh tầng.',
    ],
  },
  {
    title: 'Tuyến đi gợi ý',
    items: [
      'Đi từ TRONG ra NGOÀI, qua lần lượt từng phòng. Chương 1 · Bên trong: sảnh (đứng sau cửa chính nhìn vào) → phòng khách → bếp, ăn → WC tầng 1 → cầu thang → sảnh tầng 2 → mỗi phòng ngủ 2 ảnh (từ cửa, và từ góc đối diện nhìn ra cửa sổ) → WC.',
      'Chương 2 · Sân vườn & hồ bơi: ảnh đứng trong nhìn ra cửa dẫn ra sân → bước ra hiên / ban công / sân vườn / hồ bơi.',
      'Chương 3 · Ngoài nhà: quay lại nhìn ngôi nhà từ sân → mặt tiền (đứng bên kia đường) → cảnh kết là toàn cảnh đẹp nhất của căn nhà (nên chụp lúc chạng vạng khi đã bật đèn).',
      'Mỗi ảnh nhớ chấm "điểm đi tiếp" vào đúng chỗ ảnh sau đứng chụp (cửa, lối đi): người xem thấy chấm này và chuyển cảnh sẽ "bước" về hướng đó.',
    ],
  },
  {
    title: 'Số lượng',
    items: ['Căn hộ: 12–25 ảnh.', 'Nhà phố: 20–40 ảnh.', 'Biệt thự: 30–60 ảnh (tối đa 60).'],
  },
  {
    title: 'Đặt tên tệp',
    items: [
      'Số đầu là thứ tự đi, phần sau là tên cảnh: 01-sanh.jpg, 02-phong-khach.jpg, 03-bep.jpg, … 18-ho-boi.jpg, 19-mat-tien.jpg…',
      'Hệ thống tự xếp theo số và tự lấy tên cảnh (có dấu) từ tên tệp. Không đặt tên được thì hệ thống xếp theo giờ chụp.',
    ],
  },
  {
    title: 'Không chụp',
    items: ['Gương đối diện máy (lộ người chụp).', 'Giấy tờ, ảnh gia đình, biển số xe.', 'Ảnh dọc.'],
  },
]

/** Mẫu câu lệnh cho công cụ AI tạo clip chuyển cảnh (phương án C): dán cùng 2 ảnh — ảnh đầu = cảnh n, ảnh cuối = cảnh n+1. */
export const AI_CLIP_PROMPT =
  'Smooth cinematic forward camera move at eye level (1.5 m), steadicam, from the first frame to the last frame, walking naturally through the space toward the doorway. Keep every wall, window, furniture item and material exactly as in the two frames; do not add or remove objects; no people; natural daylight; 5 seconds; 16:9.'

/** PDF A4 dọc gửi người chụp. */
export const exportGuidePdf = async () => {
  const { jsPDF } = await import('jspdf')
  const { registerPdfFonts, PDF_FONT } = await import('../lib/pdfFonts.ts')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  await registerPdfFonts(doc)
  const W = 210
  const M = 18
  let y = 22
  const line = (text: string, size: number, bold = false, indent = 0, gap = 1.6) => {
    doc.setFont(PDF_FONT, bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    const rows = doc.splitTextToSize(text, W - 2 * M - indent) as string[]
    for (const r of rows) {
      if (y > 282) (doc.addPage(), (y = 20))
      doc.text(r, M + indent, y)
      y += size * 0.45
    }
    y += gap
  }
  line(GUIDE_TITLE, 17, true, 0, 3)
  line(GUIDE_INTRO, 10.5, false, 0, 4)
  for (const s of GUIDE) {
    line(s.title, 12.5, true, 0, 1.5)
    s.items.forEach((it, i) => line(`${s.ordered ? `${i + 1}.` : '•'} ${it}`, 10.5, false, 3))
    y += 2
  }
  line('Câu lệnh mẫu cho công cụ AI tạo clip chuyển cảnh (Higgsfield, Kling…)', 12.5, true, 0, 1.5)
  line('Dán cùng 2 ảnh liên tiếp: ảnh đầu = cảnh trước, ảnh cuối = cảnh sau. Xem hết clip trước khi dùng — AI có thể thêm chi tiết không có thật.', 10.5, false, 0, 2)
  line(AI_CLIP_PROMPT, 10, false, 3)
  doc.save('kich-ban-chup-tour-anh-that.pdf')
}
