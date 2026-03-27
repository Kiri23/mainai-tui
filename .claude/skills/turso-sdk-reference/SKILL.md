---
name: turso-sdk-reference
description: Turso embedded replica setup and Agent SDK query() patterns for mainai-tui. Load when working with database operations, event store, cross-device sync, or Agent SDK integration.
---

# Turso + Agent SDK Reference

## Turso Embedded Replica

### Setup
```tsx
import { createClient } from "@libsql/client";

const tursoDb = createClient({
  url: "file:/home/kiri/mainai-tui-replica.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
  syncUrl: process.env.TURSO_URL,
});
await tursoDb.sync();
```

### Event Store Schema
| Column | Type | Description |
|--------|------|-------------|
| sequence | INTEGER PK | Auto-increment |
| event_id | TEXT UNIQUE | UUID |
| stream_kind | TEXT | "chat" |
| stream_id | TEXT | Chat UUID |
| event_type | TEXT | See event types below |
| payload | TEXT | JSON string |
| device | TEXT | "pixel", "vps", "mac" |
| surface | TEXT | "tui", "web", "cli" |
| occurred_at | TEXT | ISO 8601 |

### Event Types
- `chat.created` — payload: { title, projectId }
- `turn.user_message` — payload: { content }
- `turn.assistant_text` — payload: { text }

### CRITICAL: SQL String Quoting
```sql
-- CORRECT
WHERE event_type = 'chat.created'
IN ('turn.user_message', 'turn.assistant_text')

-- WRONG (crashes with "no such column")
WHERE event_type = chat.created
IN (turn.user_message, turn.assistant_text)
```

### Cross-Device Sync Pattern
- Write events with device and surface to identify source
- Poll for new events: filter out own surface to avoid duplicates
- Sync before reading: `await tursoDb.sync()`

### Loading Chat Messages
```tsx
const res = await tursoDb.execute({
  sql: "SELECT event_type, payload, device, surface FROM events WHERE stream_id = ? AND event_type IN ('turn.user_message', 'turn.assistant_text') ORDER BY sequence ASC",
  args: [chatId],
});
```

### Loading Chat List (deduplicated)
```tsx
const res = await tursoDb.execute(
  "SELECT stream_id, MIN(payload) as payload, MIN(device) as device FROM events WHERE event_type = 'chat.created' GROUP BY stream_id ORDER BY MAX(sequence) DESC LIMIT 20"
);
```

## Agent SDK query()

### Basic Usage
```tsx
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getMcpServers, getAllowedTools } from "mainai-primitives/js-runner/src/mcp-config.ts";

const options = {
  mcpServers: getMcpServers(),
  allowedTools: getAllowedTools(),
  tools: ["Read", "Glob", "Grep"],
  includePartialMessages: true,
  ...(sessionId ? { resume: sessionId, continue: true } : {}),
};

for await (const msg of query({ prompt: text, options })) {
  // msg.type: "system" | "assistant" | "result"
}
```

### Message Types
- `system` with subtype `init`: session started, save `msg.session_id` for resume
- `assistant`: `msg.message.content[]` has `text` and `tool_use` blocks
- `result`: `msg.total_cost_usd`, `msg.num_turns`, conversation complete

### Streaming Text (avoid duplicates)
```tsx
if (block.type === "text" && block.text) {
  fullText = block.text;
  setMessages(m => {
    const last = m[m.length - 1];
    if (last?.role === "assistant") return [...m.slice(0, -1), { role: "assistant", text: fullText }];
    return [...m, { role: "assistant", text: fullText }];
  });
}
```

### SDK Version
Pinned to 0.1.77 — v0.2.x breaks external SSE MCP servers.

## External Documentation

When you need deeper Turso knowledge beyond this reference:
- Turso docs: https://docs.turso.tech
- Embedded replicas: https://docs.turso.tech/features/embedded-replicas
- libSQL client: https://docs.turso.tech/sdk/ts
- GitHub: https://github.com/tursodatabase/turso/tree/main/docs
- Agent SDK docs: https://docs.anthropic.com/en/docs/claude-code/sdk
