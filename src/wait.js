import { evaluate as _evaluate } from './connection.js';

const DEFAULT_TIMEOUT = 10000;
const POLL_INTERVAL = 200;

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase().split(':').pop();
}

function normalizeResolution(resolution) {
  const raw = String(resolution || '').trim().toUpperCase();
  if (raw === '1D' || raw === 'D') return 'D';
  if (raw === '1W' || raw === 'W') return 'W';
  if (raw === '1M' || raw === 'M') return 'M';
  return raw;
}

export async function waitForChartReady(expectedSymbol = null, expectedTf = null, timeout = DEFAULT_TIMEOUT, _deps = {}) {
  const evaluate = _deps.evaluate || _evaluate;
  const start = Date.now();
  let lastBarCount = -1;
  let stableCount = 0;

  while (Date.now() - start < timeout) {
    const state = await evaluate(`
      (function() {
        // Check for loading spinner
        var spinner = document.querySelector('[class*="loader"]')
          || document.querySelector('[class*="loading"]')
          || document.querySelector('[data-name="loading"]');
        var isLoading = spinner && spinner.offsetParent !== null;

        var chart = null;
        try {
          var active = window.TradingViewApi && window.TradingViewApi._activeChartWidgetWV;
          chart = active && typeof active.value === 'function' ? active.value() : null;
        } catch {}

        // Try to get bar count from chart API first, then DOM fallback
        var barCount = -1;
        try {
          if (chart && chart._chartWidget && chart._chartWidget.model) {
            var barsApi = chart._chartWidget.model().mainSeries().bars();
            if (barsApi && typeof barsApi.firstIndex === 'function' && typeof barsApi.lastIndex === 'function') {
              barCount = Math.max(0, barsApi.lastIndex() - barsApi.firstIndex() + 1);
            }
          }
        } catch {}
        if (barCount < 0) {
          try {
            var bars = document.querySelectorAll('[class*="bar"]');
            barCount = bars.length;
          } catch {}
        }

        var currentSymbol = '';
        var currentResolution = '';
        try {
          if (chart) {
            currentSymbol = chart.symbol() || '';
            currentResolution = chart.resolution() || '';
          }
        } catch {}

        // DOM fallback when chart API data is not yet readable
        var symbolEl = document.querySelector('[data-name="legend-source-title"]')
          || document.querySelector('[class*="title"] [class*="apply-common-tooltip"]');
        if (!currentSymbol) currentSymbol = symbolEl ? symbolEl.textContent.trim() : '';

        return {
          isLoading: !!isLoading,
          barCount: barCount,
          currentSymbol: currentSymbol,
          currentResolution: currentResolution,
        };
      })()
    `);

    if (!state) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      continue;
    }

    // Not ready if still loading
    if (state.isLoading) {
      stableCount = 0;
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      continue;
    }

    // Check symbol match if expected
    if (expectedSymbol && state.currentSymbol) {
      const currentSymbol = normalizeSymbol(state.currentSymbol);
      const expected = normalizeSymbol(expectedSymbol);
      if (currentSymbol !== expected) {
        stableCount = 0;
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        continue;
      }
    }

    if (expectedTf && state.currentResolution) {
      const currentResolution = normalizeResolution(state.currentResolution);
      const expectedResolution = normalizeResolution(expectedTf);
      if (currentResolution !== expectedResolution) {
        stableCount = 0;
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        continue;
      }
    }

    // Check bar count stability
    if (state.barCount === lastBarCount && state.barCount > 0) {
      stableCount++;
    } else {
      stableCount = 0;
    }
    lastBarCount = state.barCount;

    if (stableCount >= 2) {
      return true;
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }

  // Timeout — return true anyway, caller should verify
  return false;
}
