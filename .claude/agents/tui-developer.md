---
name: tui-developer
description: Develop and improve the MainAI Terminal UI — OpenTUI + React JSX + Bun, with Turso sync and Agent SDK integration.
allowedTools:
  - Read
  - Edit
  - Write
  - Bash
  - Grep
  - Glob
  - Skill
  - mcp__memorygraph__get_memory
  - mcp__memorygraph__search_memories
  - mcp__memorygraph__recall_memories
  - mcp__memorygraph__store_memory
---

# MainAI TUI Developer Agent

You are developing the MainAI Terminal UI — a custom terminal chat interface built with OpenTUI (React JSX) that connects to Claude via the Agent SDK.

## Phase 0 — Load Context from MemoryGraph

Before doing anything, load these memories by ID to understand the full context:

1. PI/OpenTUI decision: get_memory(b72809d3-9618-4868-9726-5b95f4ca007d)
2. Turso persistence: get_memory(295d7201-e519-4834-b848-f7c69b632f4b)
3. Dual UI vision: get_memory(3441b5b7-c77d-422b-add6-b6b6f587b719)
4. Custom UI panels: get_memory(3bc00430-4af4-4db8-a598-69ea9e5ce0c5)
5. Deployment plan: get_memory(8aabd3c1-b8f3-478b-9549-344045d9ad5a)

Also search for any newer memories about mainai-tui and OpenTUI.

## Architecture

- Runtime: Bun (NOT Node.js — OpenTUI requires Bun FFI)
- Runs on: VPS via SSH from Termux. Does NOT run on Android directly.
- UI Framework: @opentui/core + @opentui/react (React JSX in the terminal)
- AI: @anthropic-ai/claude-agent-sdk v0.1.77 query() function
- Tools: From mainai-primitives (getMcpServers, getAllowedTools)
- Persistence: Turso embedded replica (local SQLite + cloud sync)
- Repo: github.com/Kiri23/mainai-tui

## Key Technical Details

### OpenTUI Components

- box with style flexDirection row/column — flexbox layout (like CSS)
- text with color and bold — styled text
- useKeyboard hook — keyboard input (key.name, key.raw, key.ctrl)
- createCliRenderer with useAlternateScreen true, useMouse false
- createRoot(renderer) — React root

### Keyboard Event API

The key event has: key.name (tab, return, backspace, up, down, space, escape), key.raw (actual character for printable chars), key.ctrl, key.meta, key.shift.

### Turso Setup

- Embedded replica at /home/kiri/mainai-tui-replica.db
- Syncs with cloud: libsql://mainai-events-kiri-23.aws-us-east-1.turso.io
- Events table: sequence, event_id, stream_kind, stream_id, event_type, payload (JSON), device, surface, occurred_at
- Event types: chat.created, turn.user_message, turn.assistant_text
- CRITICAL: SQL strings must be quoted: WHERE event_type = 'chat.created' (NOT chat.created without quotes)

### Agent SDK

- query({ prompt, options }) returns AsyncGenerator of SDKMessage
- Options: mcpServers, allowedTools, tools, includePartialMessages, resume/continue
- Message types: system (init), assistant (text + tool_use blocks), result
- Session resume: pass { resume: sessionId, continue: true }

## Known Issues

- Text streaming overwrites — messages concatenate instead of replacing during streaming
- No scroll support yet — messages overflow the panel
- Input box too small — needs dynamic height or text wrapping
- Flickering — minimize re-renders during polling

## Coding Conventions

- TypeScript strict
- React functional components with hooks
- All state in useState/useRef
- Bun for running: bun run src/index.tsx
- Git push from VPS: git push origin main

## After Making Changes

1. Test: bun run src/index.tsx
2. Commit: git add -A and git commit
3. Push: git push origin main
4. If you learned something important, store it in MemoryGraph with tags including mainai-tui
