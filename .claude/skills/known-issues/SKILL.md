---
name: known-issues
description: Known bugs, debug tips, and gotchas for mainai-tui. Load this skill when debugging, fixing bugs, or encountering unexpected behavior. This skill self-updates — add new issues as you find them.
---

# MainAI TUI — Known Issues and Debug Tips

## Self-Update Rule

IMPORTANT: When you fix a bug or discover a new gotcha, ADD it to this file under the appropriate section. This keeps the knowledge base growing. Also remove issues that have been fully resolved.

## Active Issues

### 1. Text Streaming Overwrites
Messages concatenate instead of replacing during streaming. The assistant text appears as "MainAIH>yHey!" instead of clean replacement.
- Root cause: setMessages appends instead of replacing the last assistant message
- Fix pattern: check if last message is assistant, replace instead of append

### 2. No Scroll Support
Messages overflow the panel when conversation is long. Need ScrollBoxRenderable from OpenTUI.
- Reference: OpenTUI skill has ScrollBox documentation

### 3. Input Box Too Small
The editor box is fixed height 3, text doesn't wrap.
- Fix: use TextareaRenderable from OpenTUI, or dynamic height based on content

### 4. Polling Flicker
The 3-second Turso polling causes slight re-renders even when nothing changed.
- Fix: only call setChats/setMessages if data actually changed (deep compare)

## Resolved Issues

### SQL String Literals (RESOLVED)
- Problem: `WHERE event_type = chat.created` crashes with "no such column"
- Fix: Always quote: `WHERE event_type = 'chat.created'`
- This has been fixed multiple times. ALWAYS check SQL quotes.

### React Duplicate Keys (RESOLVED)
- Problem: Multiple chat.created events for same stream_id cause duplicate keys
- Fix: GROUP BY stream_id in the initial chats query

### Terminal Mouse Artifacts (RESOLVED)
- Problem: After closing app, terminal shows mouse tracking codes
- Fix: useMouse: false in createCliRenderer options

## Debug Tips

### Terminal Recovery
If the terminal gets messed up after a crash:
- Run: `reset` or `stty sane`
- If keyboard stops working: close and reopen Termux/SSH session

### Turso Sync Issues
- Always call `await tursoDb.sync()` before reading if you expect fresh data
- Embedded replica reads are local — they may be stale without sync
- Check cloud directly: use @libsql/client/http mode for debugging

### OpenTUI Crashes
- Check the console panel (bottom of screen) for error messages
- Common: nested text elements, missing style props, non-string children in text
- If app won't start: check `bun run src/index.tsx` output before alternate screen clears it
