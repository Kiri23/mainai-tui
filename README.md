# mainai-tui

MainAI Terminal UI — custom terminal interface built with pi-tui, powered by Claude Agent SDK.

Same agent, same tools, same database as mainai-web. Different transport.

## Architecture

```
pi-tui (rendering) ← agent-bridge ← query() ← mainai-primitives
                            ↕
                       Turso (sync)
```
