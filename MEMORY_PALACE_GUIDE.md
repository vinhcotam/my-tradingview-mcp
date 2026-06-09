# Memory Palace Integration Guide

## Overview

Memory Palace (`mempalace`) has been integrated into the TradingView MCP Bridge to provide cryptographically signed visual memory for AI agents. This enables context persistence across sessions and agent handoffs.

## Features

- **Context Caching**: Automatically saves tool execution context with sanitization
- **Memory Recovery**: Retrieve previous execution states using short IDs
- **Automatic Cleanup**: TTL-based cache expiration and size limiting
- **Circular Reference Protection**: Safe serialization of complex objects
- **Data Truncation**: Prevents memory overflow by limiting array/string sizes

## Configuration

Set these environment variables to customize Memory Palace behavior:

```bash
# Enable/disable Memory Palace (default: true)
MEMORY_PALACE_ENABLED=true

# Maximum number of memories to keep in cache (default: 10)
MEMORY_PALACE_MAX=10

# Cache TTL in seconds (default: 300 = 5 minutes)
MEMORY_PALACE_TTL=300
```

## Usage

### Automatic Context Saving

All tools wrapped with `safeTool()` or `safeToolWithMeta()` automatically save their execution context to Memory Palace:

```javascript
import { safeTool } from './src/core/safeTool.js';

const getOhlcvHandler = safeTool(async (params) => {
  const data = await data.getOhlcv(params);
  return data;
});

// Result will include a memory_id for future reference
// { success: true, bars: [...], memory_id: "mp_xxxxx" }
```

### Manual Context Management

```javascript
import { memory } from 'tradingview-mcp/core';

// Save custom context
const memoryId = await memory.saveContext('custom_operation', {
  params: { symbol: 'BTCUSD' },
  metadata: { user: 'trader123' }
});

// Recover context later
const context = await memory.recoverContext(memoryId);

// List recent memories
const recentMemories = await memory.listRecentMemories(5);

// Get cache statistics
const stats = memory.getCacheStats();
console.log(stats);
// { total: 5, valid: 4, expired: 1, enabled: true, ... }
```

## Memory Sanitization

Data saved to Memory Palace is automatically sanitized:

- **Arrays > 50 items**: Truncated to first 10 items with count metadata
- **Strings > 500 chars**: Truncated with "...[truncated]" suffix
- **Circular references**: Replaced with "[Circular Reference]" marker
- **Functions/undefined**: Skipped entirely

Example:
```javascript
// Before sanitization
{
  bars: [/* 1000 bar objects */],
  description: "Very long string..." // 2000 chars
}

// After sanitization
{
  bars: {
    _truncated: true,
    count: 1000,
    sample: [/* first 10 bars */]
  },
  description: "Very long string...[truncated]"
}
```

## CLI Commands

Memory Palace provides CLI commands for manual operations:

```bash
# List recent memories
npx mempalace list --limit 10

# Recover a specific memory
npx mempalace recover <short_id>

# Save memory from JSON file
npx mempalace save ./context.json

# Verify memory signature
npx mempalace verify <short_id>

# Start MCP server for Memory Palace
npx mempalace mcp
```

## Use Cases

### 1. Session Continuity
Save chart analysis state between agent sessions:
```javascript
const analysisState = {
  symbol: 'BTCUSD',
  timeframe: '1h',
  indicators: ['RSI', 'MACD'],
  lastPrice: 45000
};

const memoryId = await memory.saveContext('chart_analysis', analysisState);
// Later: const state = await memory.recoverContext(memoryId);
```

### 2. Debugging & Audit Trail
Track tool executions for debugging:
```javascript
// Each tool call automatically gets a memory_id
// Review execution history:
const history = await memory.listRecentMemories(20);
```

### 3. Multi-Agent Collaboration
Share context between different AI agents:
```javascript
// Agent A saves context
const memoryId = await memory.saveContext('strategy_backtest', results);

// Share memoryId with Agent B
// Agent B recovers context
const results = await memory.recoverContext(memoryId);
```

## Performance Considerations

- **Cache Hit Rate**: Check `getCacheStats()` to monitor effectiveness
- **Memory Limits**: Default max 10 memories, adjust via `MEMORY_PALACE_MAX`
- **TTL Tuning**: Shorter TTL for high-frequency operations, longer for important state
- **Disable if Unneeded**: Set `MEMORY_PALACE_ENABLED=false` for minimal overhead

## Troubleshooting

### Memory Palace not saving contexts
1. Check `MEMORY_PALACE_ENABLED` is not set to 'false'
2. Verify mempalace package is installed: `npm list mempalace`
3. Check console logs for `[MemoryPalace] Failed to save context` errors

### Cache growing too large
1. Reduce `MEMORY_PALACE_MAX` value
2. Shorten `MEMORY_PALACE_TTL`
3. Manually clear: restart the application

### Circular reference errors
The sanitization layer should handle these automatically. If issues persist:
1. Check for unusual object structures in tool results
2. Enable debug logging to see what's being saved

## Best Practices

1. **Use Descriptive Tool Names**: Helps identify context source when reviewing memories
2. **Keep Contexts Focused**: Save only relevant data, not entire state trees
3. **Monitor Cache Stats**: Regularly check `getCacheStats()` in production
4. **Set Appropriate TTLs**: Balance between persistence and memory usage
5. **Leverage Auto-Sanitization**: Don't manually truncate large datasets

## API Reference

### `memory.saveContext(toolName, context)`
Save execution context to Memory Palace.
- **Returns**: `Promise<string|null>` - Short ID or null if failed

### `memory.recoverContext(shortId)`
Recover context from Memory Palace.
- **Returns**: `Promise<object|null>` - Context data or null if not found

### `memory.listRecentMemories(limit)`
List recent memories.
- **Returns**: `Promise<Array>` - List of memory entries

### `memory.getCacheStats()`
Get cache statistics.
- **Returns**: `Object` - Stats including total, valid, expired counts

### `getMemoryStats()` (from safeTool)
Alias for `memory.getCacheStats()`.

## Migration Guide

If you're upgrading from a version without Memory Palace:

1. **No Breaking Changes**: Existing code continues to work
2. **Optional Feature**: Disable with `MEMORY_PALACE_ENABLED=false` if needed
3. **Gradual Adoption**: Tools automatically gain memory features via `safeTool()` wrapper
4. **Review Logs**: Check for any `[MemoryPalace]` warnings during initial runs

## Security Notes

- Memories are cryptographically signed for integrity
- Sensitive data should still be excluded before saving
- Memory Palace does not encrypt data at rest by default
- Use secure storage for production deployments

---

For more information about Memory Palace, visit: https://github.com/mempalace/mempalace
