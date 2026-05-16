import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getConnectionConfig } from '../src/connection.js';

describe('connection config', () => {
  it('uses TV_CDP_HOST and TV_CDP_PORT from env', () => {
    const cfg = getConnectionConfig({ TV_CDP_HOST: 'host.docker.internal', TV_CDP_PORT: '9333' });
    assert.deepEqual(cfg, { host: 'host.docker.internal', port: 9333 });
  });

  it('falls back to localhost:9222', () => {
    const cfg = getConnectionConfig({});
    assert.deepEqual(cfg, { host: 'localhost', port: 9222 });
  });

  it('throws on invalid port', () => {
    assert.throws(() => getConnectionConfig({ TV_CDP_PORT: 'abc' }), /Invalid CDP port/);
  });
});
