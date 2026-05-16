import { buildToolAliasHelpText, normalizeLegacyTvArgs, resolveToolAliasCommand } from './tool-aliases.js';

const HELP_TEXT = buildToolAliasHelpText();

export function tokenizeCommandLine(input) {
  const text = String(input || '').trim();
  if (!text) return [];

  const tokens = [];
  let current = '';
  let quote = null;
  let escaped = false;

  for (const ch of text) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }

  if (escaped) current += '\\';
  if (quote) throw new Error('Chuỗi có dấu nháy chưa được đóng.');
  if (current) tokens.push(current);
  return tokens;
}

export function parseTelegramCommand(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { type: 'help', message: HELP_TEXT };

  if (/^tv\s+/i.test(trimmed)) {
    return parseTvPayload(trimmed.slice(3).trim());
  }

  if (!trimmed.startsWith('/')) {
    return { type: 'help', message: HELP_TEXT };
  }

  const firstSpace = trimmed.indexOf(' ');
  const rawCommand = (firstSpace === -1 ? trimmed.slice(1) : trimmed.slice(1, firstSpace)).toLowerCase();
  const command = rawCommand.split('@')[0];
  const rest = firstSpace === -1 ? '' : trimmed.slice(firstSpace + 1).trim();

  if (command === 'start' || command === 'help') {
    return { type: 'help', message: HELP_TEXT };
  }
  if (command === 'status') {
    return { type: 'tv', args: ['status'] };
  }
  if (command === 'quote') {
    return { type: 'tv', args: ['quote'] };
  }
  if (command === 'launch') {
    return { type: 'tv', args: ['launch'] };
  }
  if (command === 'screenshot') {
    const args = ['screenshot'];
    const region = rest || 'chart';
    args.push('--region', region);
    return { type: 'tv', args };
  }
  if (command === 'monitor') {
    const action = (rest || 'status').toLowerCase();
    if (['status', 'on', 'off', 'reset'].includes(action)) {
      return { type: 'monitor', action };
    }
    return { type: 'help', message: HELP_TEXT };
  }
  if (command === 'news') {
    const action = (rest || 'today').toLowerCase();
    if (['today', 'status', 'on', 'off', 'reset'].includes(action)) {
      return { type: 'news', action };
    }
    return { type: 'help', message: HELP_TEXT };
  }
  if (command === 'tv') {
    return parseTvPayload(rest);
  }

  const toolAlias = resolveToolAliasCommand(command, rest, tokenizeCommandLine);
  if (toolAlias) return toolAlias;

  return { type: 'help', message: HELP_TEXT };
}

function parseTvPayload(payload) {
  const args = normalizeLegacyTvArgs(tokenizeCommandLine(payload));
  if (args.length === 0) {
    return { type: 'help', message: HELP_TEXT };
  }
  return { type: 'tv', args };
}

export function isAuthorizedUser(update, adminId) {
  const userId = update?.message?.from?.id ?? update?.callback_query?.from?.id;
  return String(userId || '') === String(adminId);
}

export function getHelpText() {
  return HELP_TEXT;
}
