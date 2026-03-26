/**
 * MainAI Terminal UI — Proof of Concept
 *
 * pi-tui rendering + Agent SDK query() + mainai-primitives tools
 *
 * Usage: node --import tsx/esm src/index.ts
 */
import { TUI, Container, Text, Markdown, Editor, Spacer, ProcessTerminal } from "@mariozechner/pi-tui";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getMcpServers, getAllowedTools } from "mainai-primitives/js-runner/src/mcp-config.ts";
import chalk from "chalk";

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

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

const header = new Text();
header.text = chalk.bold.cyan(" ◆ MainAI");

const headerSep = new Text();
headerSep.text = chalk.dim("─".repeat(60));

const chatArea = new Container();

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

const editor = new Editor(tui, editorTheme, { paddingX: 1 });

// ---------------------------------------------------------------------------
// Submit handler — sends to Agent SDK
// ---------------------------------------------------------------------------

editor.onSubmit = async (text: string) => {
  if (!text.trim() || isRunning) return;
  isRunning = true;
  editor.setText("");

  const userMsg = new Text();
  userMsg.text = chalk.bold.blue("\n you ❯ ") + text;
  chatArea.addChild(userMsg);
  tui.requestRender();

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
// Layout
// ---------------------------------------------------------------------------

tui.addChild(header);
tui.addChild(headerSep);
tui.addChild(chatArea);
tui.addChild(new Spacer());
tui.addChild(editor);

// ---------------------------------------------------------------------------
// Start + focus + Ctrl+C
// ---------------------------------------------------------------------------

tui.start();
tui.setFocus(editor);  // <-- THIS was the fix: use tui.setFocus() not editor.focused
tui.requestRender();

tui.addInputListener((data: string) => {
  // Ctrl+C
  if (data === "\x03") {
    tui.stop();
    process.exit(0);
  }
  return undefined;
});
