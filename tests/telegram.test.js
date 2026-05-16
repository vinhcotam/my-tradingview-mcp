import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseTelegramCommand, tokenizeCommandLine, isAuthorizedUser, getHelpText } from '../src/telegram/command.js';
import { loadTelegramConfig } from '../src/telegram/config.js';
import {
  buildRelevantStudySignature,
  extractMatchingSignals,
  extractStudyValueSignals,
  formatMonitorStatus,
  formatSignalAlert,
  getLabelCursorX,
  isLabelSignalNewerThanCursor,
  shouldSuppressHistoricalBurst,
} from '../src/telegram/monitor.js';
import { formatTvResult, screenshotCaption } from '../src/telegram/tv.js';
import {
  buildSignalScreenshotFilename,
  sendSignalNotification,
  truncateTelegramCaption,
} from '../src/telegram/api.js';
import {
  buildEconomicCalendarUrl,
  filterHighImpactEvents,
  formatRedNewsStatus,
  formatRedNewsSummary,
  resolveRelevantCountryCodes,
  shouldSendRedNewsReminder,
} from '../src/telegram/news.js';

const TEST_ADMIN_ID = '123456789';

describe('telegram command parsing', () => {
  it('tokenizes quoted CLI args', () => {
    const args = tokenizeCommandLine('indicator add "Relative Strength Index"');
    assert.deepEqual(args, ['indicator', 'add', 'Relative Strength Index']);
  });

  it('parses /tv command', () => {
    const parsed = parseTelegramCommand('/tv symbol BINANCE:BTCUSDT');
    assert.deepEqual(parsed, { type: 'tv', args: ['symbol', 'BINANCE:BTCUSDT'] });
  });

  it('parses /screenshot with default chart region', () => {
    const parsed = parseTelegramCommand('/screenshot');
    assert.deepEqual(parsed, { type: 'tv', args: ['screenshot', '--region', 'chart'] });
  });

  it('accepts plain tv prefix', () => {
    const parsed = parseTelegramCommand('tv timeframe 15');
    assert.deepEqual(parsed, { type: 'tv', args: ['timeframe', '15'] });
  });

  it('keeps compatibility for /tv data values', () => {
    const parsed = parseTelegramCommand('/tv data values');
    assert.deepEqual(parsed, { type: 'tv', args: ['values'] });
  });

  it('authorizes only the configured admin id', () => {
    assert.equal(isAuthorizedUser({ message: { from: { id: 123 } } }, '123'), true);
    assert.equal(isAuthorizedUser({ message: { from: { id: 123 } } }, '456'), false);
  });

  it('parses /monitor command', () => {
    const parsed = parseTelegramCommand('/monitor reset');
    assert.deepEqual(parsed, { type: 'monitor', action: 'reset' });
  });

  it('parses /news command', () => {
    const parsed = parseTelegramCommand('/news status');
    assert.deepEqual(parsed, { type: 'news', action: 'status' });
  });

  it('returns Vietnamese help text', () => {
    const helpText = getHelpText();
    assert.ok(helpText.includes('Bot Telegram cho TradingView'));
    assert.ok(helpText.includes('/status - kiểm tra kết nối CDP'));
    assert.ok(helpText.includes('/news [today|status|on|off|reset] - cảnh báo tin đỏ trong ngày'));
    assert.ok(helpText.includes('/chart_get_state'));
    assert.ok(helpText.includes('/alert_create --price 4675 --condition crossing --message "Test"'));
    assert.ok(helpText.includes('Ví dụ nhanh:'));
  });

  it('parses CLAUDE-style MCP aliases', () => {
    const parsed = parseTelegramCommand('/data_get_pine_labels --study_filter "TuanAnh_Gann_Final" --max_labels 20 --verbose');
    assert.deepEqual(parsed, {
      type: 'tv',
      args: ['data', 'labels', '--filter', 'TuanAnh_Gann_Final', '--max', '20', '--verbose'],
    });
  });

  it('parses direct alert_create alias', () => {
    const parsed = parseTelegramCommand('/alert_create --price 4675 --condition crossing --message "Test"');
    assert.deepEqual(parsed, {
      type: 'tv',
      args: ['alert', 'create', '--price', '4675', '--condition', 'crossing', '--message', 'Test'],
    });
  });

  it('parses pine_set_source as stdin payload', () => {
    const parsed = parseTelegramCommand('/pine_set_source indicator("Test")\nplot(close)');
    assert.deepEqual(parsed, {
      type: 'tv',
      args: ['pine', 'set'],
      stdin: 'indicator("Test")\nplot(close)',
    });
  });
});

describe('telegram config', () => {
  it('loads required env', () => {
    const cfg = loadTelegramConfig({
      TELEGRAM_BOT_TOKEN: 'token',
      TELEGRAM_ADMIN_ID: TEST_ADMIN_ID,
      TELEGRAM_POLL_TIMEOUT_SECONDS: '20',
      TELEGRAM_RETRY_DELAY_MS: '1000',
      TELEGRAM_SIGNAL_MONITOR_ENABLED: 'true',
      TELEGRAM_SIGNAL_MONITOR_INTERVAL_MS: '2500',
      TELEGRAM_SIGNAL_MONITOR_SEND_CHART: 'true',
      TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_REGION: 'chart',
      TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_METHOD: 'cdp',
      TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_FOCUS: 'latest',
      TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_LATEST_WIDTH_RATIO: '0.35',
      TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_LATEST_CROP_RATIO: '0.7',
      TELEGRAM_RED_NEWS_ENABLED: 'true',
      TELEGRAM_RED_NEWS_DAILY_SUMMARY_ENABLED: 'false',
      TELEGRAM_RED_NEWS_POLL_INTERVAL_MS: '60000',
      TELEGRAM_RED_NEWS_FETCH_INTERVAL_MS: '300000',
      TELEGRAM_RED_NEWS_LEAD_MINUTES: '45',
      TELEGRAM_RED_NEWS_MIN_IMPORTANCE: '3',
      TELEGRAM_RED_NEWS_COUNTRIES: 'US,EU',
    });
    assert.equal(cfg.token, 'token');
    assert.equal(cfg.adminId, TEST_ADMIN_ID);
    assert.equal(cfg.pollTimeoutSeconds, 20);
    assert.equal(cfg.retryDelayMs, 1000);
    assert.equal(cfg.signalMonitor.enabled, true);
    assert.equal(cfg.signalMonitor.intervalMs, 2500);
    assert.equal(cfg.signalMonitor.screenshot.enabled, true);
    assert.equal(cfg.signalMonitor.screenshot.region, 'chart');
    assert.equal(cfg.signalMonitor.screenshot.method, 'cdp');
    assert.equal(cfg.signalMonitor.screenshot.focus, 'latest');
    assert.equal(cfg.signalMonitor.screenshot.latestWidthRatio, 0.35);
    assert.equal(cfg.signalMonitor.screenshot.latestCropRatio, 0.7);
    assert.equal(cfg.signalMonitor.detectors[0].studyFilter, 'TuanAnh_Gann_Final');
    assert.equal(cfg.redNews.enabled, true);
    assert.equal(cfg.redNews.dailySummaryEnabled, false);
    assert.equal(cfg.redNews.pollIntervalMs, 60000);
    assert.equal(cfg.redNews.fetchIntervalMs, 300000);
    assert.equal(cfg.redNews.leadMinutes, 45);
    assert.equal(cfg.redNews.minImportance, 3);
    assert.deepEqual(cfg.redNews.countryCodes, ['US', 'EU']);
  });

  it('rejects missing token', () => {
    assert.throws(() => loadTelegramConfig({ TELEGRAM_ADMIN_ID: '1' }), /TELEGRAM_BOT_TOKEN/);
  });
});

describe('signal monitor helpers', () => {
  it('extracts GT and BUY/SELL labels from Pine label payloads', () => {
    const response = {
      studies: [
        {
          name: 'TuanAnh_Gann_Final 2 2',
          labels: [
            { id: 'a', text: 'GT', price: 4678.69, x: 100 },
            { id: 'b', text: 'noise', price: 4679.1, x: 101 },
          ],
        },
        {
          name: 'Money Printer 1 20',
          labels: [
            { id: 'c', text: 'BUY', price: 4679.0, x: 110 },
            { id: 'd', text: 'SELL', price: 4678.2, x: 120 },
          ],
        },
      ],
    };

    const gtSignals = extractMatchingSignals(
      { key: 'gann_gt', name: 'GT', signalTexts: ['GT'] },
      response
    );
    const mpSignals = extractMatchingSignals(
      { key: 'money_printer', name: 'Money Printer', signalTexts: ['BUY', 'SELL'] },
      response
    );

    assert.equal(gtSignals.length, 1);
    assert.equal(gtSignals[0].signalText, 'GT');
    assert.equal(mpSignals.length, 2);
    assert.deepEqual(mpSignals.map((signal) => signal.signalText), ['BUY', 'SELL']);
  });

  it('extracts BUY/SELL signals from study values', () => {
    const response = {
      studies: [
        {
          name: 'Money Printer 1',
          values: {
            'EMA 20': '4,684.544',
            VWAP: '4,693.056',
            BUY: '4,679.000',
            SELL: '0.000',
          },
        },
      ],
    };

    const signals = extractStudyValueSignals(
      { key: 'money_printer', name: 'Money Printer', studyFilter: 'Money Printer', valueKeys: ['BUY', 'SELL'] },
      response,
      { time: 1234567890, last: 4679 }
    );

    assert.equal(signals.length, 1);
    assert.equal(signals[0].signalText, 'BUY');
    assert.equal(signals[0].price, 4679);
  });

  it('keeps Money Printer fingerprint stable across intrabar quote changes', () => {
    const response = {
      studies: [
        {
          name: 'Money Printer 1',
          values: {
            BUY: '1',
            SELL: '0',
          },
        },
      ],
    };

    const firstSignals = extractStudyValueSignals(
      { key: 'money_printer', name: 'Money Printer', studyFilter: 'Money Printer', valueKeys: ['BUY', 'SELL'] },
      response,
      { time: 1234567890, last: 4676.08 }
    );
    const secondSignals = extractStudyValueSignals(
      { key: 'money_printer', name: 'Money Printer', studyFilter: 'Money Printer', valueKeys: ['BUY', 'SELL'] },
      response,
      { time: 1234567890, last: 4675.12 }
    );

    assert.equal(firstSignals.length, 1);
    assert.equal(secondSignals.length, 1);
    assert.equal(firstSignals[0].signalText, 'BUY');
    assert.equal(firstSignals[0].price, 4676.08);
    assert.equal(secondSignals[0].price, 4675.12);
    assert.equal(firstSignals[0].rawValue, 1);
    assert.equal(firstSignals[0].priceSource, 'quote-last');
    assert.equal(firstSignals[0].fingerprint, secondSignals[0].fingerprint);
  });

  it('formats monitor status in Vietnamese', () => {
    const text = formatMonitorStatus({
      enabled: true,
      running: true,
      cdpConnected: false,
      chartSymbol: 'OANDA:XAUUSD',
      chartResolution: '5m',
      warmupRemainingMs: 1200,
      detectors: [
        {
          key: 'gann_gt',
          name: 'GT',
          studyFilter: 'TuanAnh_Gann_Final',
          baselined: true,
          seenCount: 5,
          pendingCount: 1,
          currentMatchCount: 0,
          lastSignal: 'GT@4678.69',
          lastError: null,
        },
      ],
    });

    assert.ok(text.includes('Bộ theo dõi tín hiệu'));
    assert.ok(text.includes('Đã bật: Bật'));
    assert.ok(text.includes('Kết nối CDP: Không'));
    assert.ok(text.includes('TuanAnh_Gann_Final (GT)'));
  });

  it('formats signal alerts in Vietnamese', () => {
    const text = formatSignalAlert({
      chart: { chart_symbol: 'OANDA:XAUUSD', chart_resolution: '5' },
      signal: { signalText: 'BUY', studyName: 'Money Printer 1', price: 4679 },
    });

    assert.ok(text.includes('Tín hiệu mới: BUY'));
    assert.ok(text.includes('Chỉ báo: Money Printer 1'));
    assert.ok(text.includes('Khung thời gian: 5m'));
    assert.ok(text.includes('Giá: 4679'));
  });

  it('builds a stable signature for relevant studies only', () => {
    const signature = buildRelevantStudySignature(
      [
        { studyFilter: 'TuanAnh_Gann_Final' },
        { studyFilter: 'Money Printer' },
      ],
      [
        { id: '1', name: 'Volume' },
        { id: '2', name: 'Money Printer 1' },
        { id: '3', name: 'TuanAnh_Gann_Final' },
      ]
    );

    assert.equal(signature, '2:Money Printer 1|3:TuanAnh_Gann_Final');
  });

  it('suppresses historical label bursts but not single new labels', () => {
    const detector = { key: 'gann_gt', mode: 'labels' };
    assert.equal(shouldSuppressHistoricalBurst(detector, [{}, {}, {}, {}]), true);
    assert.equal(shouldSuppressHistoricalBurst(detector, [{}]), false);
    assert.equal(shouldSuppressHistoricalBurst({ key: 'money_printer', mode: 'studyValues' }, [{}, {}, {}, {}]), false);
  });

  it('uses the latest label x as cursor and ignores older labels', () => {
    const signals = [
      { x: 410, signalText: 'GT' },
      { x: 428, signalText: 'GT' },
      { x: 439, signalText: 'GT' },
    ];

    const cursorX = getLabelCursorX(signals);
    assert.equal(cursorX, 439);
    assert.equal(isLabelSignalNewerThanCursor({ x: 428 }, cursorX), false);
    assert.equal(isLabelSignalNewerThanCursor({ x: 439 }, cursorX), false);
    assert.equal(isLabelSignalNewerThanCursor({ x: 440 }, cursorX), true);
  });
});

describe('red news helpers', () => {
  it('infers relevant countries from chart symbol', () => {
    assert.deepEqual(resolveRelevantCountryCodes({ chartSymbol: 'OANDA:XAUUSD' }), ['US']);
    assert.deepEqual(resolveRelevantCountryCodes({ chartSymbol: 'OANDA:EURUSD' }), ['EU', 'US']);
    assert.deepEqual(resolveRelevantCountryCodes({ chartSymbol: 'BINANCE:BTCUSDT', explicitCountryCodes: ['GB', 'US'] }), ['GB', 'US']);
  });

  it('builds a TradingView economic calendar URL', () => {
    const url = buildEconomicCalendarUrl({
      fromDate: new Date('2026-05-16T00:00:00.000Z'),
      toDate: new Date('2026-05-17T00:00:00.000Z'),
      countryCodes: ['US', 'EU'],
    });

    assert.ok(url.startsWith('https://economic-calendar.tradingview.com/events?'));
    assert.ok(url.includes('countries=US%2CEU'));
  });

  it('filters only high-impact events', () => {
    const events = filterHighImpactEvents([
      { id: '2', importance: 2, date: '2026-05-16T13:00:00.000Z' },
      { id: '3', importance: 3, date: '2026-05-16T14:00:00.000Z' },
      { id: '1', importance: 3, date: '2026-05-16T12:00:00.000Z' },
    ], 3);

    assert.deepEqual(events.map((event) => event.id), ['1', '3']);
  });

  it('detects whether a red-news reminder should be sent', () => {
    const reminded = new Set();
    const event = {
      id: 'evt-1',
      country: 'US',
      title: 'CPI',
      date: '2026-05-16T10:30:00.000Z',
    };

    assert.equal(shouldSendRedNewsReminder({
      event,
      now: new Date('2026-05-16T10:05:00.000Z'),
      remindedFingerprints: reminded,
      leadMinutes: 30,
    }), true);

    reminded.add('evt-1|US|CPI|2026-05-16T10:30:00.000Z');
    assert.equal(shouldSendRedNewsReminder({
      event,
      now: new Date('2026-05-16T10:05:00.000Z'),
      remindedFingerprints: reminded,
      leadMinutes: 30,
    }), false);
  });

  it('formats red-news summary and status in Vietnamese', () => {
    const summary = formatRedNewsSummary({
      chart: { chart_symbol: 'OANDA:XAUUSD', chart_resolution: '5' },
      countryCodes: ['US'],
      events: [
        {
          id: 'evt-1',
          country: 'US',
          title: 'Non Farm Payrolls',
          date: '2026-05-16T12:30:00.000Z',
        },
      ],
      now: new Date('2026-05-16T10:00:00.000Z'),
    });

    const status = formatRedNewsStatus({
      enabled: true,
      running: true,
      cdpConnected: true,
      chartSymbol: 'OANDA:XAUUSD',
      chartResolution: '5m',
      countryCodes: ['US'],
      cachedEventCount: 1,
      lastFetchAt: new Date('2026-05-16T10:00:00.000Z'),
      lastError: null,
    });

    assert.ok(summary.includes('Cảnh báo tin đỏ trong ngày'));
    assert.ok(summary.includes('Non Farm Payrolls'));
    assert.ok(summary.includes('Hoa Kỳ (US)'));
    assert.ok(status.includes('Bộ theo dõi tin đỏ'));
    assert.ok(status.includes('Khu vực theo dõi: Hoa Kỳ (US)'));
  });
});

describe('telegram tv formatting', () => {
  it('formats status results in Vietnamese', () => {
    const text = formatTvResult(['status'], {
      success: true,
      cdp_connected: true,
      chart_symbol: 'OANDA:XAUUSD',
      chart_resolution: '5',
      target_url: 'https://www.tradingview.com/chart/',
      target_title: 'XAUUSD',
      api_available: true,
    });

    assert.ok(text.includes('Trạng thái kết nối TradingView'));
    assert.ok(text.includes('Kết nối CDP: Có'));
    assert.ok(text.includes('Khung thời gian: 5m'));
  });

  it('formats quote results in Vietnamese', () => {
    const text = formatTvResult(['quote'], {
      success: true,
      symbol: 'OANDA:XAUUSD',
      time: 1778813400,
      open: 4614.865,
      high: 4620.035,
      low: 4612.34,
      close: 4618.9,
      last: 4618.9,
      volume: 1190,
      description: 'Gold',
      exchange: 'OANDA',
      type: 'commodity',
    });

    assert.ok(text.includes('Báo giá hiện tại'));
    assert.ok(text.includes('Mô tả: Gold'));
    assert.ok(text.includes('Loại: hàng hóa'));
    assert.ok(text.includes('Khối lượng: 1190'));
  });

  it('formats screenshot captions in Vietnamese', () => {
    const text = screenshotCaption(['screenshot', '--region', 'chart'], {
      file_path: 'D:\\codebot\\tradingview-mcp\\screenshots\\tv_chart.png',
    });

    assert.ok(text.includes('Ảnh chụp từ TradingView'));
    assert.ok(text.includes('Tệp: tv_chart.png'));
  });
});

describe('telegram signal media', () => {
  it('builds a safe screenshot filename for signal alerts', () => {
    const filename = buildSignalScreenshotFilename({
      chart: { chart_symbol: 'OANDA:XAUUSD', chart_resolution: '5' },
      signal: { detectorKey: 'money_printer', signalText: 'BUY' },
      date: new Date('2026-05-16T10:11:12.123Z'),
    });

    assert.equal(filename, 'signal_OANDA_XAUUSD_5_money_printer_2026-05-16T10-11-12-123Z');
  });

  it('truncates Telegram captions to the platform limit', () => {
    const caption = truncateTelegramCaption('x'.repeat(1100));
    assert.ok(caption.length <= 1024);
    assert.ok(caption.endsWith('...[cat bot]'));
  });

  it('sends a photo when chart capture succeeds', async () => {
    const calls = [];
    let removedFile = null;

    const result = await sendSignalNotification({
      config: {
        token: 'token',
        adminId: TEST_ADMIN_ID,
        signalMonitor: {
          screenshot: {
            enabled: true,
            region: 'chart',
            method: 'cdp',
            focus: 'latest',
            latestWidthRatio: 0.35,
            latestCropRatio: 0.72,
          },
        },
      },
      text: 'Tin hieu moi: GT',
      chart: { chart_symbol: 'OANDA:XAUUSD', chart_resolution: '5' },
      signal: { detectorKey: 'gann_gt', signalText: 'GT' },
      captureScreenshot: async (opts) => {
        calls.push(['capture', opts]);
        return { success: true, file_path: 'D:\\tmp\\signal.png' };
      },
      isReadableFile: async (filePath) => filePath === 'D:\\tmp\\signal.png',
      sendPhotoImpl: async (token, chatId, filePath, caption) => {
        calls.push(['photo', { token, chatId, filePath, caption }]);
      },
      sendMessageImpl: async () => {
        calls.push(['text']);
      },
      removeFileImpl: async (filePath) => {
        removedFile = filePath;
      },
      now: () => new Date('2026-05-16T10:11:12.123Z'),
      logger: { write() {} },
    });

    assert.equal(result.deliveredAs, 'photo');
    assert.deepEqual(calls[0], ['capture', {
      region: 'chart',
      method: 'cdp',
      filename: 'signal_OANDA_XAUUSD_5_gann_gt_2026-05-16T10-11-12-123Z',
      focus: {
        mode: 'latest',
        latestWidthRatio: 0.72,
      },
    }]);
    assert.equal(calls[1][0], 'photo');
    assert.equal(calls[1][1].chatId, TEST_ADMIN_ID);
    assert.equal(calls[1][1].filePath, 'D:\\tmp\\signal.png');
    assert.equal(calls[1][1].caption, 'Tin hieu moi: GT');
    assert.equal(removedFile, 'D:\\tmp\\signal.png');
  });

  it('falls back to text when chart capture fails', async () => {
    const calls = [];

    const result = await sendSignalNotification({
      config: {
        token: 'token',
        adminId: TEST_ADMIN_ID,
        signalMonitor: {
          screenshot: {
            enabled: true,
            region: 'chart',
            method: 'cdp',
            focus: 'latest',
            latestWidthRatio: 0.35,
            latestCropRatio: 0.72,
          },
        },
      },
      text: 'Tin hieu moi: BUY',
      chart: { chart_symbol: 'OANDA:XAUUSD', chart_resolution: '5' },
      signal: { detectorKey: 'money_printer', signalText: 'BUY' },
      captureScreenshot: async () => {
        throw new Error('capture failed');
      },
      isReadableFile: async () => false,
      sendPhotoImpl: async () => {
        calls.push('photo');
      },
      sendMessageImpl: async (token, chatId, text) => {
        calls.push({ token, chatId, text });
      },
      logger: { write() {} },
    });

    assert.equal(result.deliveredAs, 'text');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      token: 'token',
      chatId: TEST_ADMIN_ID,
      text: 'Tin hieu moi: BUY',
    });
  });

  it('temporarily zooms to the latest bars before capturing and restores range', async () => {
    const calls = [];

    const result = await sendSignalNotification({
      config: {
        token: 'token',
        adminId: TEST_ADMIN_ID,
        signalMonitor: {
          screenshot: {
            enabled: true,
            region: 'chart',
            method: 'cdp',
            focus: 'latest',
            latestWidthRatio: 0.5,
            latestCropRatio: 0.72,
          },
        },
      },
      text: 'Tin hieu moi: GT',
      chart: { chart_symbol: 'OANDA:XAUUSD', chart_resolution: '5' },
      signal: { detectorKey: 'gann_gt', signalText: 'GT' },
      getVisibleRangeImpl: async () => ({
        visible_range: { from: 1000, to: 2000 },
        bars_range: { from: 1200, to: 1900 },
      }),
      setVisibleRangeImpl: async ({ from, to }) => {
        calls.push(['range', { from, to }]);
      },
      captureScreenshot: async (opts) => {
        calls.push(['capture', opts]);
        return { success: true, file_path: 'D:\\tmp\\signal.png' };
      },
      isReadableFile: async () => true,
      sendPhotoImpl: async () => {
        calls.push(['photo']);
      },
      removeFileImpl: async () => {},
      now: () => new Date('2026-05-16T10:11:12.123Z'),
      logger: { write() {} },
    });

    assert.equal(result.deliveredAs, 'photo');
    assert.deepEqual(calls[0], ['range', { from: 1550, to: 1900 }]);
    assert.deepEqual(calls[1], ['capture', {
      region: 'chart',
      method: 'cdp',
      filename: 'signal_OANDA_XAUUSD_5_gann_gt_2026-05-16T10-11-12-123Z',
      focus: {
        mode: 'latest',
        latestWidthRatio: 0.72,
      },
    }]);
    assert.deepEqual(calls[2], ['range', { from: 1000, to: 2000 }]);
    assert.deepEqual(calls[3], ['photo']);
  });
});
