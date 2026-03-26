/**
 * MainAI Terminal UI — Proof of Concept
 *
 * pi-tui rendering + Agent SDK query() + mainai-primitives tools
 *
 * Usage: node --import tsx/esm src/index.ts
 */
import { TUI, Container, Text, Box, Markdown, Editor, Spacer, ProcessTerminal } from "@mariozechner/pi-tui";
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
let currentCost = 0;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

// Header
const header = new Text();
header.text = chalk.bold.cyan(" ◆ MainAI Terminal") + chalk.gray(" — your personal AI");

// Separator
const headerSep = new Text();
headerSep.text = chalk.gray("─".repeat(60));

// Chat messages area
const chatArea = new Container();

// Status bar
const statusBar = new Text();
function updateStatus(msg?: string) {
  const model = chalk.gray("claude");
  const cost = chalk.gray(`$${currentCost.toFixed(4)}`);
  const status = msg ? chalk.yellow(` ${msg}`) : chalk.green(" ready");
  statusBar.text = chalk.bgGray.black(` ${model} │ ${cost} │${status} `);
}
updateStatus();

// Input editor
const editorTheme = {
  borderColor: (s: string) => chalk.cyan(s),
  selectList: {
    selected: (s: string) => chalk.bgCyan.black(s),
    unselected: (s: string) => s,
    header: (s: string) => chalk.bold(s),
  },
};

const editor = new Editor(tui, editorTheme, { paddingX: 1 });
editor.focused = true;

// ---------------------------------------------------------------------------
// Submit handler — sends to Agent SDK
// ---------------------------------------------------------------------------

editor.onSubmit = async (text: string) => {
  if (!text.trim() || isRunning) return;
  isRunning = true;
  editor.setText("");

  // User message
  const userMsg = new Text();
  userMsg.text = chalk.bold.blue("\n  you ❯ ") + text;
  chatArea.addChild(userMsg);
  tui.requestRender();

  // Assistant response (streaming markdown)
  const assistantLabel = new Text();
  assistantLabel.text = chalk.bold.magenta("\n  MainAI ❯");
  chatArea.addChild(assistantLabel);

  const md = new Markdown(editorTheme);
  chatArea.addChild(md);

  updateStatus("thinking...");
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
            updateStatus("connected");
            tui.requestRender();
          }
          break;
        }

        case "assistant": {
          for (const block of message.message?.content ?? []) {
            if (block.type === "text" && block.text) {
              fullText = block.text;
              md.text = "  " + fullText.replace(/\n/g, "\n  ");
              md.invalidate();
              tui.requestRender();
            }
            if (block.type === "tool_use") {
              const toolMsg = new Text();
              toolMsg.text = chalk.gray(`  [tool] ${block.name}(${JSON.stringify(block.input).slice(0, 60)}...)`);
              chatArea.addChild(toolMsg);
              updateStatus(`running ${block.name}...`);
              tui.requestRender();
            }
          }
          break;
        }

        case "result": {
          currentCost = message.total_cost_usd ?? currentCost;
          updateStatus();
          tui.requestRender();
          break;
        }
      }
    }
  } catch (err: any) {
    const errMsg = new Text();
    errMsg.text = chalk.red(`  Error: ${err.message?.slice(0, 100)}`);
    chatArea.addChild(errMsg);
    updateStatus("error");
    tui.requestRender();
  }

  isRunning = false;
  updateStatus();
  tui.requestRender();
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

tui.addChild(header);
tui.addChild(headerSep);
tui.addChild(chatArea);
tui.addChild(new Spacer());
tui.addChild(statusBar);
tui.addChild(editor);

// Focus the editor
tui.start();

// Handle Ctrl+C
process.on("SIGINT", () => {
  tui.stop();
  process.exit(0);
});
