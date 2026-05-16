function translateOptionTokens(tokens, optionMap = {}) {
  const result = [];

  for (const token of tokens) {
    if (!token.startsWith('--')) {
      result.push(token);
      continue;
    }

    const trimmed = token.slice(2);
    const eqIndex = trimmed.indexOf('=');
    const rawName = eqIndex === -1 ? trimmed : trimmed.slice(0, eqIndex);
    const rawValue = eqIndex === -1 ? null : trimmed.slice(eqIndex + 1);
    const mappedName = optionMap[rawName] || optionMap[rawName.replace(/-/g, '_')] || rawName;

    if (rawValue == null) {
      result.push(`--${mappedName}`);
      continue;
    }

    result.push(`--${mappedName}=${rawValue}`);
  }

  return result;
}

function captureRegionShortcut(tokens) {
  if (tokens.length === 0) return ['--region', 'chart'];
  if (tokens[0].startsWith('-')) return tokens;
  return ['--region', tokens[0], ...tokens.slice(1)];
}

function buildDirectAlias(baseArgs, {
  optionMap,
  normalizeTokens,
  stdin = false,
} = {}) {
  return (rest, tokenizeCommandLine) => {
    if (stdin) {
      const source = String(rest || '').trim();
      if (!source) return null;
      return { type: 'tv', args: [...baseArgs], stdin: source };
    }

    let tokens = tokenizeCommandLine(rest || '');
    if (normalizeTokens) tokens = normalizeTokens(tokens);
    tokens = translateOptionTokens(tokens, optionMap);
    return { type: 'tv', args: [...baseArgs, ...tokens] };
  };
}

function buildLegacyTvCompatibility(args) {
  if (args[0] === 'data' && ['quote', 'ohlcv', 'values'].includes(args[1])) {
    return [args[1], ...args.slice(2)];
  }
  return args;
}

const TOOL_ALIAS_GROUPS = [
  {
    title: 'Chart và dữ liệu',
    lines: [
      '/tv_health_check',
      '/tv_launch [--port 9222] [--no_kill]',
      '/chart_get_state',
      '/chart_set_symbol OANDA:XAUUSD',
      '/chart_set_timeframe 5',
      '/chart_set_type Candles',
      '/chart_scroll_to_date 2025-01-15',
      '/chart_get_visible_range',
      '/chart_set_visible_range --from 1735689600 --to 1735776000',
      '/quote_get [symbol]',
      '/data_get_ohlcv [--count 100] [--summary]',
      '/data_get_study_values',
      '/data_get_pine_lines [--study_filter Profiler]',
      '/data_get_pine_labels [--study_filter TuanAnh_Gann_Final] [--max_labels 50]',
      '/data_get_pine_tables [--study_filter Profiler]',
      '/data_get_pine_boxes [--study_filter Profiler]',
      '/data_get_indicator <entity_id>',
      '/data_get_strategy_results',
      '/data_get_trades [--max 20]',
      '/data_get_equity',
      '/depth_get',
      '/symbol_info',
      '/symbol_search AAPL [--type stock]',
      '/capture_screenshot [full|chart|strategy_tester]',
      '/batch_run --symbols "ES1!,NQ1!" --timeframes "5,15" --action screenshot',
    ],
  },
  {
    title: 'Indicator, cảnh báo và vẽ',
    lines: [
      '/chart_manage_indicator add "Relative Strength Index"',
      '/chart_manage_indicator remove <entity_id>',
      '/indicator_set_inputs <entity_id> --inputs \'{"length":50}\'',
      '/indicator_toggle_visibility <entity_id> [--visible|--hidden]',
      '/draw_shape --type horizontal_line --time 1778813400 --price 4618.9',
      '/draw_list',
      '/draw_get_properties <entity_id>',
      '/draw_remove_one <entity_id>',
      '/draw_clear',
      '/alert_create --price 4675 --condition crossing --message "Test"',
      '/alert_list',
      '/alert_delete --all',
      '/watchlist_get',
      '/watchlist_add AAPL',
    ],
  },
  {
    title: 'Pine Script',
    lines: [
      '/pine_get_source',
      '/pine_set_source <source>',
      '/pine_smart_compile',
      '/pine_compile',
      '/pine_get_errors',
      '/pine_get_console',
      '/pine_new indicator',
      '/pine_open "My Script"',
      '/pine_save',
      '/pine_list_scripts',
      '/pine_analyze <source>',
      '/pine_check <source>',
    ],
  },
  {
    title: 'Replay, UI, layout và tab',
    lines: [
      '/replay_start [--date 2025-03-01]',
      '/replay_step',
      '/replay_autoplay [--speed 300]',
      '/replay_trade buy|sell|close',
      '/replay_status',
      '/replay_stop',
      '/ui_open_panel watchlist open',
      '/ui_click --by text --value Indicators',
      '/ui_hover --by aria-label --value Alerts',
      '/ui_find_element Indicators [--strategy text]',
      '/ui_keyboard Escape [--ctrl] [--shift] [--alt] [--meta]',
      '/ui_type_text "hello"',
      '/ui_scroll down [--amount 300]',
      '/ui_mouse_click 400 400 [--right] [--double_click]',
      '/ui_evaluate "1+1"',
      '/ui_fullscreen',
      '/layout_list',
      '/layout_switch "My Layout"',
      '/pane_list',
      '/pane_set_layout 4',
      '/pane_focus 0',
      '/pane_set_symbol 1 ES1!',
      '/tab_list',
      '/tab_new',
      '/tab_close',
      '/tab_switch 0',
      '/tv_discover',
      '/tv_ui_state',
    ],
  },
];

const TOOL_ALIAS_RESOLVERS = new Map([
  ['tv_health_check', buildDirectAlias(['status'])],
  ['tv_launch', buildDirectAlias(['launch'], { optionMap: { no_kill: 'no-kill' } })],
  ['chart_get_state', buildDirectAlias(['state'])],
  ['chart_set_symbol', buildDirectAlias(['symbol'])],
  ['chart_set_timeframe', buildDirectAlias(['timeframe'])],
  ['chart_set_type', buildDirectAlias(['type'], { optionMap: { chart_type: 'chart_type' } })],
  ['chart_scroll_to_date', buildDirectAlias(['scroll'])],
  ['chart_get_visible_range', buildDirectAlias(['range'])],
  ['chart_set_visible_range', buildDirectAlias(['range'])],
  ['chart_manage_indicator', (rest, tokenizeCommandLine) => {
    const tokens = tokenizeCommandLine(rest || '');
    if (tokens.length === 0) return null;
    const action = tokens[0].toLowerCase();
    if (action === 'add') {
      return {
        type: 'tv',
        args: ['indicator', 'add', ...translateOptionTokens(tokens.slice(1), { inputs: 'inputs' })],
      };
    }
    if (action === 'remove') {
      return { type: 'tv', args: ['indicator', 'remove', ...tokens.slice(1)] };
    }
    return null;
  }],
  ['quote_get', buildDirectAlias(['quote'])],
  ['data_get_ohlcv', buildDirectAlias(['ohlcv'])],
  ['data_get_study_values', buildDirectAlias(['values'])],
  ['data_get_pine_lines', buildDirectAlias(['data', 'lines'], { optionMap: { study_filter: 'filter' } })],
  ['data_get_pine_labels', buildDirectAlias(['data', 'labels'], { optionMap: { study_filter: 'filter', max_labels: 'max' } })],
  ['data_get_pine_tables', buildDirectAlias(['data', 'tables'], { optionMap: { study_filter: 'filter' } })],
  ['data_get_pine_boxes', buildDirectAlias(['data', 'boxes'], { optionMap: { study_filter: 'filter' } })],
  ['data_get_indicator', (rest, tokenizeCommandLine) => {
    const tokens = tokenizeCommandLine(rest || '');
    if (tokens.length === 0) return null;
    return { type: 'tv', args: ['data', 'indicator', ...tokens] };
  }],
  ['data_get_strategy_results', buildDirectAlias(['data', 'strategy'])],
  ['data_get_trades', buildDirectAlias(['data', 'trades'])],
  ['data_get_equity', buildDirectAlias(['data', 'equity'])],
  ['depth_get', buildDirectAlias(['data', 'depth'])],
  ['symbol_info', buildDirectAlias(['info'])],
  ['symbol_search', buildDirectAlias(['search'])],
  ['capture_screenshot', buildDirectAlias(['screenshot'], {
    optionMap: { filename: 'output' },
    normalizeTokens: captureRegionShortcut,
  })],
  ['batch_run', buildDirectAlias(['batch'], {
    optionMap: { delay_ms: 'delay', ohlcv_count: 'count' },
  })],
  ['indicator_set_inputs', (rest, tokenizeCommandLine) => {
    const tokens = tokenizeCommandLine(rest || '');
    if (tokens.length === 0) return null;
    return {
      type: 'tv',
      args: ['indicator', 'set', ...translateOptionTokens(tokens, { entity_id: 'entity_id', inputs: 'inputs' })],
    };
  }],
  ['indicator_toggle_visibility', (rest, tokenizeCommandLine) => {
    const tokens = tokenizeCommandLine(rest || '');
    if (tokens.length === 0) return null;
    return {
      type: 'tv',
      args: ['indicator', 'toggle', ...translateOptionTokens(tokens, { hidden: 'hidden', visible: 'visible' })],
    };
  }],
  ['draw_shape', buildDirectAlias(['draw', 'shape'], { optionMap: { shape: 'type' } })],
  ['draw_list', buildDirectAlias(['draw', 'list'])],
  ['draw_get_properties', (rest, tokenizeCommandLine) => {
    const tokens = tokenizeCommandLine(rest || '');
    if (tokens.length === 0) return null;
    return { type: 'tv', args: ['draw', 'get', ...tokens] };
  }],
  ['draw_remove_one', (rest, tokenizeCommandLine) => {
    const tokens = tokenizeCommandLine(rest || '');
    if (tokens.length === 0) return null;
    return { type: 'tv', args: ['draw', 'remove', ...tokens] };
  }],
  ['draw_clear', buildDirectAlias(['draw', 'clear'])],
  ['alert_create', buildDirectAlias(['alert', 'create'])],
  ['alert_list', buildDirectAlias(['alert', 'list'])],
  ['alert_delete', buildDirectAlias(['alert', 'delete'], { optionMap: { delete_all: 'all' } })],
  ['watchlist_get', buildDirectAlias(['watchlist', 'get'])],
  ['watchlist_add', buildDirectAlias(['watchlist', 'add'])],
  ['pine_get_source', buildDirectAlias(['pine', 'get'])],
  ['pine_set_source', buildDirectAlias(['pine', 'set'], { stdin: true })],
  ['pine_smart_compile', buildDirectAlias(['pine', 'compile'])],
  ['pine_compile', buildDirectAlias(['pine', 'raw-compile'])],
  ['pine_get_errors', buildDirectAlias(['pine', 'errors'])],
  ['pine_get_console', buildDirectAlias(['pine', 'console'])],
  ['pine_new', buildDirectAlias(['pine', 'new'])],
  ['pine_open', buildDirectAlias(['pine', 'open'])],
  ['pine_save', buildDirectAlias(['pine', 'save'])],
  ['pine_list_scripts', buildDirectAlias(['pine', 'list'])],
  ['pine_analyze', buildDirectAlias(['pine', 'analyze'], { stdin: true })],
  ['pine_check', buildDirectAlias(['pine', 'check'], { stdin: true })],
  ['replay_start', buildDirectAlias(['replay', 'start'])],
  ['replay_step', buildDirectAlias(['replay', 'step'])],
  ['replay_autoplay', buildDirectAlias(['replay', 'autoplay'])],
  ['replay_trade', buildDirectAlias(['replay', 'trade'])],
  ['replay_status', buildDirectAlias(['replay', 'status'])],
  ['replay_stop', buildDirectAlias(['replay', 'stop'])],
  ['ui_open_panel', buildDirectAlias(['ui', 'panel'])],
  ['ui_click', buildDirectAlias(['ui', 'click'])],
  ['ui_hover', buildDirectAlias(['ui', 'hover'])],
  ['ui_find_element', buildDirectAlias(['ui', 'find'])],
  ['ui_keyboard', buildDirectAlias(['ui', 'keyboard'])],
  ['ui_type_text', buildDirectAlias(['ui', 'type'])],
  ['ui_scroll', buildDirectAlias(['ui', 'scroll'])],
  ['ui_mouse_click', buildDirectAlias(['ui', 'mouse'], { optionMap: { double_click: 'double' } })],
  ['ui_evaluate', buildDirectAlias(['ui', 'eval'])],
  ['ui_fullscreen', buildDirectAlias(['ui', 'fullscreen'])],
  ['layout_list', buildDirectAlias(['layout', 'list'])],
  ['layout_switch', buildDirectAlias(['layout', 'switch'])],
  ['pane_list', buildDirectAlias(['pane', 'list'])],
  ['pane_set_layout', buildDirectAlias(['pane', 'layout'])],
  ['pane_focus', buildDirectAlias(['pane', 'focus'])],
  ['pane_set_symbol', buildDirectAlias(['pane', 'symbol'])],
  ['tab_list', buildDirectAlias(['tab', 'list'])],
  ['tab_new', buildDirectAlias(['tab', 'new'])],
  ['tab_close', buildDirectAlias(['tab', 'close'])],
  ['tab_switch', buildDirectAlias(['tab', 'switch'])],
  ['tv_discover', buildDirectAlias(['discover'])],
  ['tv_ui_state', buildDirectAlias(['ui-state'])],
]);

export function buildToolAliasHelpText() {
  const lines = [
    'Bot Telegram cho TradingView',
    '',
    'Lệnh nhanh:',
    '/status - kiểm tra kết nối CDP',
    '/quote - lấy báo giá hiện tại',
    '/launch - mở TradingView với CDP',
    '/screenshot [full|chart|strategy_tester] - chụp ảnh chart',
    '/monitor [status|on|off|reset] - điều khiển bộ theo dõi tín hiệu',
    '/news [today|status|on|off|reset] - cảnh báo tin đỏ trong ngày',
    '/tv <command> - chạy trực tiếp lệnh CLI hiện có',
    '',
    'Bot cũng hỗ trợ alias theo đúng tên tool trong CLAUDE.md:',
  ];

  for (const group of TOOL_ALIAS_GROUPS) {
    lines.push('');
    lines.push(`${group.title}:`);
    lines.push(...group.lines);
  }

  lines.push('');
  lines.push('Ví dụ nhanh:');
  lines.push('/data_get_study_values');
  lines.push('/data_get_pine_labels --study_filter "TuanAnh_Gann_Final" --max_labels 20');
  lines.push('/chart_set_symbol OANDA:XAUUSD');
  lines.push('/alert_create --price 4675 --condition crossing --message "Test"');
  lines.push('/capture_screenshot chart');
  lines.push('/news today');
  lines.push('/news status');
  lines.push('/tv values');

  return lines.join('\n');
}

export function resolveToolAliasCommand(command, rest, tokenizeCommandLine) {
  const resolver = TOOL_ALIAS_RESOLVERS.get(String(command || '').toLowerCase());
  if (!resolver) return null;
  return resolver(rest, tokenizeCommandLine);
}

export function normalizeLegacyTvArgs(args) {
  return buildLegacyTvCompatibility(args);
}
