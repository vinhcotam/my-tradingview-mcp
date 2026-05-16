import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { waitForChartReady } from '../src/wait.js';

describe('waitForChartReady()', () => {
  it('matches prefixed symbols and normalized timeframe via chart API state', async () => {
    let reads = 0;
    const evaluate = async () => {
      reads++;
      return {
        isLoading: false,
        barCount: 250,
        currentSymbol: 'BATS:AAPL',
        currentResolution: '1D',
      };
    };

    const ready = await waitForChartReady('AAPL', 'D', 1000, { evaluate });
    assert.equal(ready, true);
    assert.ok(reads >= 3, 'waits for stable bar count before succeeding');
  });

  it('returns false when expected symbol never matches', async () => {
    const evaluate = async () => ({
      isLoading: false,
      barCount: 250,
      currentSymbol: 'OANDA:XAUUSD',
      currentResolution: '5',
    });

    const ready = await waitForChartReady('AAPL', null, 450, { evaluate });
    assert.equal(ready, false);
  });
});
