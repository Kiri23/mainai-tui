/**
 * MainAI Terminal UI
 *
 * pi-tui rendering + Agent SDK query() + mainai-primitives tools + Turso sync
 *
 * Usage: node --import tsx/esm src/index.ts
 */
import { TUI, Container, Text, Markdown, Editor, Spacer, ProcessTerminal } from "@mariozechner/pi-tui";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getMcpServers, getAllowedTools } from "mainai-primitives/js-runner/src/mcp-config.ts";
import { randomUUID } from "node:crypto";
import chalk from "chalk";
import { SplitLayout } from "./split-layout.ts";
import { Sidebar } from "./sidebar.ts";

// ---------------------------------------------------------------------------
// Turso (optional — if env vars set)
// ---------------------------------------------------------------------------

let tursoDb: any = null;
const TURSO_URL = process.env.TURSO_URL ?? "";
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN ?? "";

async function initTurso() {
  if (!TURSO_URL || !TURSO_TOKEN) return;
  try {
    const { createClient } = await import("@libsql/client/http");
    tursoDb = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
    // Load existing chats
    const result = await tursoDb.execute(
      "SELECT DISTINCT stream_id, event_type, payload, device FROM events WHERE event_type = 'chat.created' ORDER BY sequence DESC LIMIT 10"
    );
    for (const row of result.rows) {
      const payload = JSON.parse(row.payload as string);
      sidebar.addChat({
        id: row.stream_id as string,
        title: payload.title ?? "Chat",
        device: row.device as string,
      });
    }
    sidebar.invalidate();
  } catch (e: any) {
    // Turso optional — silently continue
  }
}

async function appendEvent(streamId: string, eventType: string, payload: Record<string, unknown>) {
  if (!tursoDb) return;
  try {
    await tursoDb.execute({
      sql: "INSERT INTO events (event_id, stream_kind, stream_id, event_type, payload, device, surface, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [randomUUID(), "chat", streamId, eventType, JSON.stringify(payload), "pixel", "tui", new Date().toISOString()],
    });
  } catch {}
}

// ---------------------------------------------------------------------------
// Terminal + TUI setup
// ---------------------------------------------------------------------------

const terminal = new ProcessTerminal();
const tui = new TUI(terminal);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let sessionId: string | null = null;
let isRunning = false;
let activeChatId: string = randomUUID();

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

const editorTheme = {
  borderColor: (s: string) => chalk.cyan(s),
  selectList: {
    selected: (s: string) => chalk.bgCyan.black(s),
    unselected: (s: string) => s,
    header: (s: string) => chalk.bold(s),
  },
};

const markdownTheme = {
  heading: (s: string) => chalk.bold.white(s),
  link: (s: string) => chalk.cyan(s),
  linkUrl: (s: string) => chalk.dim(s),
  code: (s: string) => chalk.yellow(s),
  codeBlock: (s: string) => chalk.white(s),
  codeBlockBorder: (s: string) => chalk.dim(s),
  quote: (s: string) => chalk.italic(s),
  quoteBorder: (s: string) => chalk.dim(s),
  hr: (s: string) => chalk.dim(s),
  listBullet: (s: string) => chalk.cyan(s),
  bold: (s: string) => chalk.bold(s),
  italic: (s: string) => chalk.italic(s),
  strikethrough: (s: string) => chalk.strikethrough(s),
  underline: (s: string) => chalk.underline(s),
};

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

// Sidebar
const sidebar = new Sidebar();
sidebar.addChat({ id: activeChatId, title: "New Chat", device: "pixel" });
sidebar.setActive(activeChatId);

// Header
const header = new Text();
header.text = chalk.bold.cyan(" ◆ MainAI");

// Chat area (right panel content)
const chatArea = new Container();

// Right panel = header + chat + spacer + editor
const rightPanel = new Container();
const chatSep = new Text();
chatSep.text = chalk.dim("─".repeat(50));

const editor = new Editor(tui, editorTheme, { paddingX: 1 });

rightPanel.addChild(chatArea);

// Split layout: sidebar | right panel
const splitLayout = new SplitLayout(sidebar, rightPanel, 22);

// ---------------------------------------------------------------------------
// Submit handler
// ---------------------------------------------------------------------------

editor.onSubmit = async (text: string) => {
  if (!text.trim() || isRunning) return;
  isRunning = true;
  editor.setText("");

  // Update sidebar title from first message
  const chat = sidebar.chats.find(c => c.id === activeChatId);
  if (chat && chat.title === "New Chat") {
    chat.title = text.slice(0, 30) + (text.length > 30 ? "..." : "");
    sidebar.invalidate();
  }

  // Write to Turso
  appendEvent(activeChatId, "chat.created", { projectId: "default", title: chat?.title ?? text.slice(0, 30) });
  appendEvent(activeChatId, "turn.user_message", { content: text });

  // User message
  const userMsg = new Text();
  userMsg.text = chalk.bold.blue("\n you ❯ ") + text;
  chatArea.addChild(userMsg);
  tui.requestRender();

  // Assistant label + markdown
  const assistantLabel = new Text();
  assistantLabel.text = chalk.bold.magenta("\n MainAI ❯");
  chatArea.addChild(assistantLabel);

  const md = new Markdown("", 1, 0, markdownTheme);
  chatArea.addChild(md);
  tui.requestRender();

  let fullText = "";

  try {
    const options: any = {
      mcpServers: getMcpServers(),
      allowedTools: getAllowedTools(),
      tools: ["Read", "Glob", "Grep"],
      includePartialMessages: true,
      ...(sessionId ? { resume: sessionId, continue: true } : {}),
    };

    for await (const message of query({ prompt: text, options })) {
      switch (message.type) {
        case "system": {
          if (message.subtype === "init") {
            sessionId = message.session_id;
            tui.requestRender();
          }
          break;
        }

        case "assistant": {
          for (const block of message.message?.content ?? []) {
            if (block.type === "text" && block.text) {
              fullText = block.text;
              md.setText(fullText);
              md.invalidate();
              tui.requestRender();
            }
            if (block.type === "tool_use") {
              const toolMsg = new Text();
              toolMsg.text = chalk.dim(` [${block.name}]`);
              chatArea.addChild(toolMsg);
              tui.requestRender();
            }
          }
          break;
        }

        case "result": {
          // Write assistant response to Turso
          appendEvent(activeChatId, "turn.assistant_text", { text: fullText });
          tui.requestRender();
          break;
        }
      }
    }
  } catch (err: any) {
    const errMsg = new Text();
    errMsg.text = chalk.red(` Error: ${err.message?.slice(0, 100)}`);
    chatArea.addChild(errMsg);
    tui.requestRender();
  }

  isRunning = false;
  tui.requestRender();
};

// ---------------------------------------------------------------------------
// Layout: header → split(sidebar | chat) → editor
// ---------------------------------------------------------------------------

tui.addChild(header);
tui.addChild(splitLayout);
tui.addChild(new Spacer());
tui.addChild(editor);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

initTurso().then(() => {
  tui.start();
  tui.setFocus(editor);
  tui.requestRender();
});

// Ctrl+C to quit
tui.addInputListener((data: string) => {
  if (data === "\x03") {
    tui.stop();
    process.exit(0);
  }
  return undefined;
});
