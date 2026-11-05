// Từ "bậy" trong khung bình luận: lấy theo danh sách của chùa online (bỏ phần chủ chùa thêm theo ý riêng).
// Tin có các từ này bị che chữ, người gõ bị sét đánh. Không phân biệt hoa thường, phải gõ đúng dấu;
// thêm cả bản không dấu nếu muốn chặn. Chỉ bắt nguyên từ/cụm từ, nên "mẹ" không bắt nhầm trong "mẹt".
// Muốn sửa: mở js/tubay.js trên GitHub → bút chì → sửa → Commit changes.
export const TU_BAY = [
  // chửi tục, viết tắt
  'đm', 'dm', 'đmm', 'dmm', 'đcm', 'dcm', 'đkm', 'vcl', 'vkl', 'vcđ', 'clm', 'cmm', 'fuck', 'shit', 'lol',
  'địt', 'đụ', 'đụ má', 'đồ má', 'đờ mờ', 'lồn', 'cặc', 'buồi', 'đĩ', 'óc chó', 'mặt l', 'đồ mặt l', 'chó dại', 'tâm hồn chó dại',
  // từ đệm, phủ định mạnh
  'đéo', 'đ,éo', 'đ.éo', 'đéo thèm', 'đéo biết', 'đéo chịu được', 'vãi', 'vãi lờ', 'vãi l', 'vãi lồn', 'con mẹ nó',
  // lôi bố mẹ, dòng họ
  'mẹ', 'mẹ mày', 'bố mày', 'cụ nội mày', 'mọa',
  // miền Trung
  'cha bay', 'cha bay chơ', 'cha mi', 'trốc cha mi', 'trốc tru', 'quẹt khu', 'đồ quẹt khu', 'đồ đít',
  // miền Nam
  'xạo ke', 'xạo sự', 'bá láp', 'bá xàm', 'ba xàm', 'ba xí', 'rảnh háng', 'âm binh', 'đồ âm binh',
];

const norm = (w) => String(w).normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');
const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// cụm dài xét trước để che trọn cả cụm ("con mẹ nó" trước "mẹ")
const LIST = [...new Set(TU_BAY.map(norm).filter(Boolean))].sort((a, b) => b.length - a.length);
const RES = LIST.map((w) => new RegExp(`(^|[^\\p{L}\\p{N}])(${escRe(w).replace(/ /g, '\\s+')})(?=$|[^\\p{L}\\p{N}])`, 'giu'));

/** Che các từ bậy bằng dấu *. Trả { hit, out }. */
export function locBay(text) {
  let hit = false, out = String(text).normalize('NFC');
  for (const re of RES) {
    re.lastIndex = 0;
    out = out.replace(re, (m0, pre, word) => { hit = true; return pre + '*'.repeat([...word].length); });
  }
  return { hit, out };
}
