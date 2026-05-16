const ERROR_PATTERNS = [
  [/^Unterminated quoted string$/i, 'Chuỗi có dấu nháy chưa được đóng.'],
  [/^tv command arguments are required$/i, 'Thiếu tham số cho lệnh tv.'],
  [/^Unknown tv command error$/i, 'Lỗi lệnh tv không xác định.'],
  [/^Could not retrieve quote\. The chart may still be loading\.$/i, 'Không thể lấy báo giá. Chart có thể vẫn đang tải.'],
  [/^Could not extract OHLCV data\. The chart may still be loading\.$/i, 'Không thể lấy dữ liệu OHLCV. Chart có thể vẫn đang tải.'],
  [/^CDP connection failed after (\d+) attempts: (.+)$/i, 'Kết nối CDP thất bại sau $1 lần thử: $2'],
  [/^Unsupported detector mode: (.+)$/i, 'Chế độ detector chưa được hỗ trợ: $1'],
];

export function formatBooleanText(value, { truthy = 'Có', falsy = 'Không' } = {}) {
  return value ? truthy : falsy;
}

export function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return 'không rõ';

  return new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatUnixSeconds(seconds) {
  const numericValue = Number(seconds);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 'không rõ';
  return formatDateTime(numericValue * 1000);
}

export function localizeErrorMessage(message) {
  const text = String(message || '').trim();
  if (!text) return 'Lỗi không xác định.';

  for (const [pattern, replacement] of ERROR_PATTERNS) {
    if (pattern.test(text)) return text.replace(pattern, replacement);
  }

  return text
    .replace(/unknown error/gi, 'lỗi không xác định')
    .replace(/failed with HTTP/gi, 'trả về HTTP')
    .replace(/failed/gi, 'thất bại')
    .replace(/required/gi, 'bắt buộc');
}
