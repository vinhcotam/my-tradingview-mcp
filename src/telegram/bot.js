import { loadTelegramConfig } from './config.js';
import { parseTelegramCommand, isAuthorizedUser, getHelpText } from './command.js';
import { runTvCommand, isReadableFile, formatTvResult, screenshotCaption } from './tv.js';
import { TelegramSignalMonitor, formatMonitorStatus, formatSignalAlert } from './monitor.js';
import { localizeErrorMessage } from './text.js';
import { captureScreenshot } from '../core/capture.js';
import { getVisibleRange, setVisibleRange } from '../core/chart.js';
import {
  getUpdates,
  deleteWebhook,
  sendMessage,
  sendPhoto,
  sendSignalNotification,
} from './api.js';

async function handleMessage(config, message, monitor) {
  const chatId = message.chat.id;
  if (!isAuthorizedUser({ message }, config.adminId)) {
    await sendMessage(config.token, chatId, 'Bạn không có quyền sử dụng bot này.');
    return;
  }

  let parsed;
  try {
    parsed = parseTelegramCommand(message.text || '');
  } catch (err) {
    await sendMessage(config.token, chatId, `Không thể phân tích lệnh: ${localizeErrorMessage(err.message)}`);
    return;
  }

  if (parsed.type === 'help') {
    await sendMessage(config.token, chatId, parsed.message || getHelpText());
    return;
  }

  if (parsed.type === 'monitor') {
    if (parsed.action === 'status') {
      await sendMessage(config.token, chatId, formatMonitorStatus(monitor.getStatus()));
      return;
    }
    if (parsed.action === 'on') {
      config.signalMonitor.enabled = true;
      await monitor.start();
      await sendMessage(config.token, chatId, formatMonitorStatus(monitor.getStatus()));
      return;
    }
    if (parsed.action === 'off') {
      config.signalMonitor.enabled = false;
      await monitor.stop();
      await sendMessage(config.token, chatId, formatMonitorStatus(monitor.getStatus()));
      return;
    }
    if (parsed.action === 'reset') {
      monitor.resetBaseline('telegram-command');
      await sendMessage(config.token, chatId, formatMonitorStatus(monitor.getStatus()));
      return;
    }
  }

  const result = await runTvCommand({ args: parsed.args, stdin: parsed.stdin });
  if (result?.success && typeof result.file_path === 'string' && await isReadableFile(result.file_path)) {
    await sendPhoto(config.token, chatId, result.file_path, screenshotCaption(parsed.args, result));
    await sendMessage(config.token, chatId, formatTvResult(parsed.args, result));
    return;
  }

  await sendMessage(config.token, chatId, formatTvResult(parsed.args, result));
}

async function main() {
  const config = loadTelegramConfig();
  let offset = 0;
  const monitor = new TelegramSignalMonitor({
    config,
    sendMessage,
    sendSignalNotification: ({ chart, signal }) => sendSignalNotification({
      config,
      text: formatSignalAlert({ chart, signal }),
      chart,
      signal,
      logger: process.stderr,
      captureScreenshot,
      isReadableFile,
      getVisibleRangeImpl: getVisibleRange,
      setVisibleRangeImpl: setVisibleRange,
    }),
  });

  process.stderr.write('Telegram bot started.\n');
  process.stderr.write('Only the configured admin user can execute commands.\n');
  process.stderr.write(`CDP target: ${process.env.TV_CDP_HOST || 'localhost'}:${process.env.TV_CDP_PORT || '9222'}\n`);

  await deleteWebhook(config.token);
  if (config.signalMonitor.enabled) {
    await monitor.start();
  }

  for (;;) {
    try {
      const updates = await getUpdates(config.token, offset, config.pollTimeoutSeconds);
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message?.text) {
          await handleMessage(config, update.message, monitor);
        }
      }
    } catch (err) {
      process.stderr.write(`telegram-bot error: ${err.message}\n`);
      await new Promise((resolve) => setTimeout(resolve, config.retryDelayMs));
    }
  }
}

await main();
