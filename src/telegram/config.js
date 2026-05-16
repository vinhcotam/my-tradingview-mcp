export function loadTelegramConfig(env = process.env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const adminId = env.TELEGRAM_ADMIN_ID;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
  if (!adminId) throw new Error('TELEGRAM_ADMIN_ID is required');

  const pollTimeoutSeconds = Number(env.TELEGRAM_POLL_TIMEOUT_SECONDS || '30');
  const retryDelayMs = Number(env.TELEGRAM_RETRY_DELAY_MS || '5000');
  if (!Number.isFinite(pollTimeoutSeconds) || pollTimeoutSeconds < 1 || pollTimeoutSeconds > 50) {
    throw new Error(`Invalid TELEGRAM_POLL_TIMEOUT_SECONDS: ${env.TELEGRAM_POLL_TIMEOUT_SECONDS}`);
  }
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 250) {
    throw new Error(`Invalid TELEGRAM_RETRY_DELAY_MS: ${env.TELEGRAM_RETRY_DELAY_MS}`);
  }

  const signalMonitorEnabled = parseBoolean(env.TELEGRAM_SIGNAL_MONITOR_ENABLED, false);
  const signalMonitorIntervalMs = Number(env.TELEGRAM_SIGNAL_MONITOR_INTERVAL_MS || '3000');
  const signalMonitorWarmupMs = Number(env.TELEGRAM_SIGNAL_MONITOR_WARMUP_MS || '6000');
  const signalMonitorMaxLabels = Number(env.TELEGRAM_SIGNAL_MONITOR_MAX_LABELS || '200');
  const signalMonitorSendChart = parseBoolean(env.TELEGRAM_SIGNAL_MONITOR_SEND_CHART, true);
  const signalMonitorScreenshotRegion = String(env.TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_REGION || 'chart').trim();
  const signalMonitorScreenshotMethod = String(env.TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_METHOD || 'cdp').trim();
  const signalMonitorScreenshotFocus = String(env.TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_FOCUS || 'latest').trim().toLowerCase();
  const signalMonitorScreenshotLatestWidthRatio = Number(env.TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_LATEST_WIDTH_RATIO || '0.25');
  const signalMonitorScreenshotLatestCropRatio = Number(env.TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_LATEST_CROP_RATIO || '0.72');
  if (!Number.isFinite(signalMonitorIntervalMs) || signalMonitorIntervalMs < 500) {
    throw new Error(`Invalid TELEGRAM_SIGNAL_MONITOR_INTERVAL_MS: ${env.TELEGRAM_SIGNAL_MONITOR_INTERVAL_MS}`);
  }
  if (!Number.isFinite(signalMonitorWarmupMs) || signalMonitorWarmupMs < 0) {
    throw new Error(`Invalid TELEGRAM_SIGNAL_MONITOR_WARMUP_MS: ${env.TELEGRAM_SIGNAL_MONITOR_WARMUP_MS}`);
  }
  if (!Number.isFinite(signalMonitorMaxLabels) || signalMonitorMaxLabels < 1) {
    throw new Error(`Invalid TELEGRAM_SIGNAL_MONITOR_MAX_LABELS: ${env.TELEGRAM_SIGNAL_MONITOR_MAX_LABELS}`);
  }
  if (!['full', 'chart', 'strategy_tester'].includes(signalMonitorScreenshotRegion)) {
    throw new Error(`Invalid TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_REGION: ${env.TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_REGION}`);
  }
  if (!['cdp', 'api'].includes(signalMonitorScreenshotMethod)) {
    throw new Error(`Invalid TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_METHOD: ${env.TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_METHOD}`);
  }
  if (!['none', 'latest'].includes(signalMonitorScreenshotFocus)) {
    throw new Error(`Invalid TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_FOCUS: ${env.TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_FOCUS}`);
  }
  if (!Number.isFinite(signalMonitorScreenshotLatestWidthRatio) || signalMonitorScreenshotLatestWidthRatio <= 0 || signalMonitorScreenshotLatestWidthRatio > 1) {
    throw new Error(`Invalid TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_LATEST_WIDTH_RATIO: ${env.TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_LATEST_WIDTH_RATIO}`);
  }
  if (!Number.isFinite(signalMonitorScreenshotLatestCropRatio) || signalMonitorScreenshotLatestCropRatio <= 0 || signalMonitorScreenshotLatestCropRatio > 1) {
    throw new Error(`Invalid TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_LATEST_CROP_RATIO: ${env.TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_LATEST_CROP_RATIO}`);
  }

  const redNewsEnabled = parseBoolean(env.TELEGRAM_RED_NEWS_ENABLED, false);
  const redNewsDailySummaryEnabled = parseBoolean(env.TELEGRAM_RED_NEWS_DAILY_SUMMARY_ENABLED, true);
  const redNewsPollIntervalMs = Number(env.TELEGRAM_RED_NEWS_POLL_INTERVAL_MS || '60000');
  const redNewsFetchIntervalMs = Number(env.TELEGRAM_RED_NEWS_FETCH_INTERVAL_MS || '300000');
  const redNewsLeadMinutes = Number(env.TELEGRAM_RED_NEWS_LEAD_MINUTES || '30');
  const redNewsMinImportance = Number(env.TELEGRAM_RED_NEWS_MIN_IMPORTANCE || '3');
  const redNewsCountryCodes = splitCountryCsv(env.TELEGRAM_RED_NEWS_COUNTRIES || '');
  if (!Number.isFinite(redNewsPollIntervalMs) || redNewsPollIntervalMs < 10000) {
    throw new Error(`Invalid TELEGRAM_RED_NEWS_POLL_INTERVAL_MS: ${env.TELEGRAM_RED_NEWS_POLL_INTERVAL_MS}`);
  }
  if (!Number.isFinite(redNewsFetchIntervalMs) || redNewsFetchIntervalMs < 30000) {
    throw new Error(`Invalid TELEGRAM_RED_NEWS_FETCH_INTERVAL_MS: ${env.TELEGRAM_RED_NEWS_FETCH_INTERVAL_MS}`);
  }
  if (!Number.isFinite(redNewsLeadMinutes) || redNewsLeadMinutes < 1 || redNewsLeadMinutes > 240) {
    throw new Error(`Invalid TELEGRAM_RED_NEWS_LEAD_MINUTES: ${env.TELEGRAM_RED_NEWS_LEAD_MINUTES}`);
  }
  if (!Number.isFinite(redNewsMinImportance) || redNewsMinImportance < 1 || redNewsMinImportance > 3) {
    throw new Error(`Invalid TELEGRAM_RED_NEWS_MIN_IMPORTANCE: ${env.TELEGRAM_RED_NEWS_MIN_IMPORTANCE}`);
  }

  return {
    token,
    adminId: String(adminId),
    pollTimeoutSeconds,
    retryDelayMs,
    signalMonitor: {
      enabled: signalMonitorEnabled,
      intervalMs: signalMonitorIntervalMs,
      warmupMs: signalMonitorWarmupMs,
      maxLabels: signalMonitorMaxLabels,
      screenshot: {
        enabled: signalMonitorSendChart,
        region: signalMonitorScreenshotRegion,
        method: signalMonitorScreenshotMethod,
        focus: signalMonitorScreenshotFocus,
        latestWidthRatio: signalMonitorScreenshotLatestWidthRatio,
        latestCropRatio: signalMonitorScreenshotLatestCropRatio,
      },
      detectors: [
        {
          key: 'gann_gt',
          name: 'GT',
          mode: 'labels',
          studyFilter: env.TELEGRAM_GT_STUDY_FILTER || 'TuanAnh_Gann_Final',
          signalTexts: splitCsv(env.TELEGRAM_GT_SIGNAL_TEXTS || 'GT'),
        },
        {
          key: 'money_printer',
          name: 'Money Printer',
          mode: 'studyValues',
          studyFilter: env.TELEGRAM_MONEY_PRINTER_STUDY_FILTER || 'Money Printer',
          valueKeys: splitCsv(env.TELEGRAM_MONEY_PRINTER_SIGNAL_TEXTS || 'BUY,SELL'),
        },
      ],
    },
    redNews: {
      enabled: redNewsEnabled,
      dailySummaryEnabled: redNewsDailySummaryEnabled,
      pollIntervalMs: redNewsPollIntervalMs,
      fetchIntervalMs: redNewsFetchIntervalMs,
      leadMinutes: redNewsLeadMinutes,
      minImportance: redNewsMinImportance,
      countryCodes: redNewsCountryCodes,
    },
  };
}

function parseBoolean(value, fallback) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function splitCsv(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function splitCountryCsv(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}
