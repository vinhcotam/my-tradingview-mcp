import * as healthCore from '../core/health.js';
import { formatBooleanText, formatDateTime, localizeErrorMessage } from './text.js';

const TRADINGVIEW_ECONOMIC_CALENDAR_URL = 'https://economic-calendar.tradingview.com/events';
const TRADINGVIEW_ECONOMIC_CALENDAR_HEADERS = {
  'user-agent': 'Mozilla/5.0',
  'referer': 'https://www.tradingview.com/economic-calendar/',
  'origin': 'https://www.tradingview.com',
  'accept': 'application/json, text/plain, */*',
};
const DEFAULT_COUNTRY_CODES = ['US'];
const DEFAULT_REMINDER_GRACE_MS = 2 * 60 * 1000;
const DEFAULT_FETCH_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 60 * 1000;
const DEFAULT_LEAD_MINUTES = 30;
const DEFAULT_MIN_IMPORTANCE = 3;

const COUNTRY_LABELS = new Map([
  ['AU', 'Úc'],
  ['BR', 'Brazil'],
  ['CA', 'Canada'],
  ['CH', 'Thụy Sĩ'],
  ['CN', 'Trung Quốc'],
  ['DE', 'Đức'],
  ['EU', 'Euro Area'],
  ['FR', 'Pháp'],
  ['GB', 'Vương quốc Anh'],
  ['HK', 'Hong Kong'],
  ['ID', 'Indonesia'],
  ['IN', 'Ấn Độ'],
  ['IT', 'Ý'],
  ['JP', 'Nhật Bản'],
  ['KR', 'Hàn Quốc'],
  ['MX', 'Mexico'],
  ['MY', 'Malaysia'],
  ['NO', 'Na Uy'],
  ['NZ', 'New Zealand'],
  ['RU', 'Nga'],
  ['SA', 'Saudi Arabia'],
  ['SE', 'Thụy Điển'],
  ['SG', 'Singapore'],
  ['TR', 'Thổ Nhĩ Kỳ'],
  ['TW', 'Đài Loan'],
  ['US', 'Hoa Kỳ'],
  ['ZA', 'Nam Phi'],
]);

const COUNTRY_NAME_ALIASES = new Map([
  ['AUSTRALIA', 'AU'],
  ['BRAZIL', 'BR'],
  ['CANADA', 'CA'],
  ['CHINA', 'CN'],
  ['EU', 'EU'],
  ['EURO AREA', 'EU'],
  ['FRANCE', 'FR'],
  ['GERMANY', 'DE'],
  ['HONG KONG', 'HK'],
  ['INDIA', 'IN'],
  ['INDONESIA', 'ID'],
  ['ITALY', 'IT'],
  ['JAPAN', 'JP'],
  ['MALAYSIA', 'MY'],
  ['MEXICO', 'MX'],
  ['NEW ZEALAND', 'NZ'],
  ['NORWAY', 'NO'],
  ['RUSSIA', 'RU'],
  ['SAUDI ARABIA', 'SA'],
  ['SINGAPORE', 'SG'],
  ['SOUTH AFRICA', 'ZA'],
  ['SOUTH KOREA', 'KR'],
  ['SWEDEN', 'SE'],
  ['SWITZERLAND', 'CH'],
  ['TAIWAN', 'TW'],
  ['TURKEY', 'TR'],
  ['UK', 'GB'],
  ['UNITED KINGDOM', 'GB'],
  ['UNITED STATES', 'US'],
  ['USA', 'US'],
]);

const CURRENCY_TO_COUNTRY_CODE = new Map([
  ['AUD', 'AU'],
  ['BRL', 'BR'],
  ['CAD', 'CA'],
  ['CHF', 'CH'],
  ['CNH', 'CN'],
  ['CNY', 'CN'],
  ['EUR', 'EU'],
  ['GBP', 'GB'],
  ['HKD', 'HK'],
  ['IDR', 'ID'],
  ['INR', 'IN'],
  ['JPY', 'JP'],
  ['KRW', 'KR'],
  ['MXN', 'MX'],
  ['MYR', 'MY'],
  ['NOK', 'NO'],
  ['NZD', 'NZ'],
  ['RUB', 'RU'],
  ['SAR', 'SA'],
  ['SEK', 'SE'],
  ['SGD', 'SG'],
  ['TRY', 'TR'],
  ['TWD', 'TW'],
  ['USD', 'US'],
  ['ZAR', 'ZA'],
]);

const KNOWN_CURRENCY_CODES = new Set(CURRENCY_TO_COUNTRY_CODE.keys());

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseCountryCodeToken(token) {
  const normalized = String(token || '').trim().toUpperCase();
  if (!normalized) return null;
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  return COUNTRY_NAME_ALIASES.get(normalized) || null;
}

export function extractChartCurrencyCodes(chartSymbol) {
  const symbol = String(chartSymbol || '')
    .split(':')
    .pop()
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  if (!symbol) return [];

  const codes = [];
  if (symbol.length >= 6) {
    const base = symbol.slice(0, 3);
    const quote = symbol.slice(3, 6);
    if (KNOWN_CURRENCY_CODES.has(base)) codes.push(base);
    if (KNOWN_CURRENCY_CODES.has(quote)) codes.push(quote);
  }

  for (const knownCode of KNOWN_CURRENCY_CODES) {
    if (symbol.endsWith(knownCode)) codes.push(knownCode);
  }

  return [...new Set(codes)];
}

export function resolveRelevantCountryCodes({ chartSymbol, explicitCountryCodes = [], defaultCountryCodes = DEFAULT_COUNTRY_CODES } = {}) {
  const explicit = explicitCountryCodes
    .map(parseCountryCodeToken)
    .filter(Boolean);
  if (explicit.length > 0) return [...new Set(explicit)];

  const fromChart = extractChartCurrencyCodes(chartSymbol)
    .map((currencyCode) => CURRENCY_TO_COUNTRY_CODE.get(currencyCode))
    .filter(Boolean);
  if (fromChart.length > 0) return [...new Set(fromChart)];

  return [...new Set((defaultCountryCodes || []).map(parseCountryCodeToken).filter(Boolean))];
}

export function getLocalDayBounds(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function buildEconomicCalendarUrl({ fromDate, toDate, countryCodes }) {
  const url = new URL(TRADINGVIEW_ECONOMIC_CALENDAR_URL);
  url.searchParams.set('from', fromDate.toISOString());
  url.searchParams.set('to', toDate.toISOString());
  url.searchParams.set('countries', [...new Set(countryCodes)].join(','));
  return url.toString();
}

export async function fetchEconomicCalendarEvents({
  fromDate,
  toDate,
  countryCodes,
  fetchImpl = fetch,
  headers = TRADINGVIEW_ECONOMIC_CALENDAR_HEADERS,
}) {
  const url = buildEconomicCalendarUrl({ fromDate, toDate, countryCodes });
  const resp = await fetchImpl(url, { headers });
  if (!resp.ok) {
    throw new Error(`TradingView economic calendar returned HTTP ${resp.status}`);
  }

  const data = await resp.json();
  if (data?.status !== 'ok' || !Array.isArray(data?.result)) {
    throw new Error('TradingView economic calendar returned an invalid payload');
  }

  return data.result;
}

export function filterHighImpactEvents(events, minImportance = DEFAULT_MIN_IMPORTANCE) {
  return (events || [])
    .filter((event) => Number(event?.importance) >= Number(minImportance))
    .sort((left, right) => {
      const leftTime = Date.parse(left?.date || '') || 0;
      const rightTime = Date.parse(right?.date || '') || 0;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return String(left?.id || '').localeCompare(String(right?.id || ''));
    });
}

export function formatCountryCodeLabel(countryCode) {
  const code = String(countryCode || '').toUpperCase();
  const label = COUNTRY_LABELS.get(code);
  return label ? `${label} (${code})` : code;
}

export function formatCountryCodeList(countryCodes) {
  return (countryCodes || []).map(formatCountryCodeLabel).join(', ') || 'không rõ';
}

export function buildEconomicEventFingerprint(event) {
  return [event?.id || '', event?.country || '', event?.title || '', event?.date || ''].join('|');
}

export function shouldSendRedNewsReminder({
  event,
  now = new Date(),
  remindedFingerprints = new Set(),
  leadMinutes = DEFAULT_LEAD_MINUTES,
  reminderGraceMs = DEFAULT_REMINDER_GRACE_MS,
}) {
  const eventTime = Date.parse(event?.date || '');
  if (!Number.isFinite(eventTime)) return false;

  const fingerprint = buildEconomicEventFingerprint(event);
  if (remindedFingerprints.has(fingerprint)) return false;

  const diffMs = eventTime - now.getTime();
  return diffMs <= leadMinutes * 60 * 1000 && diffMs >= -Math.abs(reminderGraceMs);
}

export function formatRedNewsSummary({
  chart,
  countryCodes,
  events,
  now = new Date(),
}) {
  const lines = [
    'Cảnh báo tin đỏ trong ngày',
    `Symbol: ${chart?.chart_symbol || 'không rõ'}`,
    `Khung thời gian: ${formatResolution(chart?.chart_resolution)}`,
    `Khu vực theo dõi: ${formatCountryCodeList(countryCodes)}`,
    `Số tin đỏ còn lại trong ngày: ${events.length}`,
  ];

  for (const event of events) {
    lines.push(`- ${formatDateTime(event.date)} | ${formatCountryCodeLabel(event.country)} | ${event.title}`);
  }

  lines.push(`Cập nhật: ${formatDateTime(now)}`);
  return lines.join('\n');
}

export function formatRedNewsReminder({
  chart,
  event,
  leadMinutes = DEFAULT_LEAD_MINUTES,
  now = new Date(),
}) {
  const eventTime = Date.parse(event?.date || '');
  const diffMs = Number.isFinite(eventTime) ? eventTime - now.getTime() : 0;
  const minutesLeft = Math.max(0, Math.round(diffMs / 60000));
  const timeLabel = minutesLeft > 0 ? `${minutesLeft} phút` : `${leadMinutes} phút`;

  return [
    `Sắp có tin đỏ trong ${timeLabel}`,
    `Symbol: ${chart?.chart_symbol || 'không rõ'}`,
    `Khung thời gian: ${formatResolution(chart?.chart_resolution)}`,
    `Quốc gia: ${formatCountryCodeLabel(event?.country)}`,
    `Sự kiện: ${event?.title || 'không rõ'}`,
    `Giờ ra tin: ${formatDateTime(event?.date)}`,
    `Mức độ: đỏ`,
  ].join('\n');
}

export function formatRedNewsStatus(status) {
  const lines = [
    'Bộ theo dõi tin đỏ',
    `Đã bật: ${formatBooleanText(status.enabled, { truthy: 'Bật', falsy: 'Tắt' })}`,
    `Đang chạy: ${formatBooleanText(status.running)}`,
    `Kết nối CDP: ${formatBooleanText(status.cdpConnected)}`,
    `Chart hiện tại: ${status.chartSymbol ? `${status.chartSymbol} ${status.chartResolution || ''}`.trim() : 'không có'}`,
    `Khu vực theo dõi: ${formatCountryCodeList(status.countryCodes)}`,
    `Tin đỏ đã cache: ${status.cachedEventCount}`,
    `Lần cập nhật gần nhất: ${status.lastFetchAt ? formatDateTime(status.lastFetchAt) : 'không có'}`,
    `Lỗi gần nhất: ${status.lastError ? localizeErrorMessage(status.lastError) : 'không có'}`,
  ];
  return lines.join('\n');
}

export class TelegramRedNewsMonitor {
  constructor({
    config,
    sendMessage,
    logger = process.stderr,
    now = () => new Date(),
    fetchImpl = fetch,
    healthCheck = healthCore.healthCheck,
  }) {
    this.config = config;
    this.sendMessage = sendMessage;
    this.logger = logger;
    this.now = now;
    this.fetchImpl = fetchImpl;
    this.healthCheck = healthCheck;
    this.running = false;
    this.loopPromise = null;
    this.cdpConnected = false;
    this.lastConnectionError = null;
    this.lastError = null;
    this.chart = null;
    this.chartKey = null;
    this.countryCodes = [];
    this.cachedEvents = [];
    this.lastFetchAt = null;
    this.fetchKey = null;
    this.summarySentKeys = new Set();
    this.remindedFingerprints = new Set();
  }

  async start() {
    if (this.running) return false;
    this.running = true;
    this.reset('start');
    this.loopPromise = this.runLoop();
    return true;
  }

  async stop() {
    if (!this.running) return false;
    this.running = false;
    return true;
  }

  reset(reason = 'manual') {
    this.chart = null;
    this.chartKey = null;
    this.countryCodes = [];
    this.cachedEvents = [];
    this.lastFetchAt = null;
    this.fetchKey = null;
    this.lastError = null;
    this.summarySentKeys.clear();
    this.remindedFingerprints.clear();
    this.writeLog(`red-news baseline reset (${reason})`);
  }

  getStatus() {
    return {
      enabled: this.config.redNews.enabled,
      running: this.running,
      cdpConnected: this.cdpConnected,
      chartSymbol: this.chart?.chart_symbol || null,
      chartResolution: this.chart ? formatResolution(this.chart.chart_resolution) : null,
      countryCodes: [...this.countryCodes],
      cachedEventCount: this.cachedEvents.length,
      lastFetchAt: this.lastFetchAt,
      lastError: this.lastError || this.lastConnectionError,
    };
  }

  async runLoop() {
    while (this.running) {
      try {
        await this.pollOnce();
      } catch (err) {
        this.lastError = err.message;
        this.writeLog(`red-news error: ${err.message}`);
      }

      if (!this.running) break;
      await sleep(this.config.redNews.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS);
    }
  }

  async pollOnce() {
    let health;
    try {
      health = await this.healthCheck();
      this.lastError = null;
      if (!this.cdpConnected) this.writeLog('red-news connected to CDP');
      this.cdpConnected = true;
      this.lastConnectionError = null;
    } catch (err) {
      this.cdpConnected = false;
      if (this.lastConnectionError !== err.message) {
        this.lastConnectionError = err.message;
        this.writeLog(`red-news lost CDP connection: ${err.message}`);
      }
      return;
    }

    const chartKey = `${health.target_id}|${health.chart_symbol}|${health.chart_resolution}`;
    if (chartKey !== this.chartKey) {
      this.chartKey = chartKey;
      this.chart = health;
      this.cachedEvents = [];
      this.lastFetchAt = null;
      this.fetchKey = null;
      this.summarySentKeys.clear();
      this.remindedFingerprints.clear();
      this.writeLog(`red-news chart changed to ${health.chart_symbol} ${formatResolution(health.chart_resolution)}`);
    } else {
      this.chart = health;
    }

    const countryCodes = resolveRelevantCountryCodes({
      chartSymbol: health.chart_symbol,
      explicitCountryCodes: this.config.redNews.countryCodes,
      defaultCountryCodes: DEFAULT_COUNTRY_CODES,
    });
    this.countryCodes = countryCodes;

    const now = this.now();
    const dayBounds = getLocalDayBounds(now);
    const fetchKey = `${dayBounds.start.toISOString()}|${countryCodes.join(',')}`;
    const nowMs = now.getTime();
    const needsFetch = !this.lastFetchAt
      || this.fetchKey !== fetchKey
      || (nowMs - this.lastFetchAt.getTime()) >= (this.config.redNews.fetchIntervalMs || DEFAULT_FETCH_INTERVAL_MS);

    if (needsFetch) {
      const events = await fetchEconomicCalendarEvents({
        fromDate: dayBounds.start,
        toDate: dayBounds.end,
        countryCodes,
        fetchImpl: this.fetchImpl,
      });
      this.cachedEvents = filterHighImpactEvents(events, this.config.redNews.minImportance);
      this.lastFetchAt = now;
      this.fetchKey = fetchKey;
    }

    const remainingEvents = this.cachedEvents.filter((event) => {
      const eventTime = Date.parse(event?.date || '');
      return Number.isFinite(eventTime) && eventTime >= (nowMs - DEFAULT_REMINDER_GRACE_MS);
    });

    if (
      this.config.redNews.dailySummaryEnabled &&
      remainingEvents.length > 0 &&
      !this.summarySentKeys.has(fetchKey)
    ) {
      await this.safeSend(formatRedNewsSummary({
        chart: this.chart,
        countryCodes,
        events: remainingEvents,
        now,
      }));
      this.summarySentKeys.add(fetchKey);
    }

    for (const event of remainingEvents) {
      if (!shouldSendRedNewsReminder({
        event,
        now,
        remindedFingerprints: this.remindedFingerprints,
        leadMinutes: this.config.redNews.leadMinutes,
      })) {
        continue;
      }

      const fingerprint = buildEconomicEventFingerprint(event);
      this.remindedFingerprints.add(fingerprint);
      await this.safeSend(formatRedNewsReminder({
        chart: this.chart,
        event,
        leadMinutes: this.config.redNews.leadMinutes,
        now,
      }));
    }
  }

  async sendTodaySummary({ force = false } = {}) {
    const now = this.now();
    const health = await this.healthCheck();
    this.chart = health;
    this.chartKey = `${health.target_id}|${health.chart_symbol}|${health.chart_resolution}`;

    const countryCodes = resolveRelevantCountryCodes({
      chartSymbol: health.chart_symbol,
      explicitCountryCodes: this.config.redNews.countryCodes,
      defaultCountryCodes: DEFAULT_COUNTRY_CODES,
    });
    this.countryCodes = countryCodes;

    const dayBounds = getLocalDayBounds(now);
    const events = filterHighImpactEvents(await fetchEconomicCalendarEvents({
      fromDate: dayBounds.start,
      toDate: dayBounds.end,
      countryCodes,
      fetchImpl: this.fetchImpl,
    }), this.config.redNews.minImportance);
    this.cachedEvents = events;
    this.lastFetchAt = now;
    this.fetchKey = `${dayBounds.start.toISOString()}|${countryCodes.join(',')}`;

    const remainingEvents = events.filter((event) => {
      const eventTime = Date.parse(event?.date || '');
      return Number.isFinite(eventTime) && eventTime >= (now.getTime() - DEFAULT_REMINDER_GRACE_MS);
    });

    if (remainingEvents.length === 0) {
      await this.safeSend([
        'Tin đỏ trong ngày',
        `Symbol: ${health.chart_symbol}`,
        `Khung thời gian: ${formatResolution(health.chart_resolution)}`,
        `Khu vực theo dõi: ${formatCountryCodeList(countryCodes)}`,
        'Không có tin đỏ còn lại trong ngày.',
      ].join('\n'));
      return;
    }

    await this.safeSend(formatRedNewsSummary({
      chart: health,
      countryCodes,
      events: remainingEvents,
      now,
    }));

    if (!force) this.summarySentKeys.add(this.fetchKey);
  }

  async safeSend(text) {
    try {
      await this.sendMessage(this.config.token, this.config.adminId, text);
    } catch (err) {
      this.writeLog(`red-news send error: ${err.message}`);
    }
  }

  writeLog(line) {
    if (!this.logger || typeof this.logger.write !== 'function') return;
    this.logger.write(`${line}\n`);
  }
}

function formatResolution(resolution) {
  const value = String(resolution || '').trim();
  if (!value) return 'không rõ';
  if (/^\d+$/.test(value)) return `${value}m`;
  return value;
}
