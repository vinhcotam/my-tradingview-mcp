import { register } from '../router.js';
import * as core from '../../core/batch.js';

register('batch', {
  description: 'Run an action across multiple symbols and/or timeframes',
  options: {
    symbols: { type: 'string', short: 's', description: 'Comma-separated symbols, e.g. ES1!,NQ1!,YM1!' },
    timeframes: { type: 'string', short: 't', description: 'Comma-separated timeframes, e.g. 5,15,D' },
    action: { type: 'string', short: 'a', description: 'Action: screenshot, get_ohlcv, get_strategy_results' },
    delay: { type: 'string', short: 'd', description: 'Delay between iterations in ms (default 2000)' },
    count: { type: 'string', short: 'n', description: 'Bar count for get_ohlcv (default 100, max 500)' },
  },
  handler: (opts) => {
    if (!opts.symbols) {
      throw new Error('Symbols are required. Usage: tv batch --symbols "ES1!,NQ1!" --action screenshot');
    }
    if (!opts.action) {
      throw new Error('Action is required. Usage: tv batch --symbols "ES1!,NQ1!" --action screenshot');
    }

    return core.batchRun({
      symbols: opts.symbols.split(',').map((item) => item.trim()).filter(Boolean),
      timeframes: opts.timeframes ? opts.timeframes.split(',').map((item) => item.trim()).filter(Boolean) : undefined,
      action: opts.action,
      delay_ms: opts.delay ? Number(opts.delay) : undefined,
      ohlcv_count: opts.count ? Number(opts.count) : undefined,
    });
  },
});
