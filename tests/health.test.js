import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { findWindowsAppxBinary, getWindowsAppxInfo } from '../src/core/health.js';

describe('health launch detection', () => {
  it('reads Windows AppX launch metadata', () => {
    const expected = {
      binaryPath: 'C:\\Program Files\\WindowsApps\\TradingView.Desktop_3.1.0.7818_x64__n534cwy3pjxzj\\TradingView.exe',
      appId: 'TradingView.Desktop_n534cwy3pjxzj!TradingView.Desktop',
    };
    const actual = getWindowsAppxInfo({
      execSyncFn: () => Buffer.from(`${JSON.stringify(expected)}\r\n`),
      existsSyncFn: (path) => path === expected.binaryPath,
    });
    assert.deepEqual(actual, expected);
  });

  it('finds TradingView installed via Windows AppX', () => {
    const expected = 'C:\\Program Files\\WindowsApps\\TradingView.Desktop_3.1.0.7818_x64__n534cwy3pjxzj\\TradingView.exe';
    const actual = findWindowsAppxBinary({
      execSyncFn: () => Buffer.from(`${JSON.stringify({ binaryPath: expected, appId: 'TradingView.Desktop_n534cwy3pjxzj!TradingView.Desktop' })}\r\n`),
      existsSyncFn: (path) => path === expected,
    });
    assert.equal(actual, expected);
  });

  it('returns null when the AppX path does not exist', () => {
    const actual = findWindowsAppxBinary({
      execSyncFn: () => Buffer.from('{"binaryPath":"C:\\\\Program Files\\\\WindowsApps\\\\TradingView.Desktop_fake\\\\TradingView.exe","appId":"TradingView.Desktop_fake!TradingView.Desktop"}\r\n'),
      existsSyncFn: () => false,
    });
    assert.equal(actual, null);
  });
});
