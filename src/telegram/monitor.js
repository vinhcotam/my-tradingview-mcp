import * as healthCore from '../core/health.js';
import * as dataCore from '../core/data.js';
import * as chartCore from '../core/chart.js';
import { formatBooleanText, formatDateTime, localizeErrorMessage } from './text.js';

const LABEL_BURST_LIMIT = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeSignalText(text) {
  return String(text || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function matchesSignalText(detector, text) {
  const normalized = normalizeSignalText(text);
  return (detector.signalTexts || []).some((expected) => normalized === expected || normalized.startsWith(`${expected} `));
}

export function buildSignalFingerprint(detector, studyName, label) {
  return [
    detector.key,
    studyName || '',
    label.id ?? '',
    label.x ?? '',
    normalizeSignalText(label.text),
    label.price ?? '',
  ].join('|');
}

export function extractMatchingSignals(detector, labelResponse) {
  const studies = labelResponse?.studies || [];
  const signals = [];

  for (const study of studies) {
    for (const label of study.labels || []) {
      if (!matchesSignalText(detector, label.text)) continue;
      signals.push({
        detectorKey: detector.key,
        detectorName: detector.name,
        studyName: study.name,
        signalText: normalizeSignalText(label.text),
        rawText: label.text || '',
        price: label.price ?? null,
        id: label.id ?? null,
        x: label.x ?? null,
        fingerprint: buildSignalFingerprint(detector, study.name, label),
      });
    }
  }

  signals.sort((a, b) => {
    const ax = Number.isFinite(a.x) ? a.x : -Infinity;
    const bx = Number.isFinite(b.x) ? b.x : -Infinity;
    if (ax !== bx) return ax - bx;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });

  return signals;
}

export function extractStudyValueSignals(detector, studyValuesResponse, quote) {
  const studies = studyValuesResponse?.studies || [];
  const signals = [];
  const quotePrice = toFiniteNumber(quote?.last ?? quote?.close ?? quote?.price);
  const barTime = quote?.time ?? null;

  for (const study of studies) {
    if (!study?.name || !study.name.toLowerCase().includes(String(detector.studyFilter || '').toLowerCase())) continue;
    const values = study.values || {};
    for (const key of detector.valueKeys || []) {
      const rawValue = values[key];
      const numericValue = parseNumericValue(rawValue);
      if (!(numericValue > 0)) continue;
      const priceLike = quotePrice > 0 && numericValue >= quotePrice * 0.5 && numericValue <= quotePrice * 1.5;
      const signalPrice = priceLike ? numericValue : (quotePrice || null);
      signals.push({
        detectorKey: detector.key,
        detectorName: detector.name,
        studyName: study.name,
        signalText: key,
        rawText: key,
        price: signalPrice,
        rawValue: numericValue,
        priceSource: priceLike ? 'study-value' : 'quote-last',
        barTime,
        id: `${key}:${barTime ?? 'na'}`,
        x: barTime,
        fingerprint: [
          detector.key,
          study.name,
          key,
          barTime ?? '',
        ].join('|'),
      });
    }
  }

  return signals;
}

export function formatResolution(resolution) {
  const value = String(resolution || '').trim();
  if (!value) return 'không rõ';
  if (/^\d+$/.test(value)) return `${value}m`;
  return value;
}

export function formatMonitorStatus(status) {
  const chartText = status.chartSymbol ? `${status.chartSymbol} ${status.chartResolution || ''}`.trim() : 'không có';
  const lines = [
    'Bộ theo dõi tín hiệu',
    `Đã bật: ${formatBooleanText(status.enabled, { truthy: 'Bật', falsy: 'Tắt' })}`,
    `Đang chạy: ${formatBooleanText(status.running)}`,
    `Kết nối CDP: ${formatBooleanText(status.cdpConnected)}`,
    `Chart hiện tại: ${chartText}`,
    `Warmup còn lại: ${status.warmupRemainingMs} ms`,
  ];

  for (const detector of status.detectors || []) {
    const detectorLabel = formatDetectorLabel(detector);
    lines.push(
      `${detectorLabel}: mốc nền=${formatBooleanText(detector.baselined)} | đã thấy=${detector.seenCount} | đang chờ=${detector.pendingCount} | hiện tại=${detector.currentMatchCount} | gần nhất=${detector.lastSignal || 'không có'} | lỗi=${detector.lastError ? localizeErrorMessage(detector.lastError) : 'không có'}`
    );
  }

  return lines.join('\n');
}

export function formatSignalAlert({ chart, signal }) {
  const priceText = signal.price != null ? String(signal.price) : 'không có';
  const lines = [
    `Tín hiệu mới: ${signal.signalText}`,
    `Chỉ báo: ${signal.studyName}`,
    `Symbol: ${chart.chart_symbol}`,
    `Khung thời gian: ${formatResolution(chart.chart_resolution)}`,
    `Giá: ${priceText}`,
    `Thời điểm phát hiện: ${formatDateTime(new Date())}`,
  ];
  return lines.join('\n');
}

export function buildRelevantStudySignature(detectors, studies) {
  const filters = (detectors || [])
    .map((detector) => String(detector.studyFilter || '').trim().toLowerCase())
    .filter(Boolean);

  if (filters.length === 0) return '';

  return (studies || [])
    .filter((study) => {
      const name = String(study?.name || '').toLowerCase();
      return filters.some((filter) => name.includes(filter));
    })
    .map((study) => `${study.id || ''}:${study.name || ''}`)
    .sort()
    .join('|');
}

export function shouldSuppressHistoricalBurst(detector, newSignals) {
  return detector?.mode === 'labels' && (newSignals?.length || 0) > LABEL_BURST_LIMIT;
}

export function getLabelCursorX(signals) {
  let cursorX = null;
  for (const signal of signals || []) {
    if (!Number.isFinite(signal?.x)) continue;
    if (cursorX == null || signal.x > cursorX) cursorX = signal.x;
  }
  return cursorX;
}

export function isLabelSignalNewerThanCursor(signal, cursorX) {
  if (!Number.isFinite(cursorX) || !Number.isFinite(signal?.x)) return true;
  return signal.x > cursorX;
}

export class TelegramSignalMonitor {
  constructor({ config, sendMessage, sendSignalNotification = null, logger = process.stderr }) {
    this.config = config;
    this.sendMessage = sendMessage;
    this.sendSignalNotification = sendSignalNotification;
    this.logger = logger;
    this.running = false;
    this.loopPromise = null;
    this.chartKey = null;
    this.chart = null;
    this.studySignature = null;
    this.cdpConnected = false;
    this.lastConnectionError = null;
    this.warmupUntil = 0;
    this.detectorStates = new Map();
    for (const detector of config.signalMonitor.detectors) {
      this.detectorStates.set(detector.key, this.createDetectorState(detector));
    }
  }

  createDetectorState(detector) {
    return {
      detector,
      baselined: false,
      seen: new Set(),
      pending: new Map(),
      labelCursorX: null,
      currentMatchCount: 0,
      lastSignal: null,
      lastError: null,
    };
  }

  async start() {
    if (this.running) return false;
    this.running = true;
    this.resetBaseline('start');
    this.loopPromise = this.runLoop();
    return true;
  }

  async stop() {
    if (!this.running) return false;
    this.running = false;
    return true;
  }

  resetBaseline(reason = 'manual') {
    this.chartKey = null;
    this.chart = null;
    this.studySignature = null;
    this.warmupUntil = Date.now() + this.config.signalMonitor.warmupMs;
    this.detectorStates = new Map(
      this.config.signalMonitor.detectors.map((detector) => [detector.key, this.createDetectorState(detector)])
    );
    this.writeLog(`signal-monitor baseline reset (${reason})`);
  }

  getStatus() {
    return {
      enabled: this.config.signalMonitor.enabled,
      running: this.running,
      cdpConnected: this.cdpConnected,
      chartSymbol: this.chart?.chart_symbol || null,
      chartResolution: this.chart ? formatResolution(this.chart.chart_resolution) : null,
      warmupRemainingMs: Math.max(this.warmupUntil - Date.now(), 0),
      detectors: [...this.detectorStates.values()].map((state) => ({
        key: state.detector.key,
        name: state.detector.name,
        studyFilter: state.detector.studyFilter,
        baselined: state.baselined,
        seenCount: state.seen.size,
        pendingCount: state.pending.size,
        currentMatchCount: state.currentMatchCount,
        lastSignal: state.lastSignal,
        lastError: state.lastError,
      })),
    };
  }

  async runLoop() {
    while (this.running) {
      try {
        await this.pollOnce();
      } catch (err) {
        this.writeLog(`signal-monitor error: ${err.message}`);
      }
      if (!this.running) break;
      await sleep(this.config.signalMonitor.intervalMs);
    }
  }

  async pollOnce() {
    let health;
    let quote = null;
    let chartState = null;
    try {
      health = await healthCore.healthCheck();
      quote = await dataCore.getQuote();
      chartState = await chartCore.getState();
      if (!this.cdpConnected) {
        this.writeLog('signal-monitor connected to CDP');
      }
      this.cdpConnected = true;
      this.lastConnectionError = null;
    } catch (err) {
      if (this.cdpConnected || this.lastConnectionError !== err.message) {
        await this.safeSend(`Bộ theo dõi tín hiệu đã mất kết nối CDP.\nChi tiết: ${localizeErrorMessage(err.message)}`);
      }
      this.cdpConnected = false;
      this.lastConnectionError = err.message;
      return;
    }

    const chartKey = `${health.target_id}|${health.chart_symbol}|${health.chart_resolution}`;
    const studySignature = buildRelevantStudySignature(this.config.signalMonitor.detectors, chartState?.studies || []);
    if (chartKey !== this.chartKey) {
      this.chartKey = chartKey;
      this.chart = health;
      this.resetBaseline('chart-change');
      this.chartKey = chartKey;
      this.chart = health;
      this.studySignature = studySignature;
      await this.safeSend(
        `Bộ theo dõi tín hiệu đã được gắn vào chart ${health.chart_symbol} ${formatResolution(health.chart_resolution)}.\nĐang chờ tín hiệu GT / BUY / SELL mới.`
      );
    } else if (studySignature !== this.studySignature) {
      this.resetBaseline('study-change');
      this.chartKey = chartKey;
      this.chart = health;
      this.studySignature = studySignature;
      this.writeLog('signal-monitor relevant studies changed; baseline re-armed');
      return;
    } else {
      this.chart = health;
    }

    const inWarmup = Date.now() < this.warmupUntil;

    for (const detector of this.config.signalMonitor.detectors) {
      const state = this.detectorStates.get(detector.key);
      let signals = [];
      try {
        if (detector.mode === 'labels') {
          const labelResponse = await dataCore.getPineLabels({
            study_filter: detector.studyFilter,
            max_labels: this.config.signalMonitor.maxLabels,
            verbose: true,
          });
          signals = extractMatchingSignals(detector, labelResponse);
        } else if (detector.mode === 'studyValues') {
          const studyValuesResponse = await dataCore.getStudyValues();
          signals = extractStudyValueSignals(detector, studyValuesResponse, quote);
        } else {
          throw new Error(`Chế độ detector chưa được hỗ trợ: ${detector.mode}`);
        }
        state.lastError = null;
      } catch (err) {
        state.lastError = err.message;
        continue;
      }
      state.currentMatchCount = signals.length;

      if (inWarmup || !state.baselined) {
        if (detector.mode === 'labels') {
          const baselineCursorX = getLabelCursorX(signals);
          if (baselineCursorX != null) {
            state.labelCursorX = state.labelCursorX == null ? baselineCursorX : Math.max(state.labelCursorX, baselineCursorX);
          }
        }
        for (const signal of signals) state.seen.add(signal.fingerprint);
        state.baselined = true;
        continue;
      }

      if (detector.mode === 'studyValues') {
        const activeFingerprints = new Set(signals.map((signal) => signal.fingerprint));
        for (const fingerprint of [...state.pending.keys()]) {
          const pendingSignal = state.pending.get(fingerprint);
          if (!pendingSignal) continue;
          if (pendingSignal.barTime === quote?.time && !activeFingerprints.has(fingerprint)) {
            state.pending.delete(fingerprint);
          }
        }
        for (const [fingerprint, pendingSignal] of [...state.pending.entries()]) {
          if (pendingSignal.barTime == null || pendingSignal.barTime === quote?.time) continue;
          state.pending.delete(fingerprint);
          if (state.seen.has(fingerprint)) continue;
          state.seen.add(fingerprint);
          state.lastSignal = `${pendingSignal.signalText}@${pendingSignal.price ?? 'n/a'}`;
          await this.safeSendSignal({ chart: health, signal: pendingSignal });
        }

        for (const signal of signals) {
          if (state.seen.has(signal.fingerprint)) continue;
          state.pending.set(signal.fingerprint, signal);
        }
        continue;
      }

      const newSignals = signals.filter((signal) => !state.seen.has(signal.fingerprint));
      const activeFingerprints = new Set(signals.map((signal) => signal.fingerprint));
      for (const fingerprint of [...state.pending.keys()]) {
        if (!activeFingerprints.has(fingerprint)) state.pending.delete(fingerprint);
      }
      for (const signal of signals) state.seen.add(signal.fingerprint);
      const recentSignals = newSignals.filter((signal) => isLabelSignalNewerThanCursor(signal, state.labelCursorX));
      const currentCursorX = getLabelCursorX(signals);
      if (currentCursorX != null) {
        state.labelCursorX = state.labelCursorX == null ? currentCursorX : Math.max(state.labelCursorX, currentCursorX);
      }

      if (shouldSuppressHistoricalBurst(detector, recentSignals)) {
        this.writeLog(
          `signal-monitor suppressed historical burst for ${detector.key}: ${recentSignals.length} labels in one poll`
        );
        continue;
      }

      for (const signal of recentSignals) {
        state.lastSignal = `${signal.signalText}@${signal.price ?? 'n/a'}`;
        await this.safeSendSignal({ chart: health, signal });
      }
    }
  }

  async safeSend(text) {
    try {
      await this.sendMessage(this.config.token, this.config.adminId, text);
    } catch (err) {
      this.writeLog(`signal-monitor send error: ${err.message}`);
    }
  }

  async safeSendSignal(payload) {
    try {
      if (typeof this.sendSignalNotification === 'function') {
        await this.sendSignalNotification(payload);
        return;
      }
      await this.safeSend(formatSignalAlert(payload));
    } catch (err) {
      this.writeLog(`signal-monitor send error: ${err.message}`);
    }
  }

  writeLog(line) {
    this.logger.write(`${line}\n`);
  }
}

function parseNumericValue(rawValue) {
  if (typeof rawValue === 'number') return rawValue;
  const normalized = String(rawValue || '').replace(/,/g, '').trim();
  const numericValue = Number(normalized);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function toFiniteNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatDetectorLabel(detector) {
  const studyFilter = String(detector.studyFilter || '').trim();
  const name = String(detector.name || detector.key || '').trim();
  if (studyFilter && name && studyFilter !== name) return `${studyFilter} (${name})`;
  return studyFilter || name || detector.key || 'detector';
}
