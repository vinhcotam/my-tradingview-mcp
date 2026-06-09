import { spawn } from 'child_process';
import { basename, dirname, join, win32 } from 'path';
import { fileURLToPath } from 'url';
import { access } from 'fs/promises';
import { constants } from 'fs';
import { formatBooleanText, formatUnixSeconds, localizeErrorMessage } from './text.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(dirname(__dirname), 'cli', 'index.js');

/**
 * Extract filename from path, handling both Unix and Windows paths.
 * @param {string} filePath - File path (may contain \\ or /)
 * @returns {string} Filename without directory
 */
function extractFilename(filePath) {
  if (!filePath) return 'screenshot.png';
  // Try win32.basename first for Windows paths, fallback to posix
  const winName = win32.basename(filePath);
  const posixName = basename(filePath);
  // Return the shorter one (likely the actual filename, not full path)
  return winName.length < posixName.length ? winName : posixName;
}

export async function runTvCommand(args, env = process.env) {
  const command = Array.isArray(args) ? { args } : args;
  const cliArgs = command?.args;
  const stdin = command?.stdin;

  if (!Array.isArray(cliArgs) || cliArgs.length === 0) {
    throw new Error('Thiếu tham số cho lệnh tv.');
  }

  if (env.DOCKER_CONTAINER === '1' && cliArgs[0] === 'launch') {
    return {
      success: false,
      error: 'Không thể chạy tv launch từ Docker. Hãy mở TradingView trên máy host với --remote-debugging-port và trỏ TV_CDP_HOST tới máy đó.',
    };
  }

  try {
    const { stdout } = await executeCli(cliArgs, { env, stdin });
    return JSON.parse(stdout);
  } catch (err) {
    const stderr = err.stderr || '';
    const stdout = err.stdout || '';
    const payload = stderr || stdout;
    try {
      return JSON.parse(payload);
    } catch {
      return {
        success: false,
        error: localizeErrorMessage((payload || err.message || 'Unknown tv command error').trim()),
      };
    }
  }
}

export async function isReadableFile(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function formatTvResult(args, result) {
  const commandText = `tv ${args.join(' ')}`;
  const primaryCommand = args[0];

  if (!result?.success) {
    return truncateMessage([
      `Kết quả lệnh: ${commandText}`,
      'Trạng thái: thất bại',
      `Lỗi: ${localizeErrorMessage(result?.error)}`,
    ].join('\n'));
  }

  if (primaryCommand === 'status') return truncateMessage(formatStatusResult(commandText, result));
  if (primaryCommand === 'quote') return truncateMessage(formatQuoteResult(commandText, result));
  if (primaryCommand === 'values') return truncateMessage(formatValuesResult(commandText, result));
  if (primaryCommand === 'screenshot') return truncateMessage(formatScreenshotResult(commandText, result));
  if (primaryCommand === 'launch') return truncateMessage(formatLaunchResult(commandText, result));

  const payload = { ...result };
  delete payload.success;
  return truncateMessage([
    `Kết quả lệnh: ${commandText}`,
    'Trạng thái: thành công',
    payload && Object.keys(payload).length > 0
      ? `Dữ liệu kỹ thuật:\n${JSON.stringify(payload, null, 2)}`
      : 'Không có dữ liệu bổ sung.',
  ].join('\n\n'));
}

export function screenshotCaption(args, result) {
  const file = extractFilename(result?.file_path);
  return truncateMessage(`Ảnh chụp từ TradingView\nLệnh: tv ${args.join(' ')}\nTệp: ${file}`, 1024);
}

// Export for testing
export { formatStatusResult, formatQuoteResult };

export function truncateMessage(text, maxLength = 3800) {
  const value = String(text || '');
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 14)}\n\n...[cắt bớt]`;
}

function formatStatusResult(commandText, result) {
  return [
    'Trạng thái kết nối TradingView',
    `Lệnh: ${commandText}`,
    `Kết nối CDP: ${formatBooleanText(result.cdp_connected)}`,
    `Symbol: ${result.chart_symbol || 'không rõ'}`,
    `Khung thời gian: ${formatResolution(result.chart_resolution)}`,
    `URL chart: ${result.target_url || 'không rõ'}`,
    `Tiêu đề tab: ${result.target_title || 'không rõ'}`,
    `API khả dụng: ${formatBooleanText(result.api_available)}`,
  ].join('\n');
}

function formatQuoteResult(commandText, result) {
  return [
    'Báo giá hiện tại',
    `Lệnh: ${commandText}`,
    `Symbol: ${result.symbol || 'không rõ'}`,
    `Sàn: ${result.exchange || 'không rõ'}`,
    `Mô tả: ${result.description || 'không rõ'}`,
    `Loại: ${formatInstrumentType(result.type)}`,
    `Thời gian nến: ${formatUnixSeconds(result.time)}`,
    `Mở cửa: ${formatMaybeValue(result.open)}`,
    `Cao nhất: ${formatMaybeValue(result.high)}`,
    `Thấp nhất: ${formatMaybeValue(result.low)}`,
    `Đóng cửa: ${formatMaybeValue(result.close)}`,
    `Giá gần nhất: ${formatMaybeValue(result.last ?? result.close)}`,
    `Khối lượng: ${formatMaybeValue(result.volume)}`,
  ].join('\n');
}

function formatValuesResult(commandText, result) {
  const lines = [
    'Giá trị chỉ báo hiện tại',
    `Lệnh: ${commandText}`,
    `Số chỉ báo: ${result.study_count ?? 0}`,
  ];

  for (const study of result.studies || []) {
    lines.push('');
    lines.push(`Chỉ báo: ${study.name || 'không rõ'}`);
    for (const [key, value] of Object.entries(study.values || {})) {
      lines.push(`- ${key}: ${value}`);
    }
  }

  if ((result.studies || []).length === 0) {
    lines.push('');
    lines.push('Không có dữ liệu chỉ báo.');
  }

  return lines.join('\n');
}

function formatScreenshotResult(commandText, result) {
  return [
    'Ảnh chụp TradingView',
    `Lệnh: ${commandText}`,
    `Vùng chụp: ${result.region || 'không rõ'}`,
    `Tệp: ${result.file_path ? basename(result.file_path) : 'không rõ'}`,
    `Đường dẫn: ${result.file_path || 'không rõ'}`,
    `Dung lượng: ${formatMaybeValue(result.size_bytes)} byte`,
  ].join('\n');
}

function formatLaunchResult(commandText, result) {
  return [
    'Khởi động TradingView',
    `Lệnh: ${commandText}`,
    `Trạng thái: ${result.success ? 'thành công' : 'thất bại'}`,
    `Kiểu cài đặt: ${result.install_type || 'không rõ'}`,
    `Kết nối CDP: ${formatBooleanText(result.cdp_ready)}`,
    result.executable_path ? `Đường dẫn chạy: ${result.executable_path}` : null,
    result.note ? `Ghi chú: ${result.note}` : null,
  ].filter(Boolean).join('\n');
}

function formatMaybeValue(value) {
  return value == null || value === '' ? 'không rõ' : String(value);
}

function formatResolution(resolution) {
  const value = String(resolution || '').trim();
  if (!value) return 'không rõ';
  if (/^\d+$/.test(value)) return `${value}m`;
  return value;
}

function formatInstrumentType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'không rõ';

  const labels = {
    commodity: 'hàng hóa',
    stock: 'cổ phiếu',
    crypto: 'crypto',
    forex: 'forex',
    futures: 'hợp đồng tương lai',
    index: 'chỉ số',
  };

  return labels[normalized] || value;
}

function executeCli(args, { env, stdin }) {
  const cwd = dirname(dirname(__dirname));

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 120000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (!timedOut && code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }

      const error = new Error(timedOut ? 'tv command timed out after 120000 ms' : `tv command exited with code ${code}`);
      error.stdout = stdout;
      error.stderr = stderr;
      error.code = code;
      reject(error);
    });

    if (stdin != null) {
      child.stdin.write(String(stdin));
    }
    child.stdin.end();
  });
}
