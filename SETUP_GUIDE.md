# Setup Guide for Claude Code

This file is a step-by-step guide for Claude Code (or any LLM agent) to install and configure the TradingView MCP server. If a user asks you to install or set up this project, follow these steps exactly.

For Codex users, prefer `codex mcp add tradingview -- node <INSTALL_PATH>/src/server.js` instead of editing Claude's `~/.claude/.mcp.json`.

For Telegram control, use environment variables for `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ADMIN_ID`; do not hardcode bot secrets into tracked files.

For automatic Telegram alerts, enable `TELEGRAM_SIGNAL_MONITOR_ENABLED=true` and point the bot at a chart where the target indicators are visible.
Signal alerts can attach a fresh chart screenshot. The default is `TELEGRAM_SIGNAL_MONITOR_SEND_CHART=true` with `TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_REGION=chart`.
The default focus mode is `TELEGRAM_SIGNAL_MONITOR_SCREENSHOT_FOCUS=latest`, which temporarily zooms into the newest candles, crops slightly toward the latest bars, takes the alert screenshot, then restores the previous range.

Money Printer `BUY/SELL` alerts are confirmed only after the signal candle closes. This avoids intrabar flicker alerts that can disappear before the bar is complete.

For red-news warnings, enable `TELEGRAM_RED_NEWS_ENABLED=true`. The bot will read TradingView's economic calendar feed, send a summary of remaining high-impact events for the local day, and remind before each event. By default it infers relevant countries from the current chart symbol; you can override that with `TELEGRAM_RED_NEWS_COUNTRIES=US,EU`.

## Step 1: Clone and Install

```bash
git clone https://github.com/tradesdontlie/tradingview-mcp.git ~/tradingview-mcp
cd ~/tradingview-mcp
npm install
```

If the user specifies a different install path, use that instead of `~/tradingview-mcp`.

## Step 2: Add to MCP Config

Add the server to the user's Claude Code MCP configuration. The config file is at `~/.claude/.mcp.json` (global) or `.mcp.json` (project-level).

```json
{
  "mcpServers": {
    "tradingview": {
      "command": "node",
      "args": ["<INSTALL_PATH>/src/server.js"]
    }
  }
}
```

Replace `<INSTALL_PATH>` with the actual path where the repo was cloned (e.g., `/Users/username/tradingview-mcp`).

If the config file already exists and has other servers, merge the `tradingview` entry into the existing `mcpServers` object. Do not overwrite other servers.

For Codex, use:

```bash
codex mcp add tradingview -- node <INSTALL_PATH>/src/server.js
codex mcp list
codex mcp get tradingview
```

## Step 3: Launch TradingView Desktop

TradingView Desktop must be running with Chrome DevTools Protocol enabled.

**Auto-detect and launch (recommended):**
After the MCP server is connected, use the `tv_launch` tool — it auto-detects TradingView on Mac, Windows, and Linux.

**Manual launch by platform:**

Mac:
```bash
/Applications/TradingView.app/Contents/MacOS/TradingView --remote-debugging-port=9222
```

Windows:
```bash
%LOCALAPPDATA%\TradingView\TradingView.exe --remote-debugging-port=9222
```

Note: the current Windows MSIX build of TradingView Desktop may start normally but still fail to expose CDP on `localhost:9222`. If that happens, `tv_health_check` will continue to show `cdp_connected: false` even though the app window opened.

Workaround on Windows: use `scripts\launch_tv_debug_edge.bat` to open TradingView's chart page in Edge/Chrome with CDP enabled, then point the MCP server or Telegram bot at `localhost:9222`.

If you run this project from Docker, point the container at the host CDP endpoint with `TV_CDP_HOST=host.docker.internal` and `TV_CDP_PORT=9222`. The container can attach to TradingView, but it should not be expected to launch the host GUI itself.

Linux:
```bash
/opt/TradingView/tradingview --remote-debugging-port=9222
# or: tradingview --remote-debugging-port=9222
```

## Step 4: Restart Claude Code

The MCP server only loads when Claude Code starts. After adding the config:

1. Exit Claude Code (Ctrl+C)
2. Relaunch Claude Code
3. The tradingview MCP server should connect automatically

## Step 5: Verify Connection

Use the `tv_health_check` tool. Expected response:

```json
{
  "success": true,
  "cdp_connected": true,
  "chart_symbol": "...",
  "api_available": true
}
```

If `cdp_connected: false`, TradingView is not running with `--remote-debugging-port=9222`.

## Step 6: Install CLI (Optional)

To use the `tv` CLI command globally:

```bash
cd ~/tradingview-mcp
npm link
```

Then `tv status`, `tv quote`, `tv pine compile`, etc. work from anywhere.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `cdp_connected: false` | Launch TradingView with `--remote-debugging-port=9222` |
| `ECONNREFUSED` | TradingView isn't running or port 9222 is blocked |
| MCP server not showing in Claude Code | Check `~/.claude/.mcp.json` syntax, restart Claude Code |
| `tv` command not found | Run `npm link` from the project directory |
| Tools return stale data | TradingView may still be loading — wait a few seconds |
| Pine Editor tools fail | Open the Pine Editor panel first (`ui_open_panel pine-editor open`) |

## What to Read Next

- `CLAUDE.md` — Decision tree for which tool to use when (auto-loaded by Claude Code)
- `README.md` — Full tool reference (78 MCP tools, 30 CLI commands)
- `RESEARCH.md` — Research context and open questions
