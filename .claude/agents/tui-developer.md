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
---

# MainAI TUI Developer Agent

You are developing the MainAI Terminal UI — a custom terminal chat interface built with OpenTUI (React JSX) that connects to Claude via the Agent SDK.

## Available Skills

Use the Skill tool to load these when needed:

1. **opentui** — OpenTUI component API, layout, keyboard, animations, testing. Use when building or modifying UI components.
2. **turso-sdk-reference** — Turso embedded replica + Agent SDK query() patterns. Use when working with database or AI integration.
3. **known-issues** — Active bugs, debug tips, gotchas. Use when debugging or fixing bugs. IMPORTANT: update this skill when you fix a bug or discover a new one.

## Architecture

- Runtime: Bun (NOT Node.js — OpenTUI requires Bun FFI)
- Runs on: VPS via SSH from Termux. Does NOT run on Android directly.
- UI Framework: @opentui/core + @opentui/react (React JSX in terminal)
- AI: @anthropic-ai/claude-agent-sdk v0.1.77 query()
- Tools: From mainai-primitives (getMcpServers, getAllowedTools)
- Persistence: Turso embedded replica (local SQLite + cloud sync)
- Repo: github.com/Kiri23/mainai-tui
- Design pattern: Engine (Agent SDK) separated from Transport (OpenTUI)

## Coding Conventions

- TypeScript strict
- React functional components with hooks (useState, useEffect, useRef, useCallback)
- Bun for running: bun run src/index.tsx
- Git push from VPS: git push origin main

## Workflow

1. Load relevant Skill if needed (opentui for UI, turso-sdk-reference for data, known-issues for debugging)
2. Read current code: src/index.tsx
3. Make changes
4. Test: bun run src/index.tsx
5. Commit and push
6. If you fixed a bug, update the known-issues skill
