import { basename } from 'path';
import { readFile, unlink } from 'fs/promises';

const API_BASE = 'https://api.telegram.org';
const TELEGRAM_CAPTION_LIMIT = 1024;

export async function telegramCall(token, method, body) {
  const resp = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: 'POST',
    body,
  });
  if (!resp.ok) {
    throw new Error(`Telegram API ${method} failed with HTTP ${resp.status}`);
  }
  const data = await resp.json();
  if (!data.ok) {
    throw new Error(`Telegram API ${method} error: ${data.description || 'unknown error'}`);
  }
  return data.result;
}

export async function getUpdates(token, offset, timeoutSeconds) {
  const body = new URLSearchParams({
    offset: String(offset),
    timeout: String(timeoutSeconds),
    allowed_updates: JSON.stringify(['message']),
  });
  return telegramCall(token, 'getUpdates', body);
}

export async function deleteWebhook(token) {
  return telegramCall(token, 'deleteWebhook', new URLSearchParams({
    drop_pending_updates: 'false',
  }));
}

export async function sendMessage(token, chatId, text) {
  return telegramCall(token, 'sendMessage', new URLSearchParams({
    chat_id: String(chatId),
    text,
  }));
}

export async function sendPhoto(token, chatId, filePath, caption) {
  const form = new FormData();
  form.set('chat_id', String(chatId));
  if (caption) form.set('caption', truncateTelegramCaption(caption));
  form.set('photo', new Blob([await readFile(filePath)]), basename(filePath));
  return telegramCall(token, 'sendPhoto', form);
}

export function truncateTelegramCaption(text, maxLength = TELEGRAM_CAPTION_LIMIT) {
  const value = String(text || '');
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 14)}\n\n...[cat bot]`;
}

export function buildSignalScreenshotFilename({ chart, signal, date = new Date() }) {
  const symbol = sanitizeFilenamePart(chart?.chart_symbol || 'chart');
  const timeframe = sanitizeFilenamePart(chart?.chart_resolution || 'na');
  const detector = sanitizeFilenamePart(signal?.detectorKey || signal?.signalText || 'signal');
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  return `signal_${symbol}_${timeframe}_${detector}_${timestamp}`;
}

export async function sendSignalNotification({
  config,
  text,
  chart,
  signal,
  logger = process.stderr,
  captureScreenshot,
  isReadableFile,
  sendMessageImpl = sendMessage,
  sendPhotoImpl = sendPhoto,
  removeFileImpl = unlink,
  getVisibleRangeImpl,
  setVisibleRangeImpl,
  now = () => new Date(),
}) {
  const chatId = config.adminId;
  const screenshotConfig = config.signalMonitor?.screenshot || {};
  let filePath = null;

  try {
    if (screenshotConfig.enabled && typeof captureScreenshot === 'function') {
      const zoomLatestWidthRatio = screenshotConfig.latestWidthRatio;
      const focus = screenshotConfig.focus === 'latest'
        ? { mode: 'latest', latestWidthRatio: screenshotConfig.latestCropRatio }
        : undefined;
      const captureArgs = {
        region: screenshotConfig.region,
        method: screenshotConfig.method,
        filename: buildSignalScreenshotFilename({ chart, signal, date: now() }),
      };
      const screenshotResult = await captureSignalScreenshot({
        captureScreenshot,
        captureArgs,
        focus,
        zoomLatestWidthRatio,
        getVisibleRangeImpl,
        setVisibleRangeImpl,
      });
      if (screenshotResult?.success && typeof screenshotResult.file_path === 'string' && await isReadableFile(screenshotResult.file_path)) {
        filePath = screenshotResult.file_path;
        await sendPhotoImpl(config.token, chatId, filePath, text);
        return { deliveredAs: 'photo', filePath };
      }
      writeLog(logger, 'signal-monitor screenshot capture returned no readable file; sending text fallback');
    }
  } catch (err) {
    writeLog(logger, `signal-monitor screenshot send failed: ${err.message}`);
  } finally {
    if (filePath) {
      try {
        await removeFileImpl(filePath);
      } catch {
        // Best-effort cleanup only.
      }
    }
  }

  await sendMessageImpl(config.token, chatId, text);
  return { deliveredAs: 'text' };
}

async function captureSignalScreenshot({
  captureScreenshot,
  captureArgs,
  focus,
  zoomLatestWidthRatio,
  getVisibleRangeImpl,
  setVisibleRangeImpl,
}) {
  if (
    focus?.mode === 'latest' &&
    captureArgs.region === 'chart' &&
    typeof getVisibleRangeImpl === 'function' &&
    typeof setVisibleRangeImpl === 'function'
  ) {
    const rangeState = await getVisibleRangeImpl();
    const zoomRange = buildLatestZoomRange(rangeState, zoomLatestWidthRatio);
    if (zoomRange) {
      await setVisibleRangeImpl({ from: zoomRange.from, to: zoomRange.to });
      try {
        return await captureScreenshot({
          ...captureArgs,
          focus,
        });
      } finally {
        await restoreVisibleRange(setVisibleRangeImpl, rangeState);
      }
    }
  }

  return captureScreenshot({
    ...captureArgs,
    focus,
  });
}

function buildLatestZoomRange(rangeState, latestWidthRatio) {
  const visible = rangeState?.visible_range;
  const bars = rangeState?.bars_range;
  const visibleFrom = toFinitePositiveNumber(visible?.from);
  const visibleTo = toFinitePositiveNumber(visible?.to);
  const barsFrom = toFinitePositiveNumber(bars?.from);
  const barsTo = toFinitePositiveNumber(bars?.to);
  if (!visibleFrom || !visibleTo || !barsTo || visibleTo <= visibleFrom) return null;

  const visibleSpan = visibleTo - visibleFrom;
  const barsSpan = barsFrom && barsTo > barsFrom ? (barsTo - barsFrom) : 0;
  const widthRatio = normalizeLatestWidthRatio(latestWidthRatio);
  const baseSpan = barsSpan || visibleSpan;
  const zoomSpan = Math.max(60, Math.round(baseSpan * widthRatio));
  const zoomTo = barsTo;
  const zoomFrom = Math.max(0, zoomTo - zoomSpan);
  if (zoomTo <= zoomFrom) return null;

  return { from: zoomFrom, to: zoomTo };
}

async function restoreVisibleRange(setVisibleRangeImpl, rangeState) {
  const visible = rangeState?.visible_range;
  const from = toFinitePositiveNumber(visible?.from);
  const to = toFinitePositiveNumber(visible?.to);
  if (!from || !to || to <= from) return;
  await setVisibleRangeImpl({ from, to });
}

function sanitizeFilenamePart(value) {
  return String(value || '')
    .replace(/[:/\\\s]+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'na';
}

function writeLog(logger, line) {
  if (!logger || typeof logger.write !== 'function') return;
  logger.write(`${line}\n`);
}

function normalizeLatestWidthRatio(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0.42;
  if (numericValue < 0.2) return 0.2;
  if (numericValue > 1) return 1;
  return numericValue;
}

function toFinitePositiveNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}
