import "dotenv/config";
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { useState, useEffect, useRef, useCallback } from "react";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getMcpServers, getAllowedTools } from "mainai-primitives/js-runner/src/mcp-config.ts";
import { randomUUID } from "node:crypto";

// Turso
const TURSO_URL = process.env.TURSO_URL ?? "";
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN ?? "";
let tursoDb: any = null;

async function initTurso() {
  if (!TURSO_URL || !TURSO_TOKEN) return;
  const { createClient } = await import("@libsql/client");
  tursoDb = createClient({
    url: "file:/home/kiri/mainai-tui-replica.db",
    authToken: TURSO_TOKEN,
    syncUrl: TURSO_URL,
  });
  await tursoDb.sync();
}

async function appendEvent(streamId: string, eventType: string, payload: Record<string, unknown>) {
  if (!tursoDb) return;
  await tursoDb.execute({
    sql: "INSERT INTO events (event_id, stream_kind, stream_id, event_type, payload, device, surface, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [randomUUID(), "chat", streamId, eventType, JSON.stringify(payload), "vps", "tui", new Date().toISOString()],
  });
}

async function loadChatMessages(chatId: string): Promise<ChatMsg[]> {
  if (!tursoDb) return [];
  await tursoDb.sync();
  const res = await tursoDb.execute({
    sql: "SELECT event_type, payload, device, surface FROM events WHERE stream_id = ? AND event_type IN (turn.user_message, turn.assistant_text) ORDER BY sequence ASC",
    args: [chatId],
  });
  return res.rows.map((row: any) => {
    const p = JSON.parse(row.payload);
    if (row.event_type === "turn.user_message") {
      const label = row.surface === "tui" ? "you" : row.device + "/" + row.surface;
      return { role: "user" as const, text: label + " > " + p.content };
    }
    return { role: "assistant" as const, text: p.text };
  });
}

// Types
interface ChatMsg { role: "user" | "assistant" | "tool" | "system"; text: string; }
interface SidebarChat { id: string; title: string; device: string; }

// Main
async function main() {
  await initTurso();

  const existingChats: SidebarChat[] = [];
  if (tursoDb) {
    await tursoDb.sync();
    const res = await tursoDb.execute(
      "SELECT DISTINCT stream_id, payload, device FROM events WHERE event_type = chat.created ORDER BY sequence DESC LIMIT 20"
    );
    for (const row of res.rows) {
      const p = JSON.parse(row.payload as string);
      existingChats.push({ id: row.stream_id as string, title: p.title ?? "Chat", device: row.device as string });
    }
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useAlternateScreen: true,
    useMouse: false,
    useKittyKeyboard: null,
  });

  const root = createRoot(renderer);
  const initialChatId = randomUUID();

  function App() {
    const [chats, setChats] = useState<SidebarChat[]>([
      { id: initialChatId, title: "New Chat", device: "vps" },
      ...existingChats,
    ]);
    const [activeIdx, setActiveIdx] = useState(0);
    const [activeChatId, setActiveChatId] = useState(initialChatId);
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [input, setInput] = useState("");
    const [focus, setFocus] = useState<"sidebar" | "editor">("editor");
    const [status, setStatus] = useState("ready");
    const sessionRef = useRef<string | null>(null);
    const runningRef = useRef(false);

    // Load messages when switching chats
    const switchToChat = useCallback(async (idx: number) => {
      const chat = chats[idx];
      if (!chat) return;
      setActiveIdx(idx);
      setActiveChatId(chat.id);
      setStatus("loading...");
      const msgs = await loadChatMessages(chat.id);
      setMessages(msgs);
      setStatus("ready");
      // Reset session — cant resume another chats SDK session
      sessionRef.current = null;
    }, [chats]);

    // Poll Turso for remote events
    useEffect(() => {
      if (!tursoDb) return;
      let lastSeq = 0;
      tursoDb.execute("SELECT COALESCE(MAX(sequence), 0) as seq FROM events").then((r: any) => {
        lastSeq = r.rows[0]?.seq ?? 0;
      });
      const interval = setInterval(async () => {
        try {
          await tursoDb.sync();
          const res = await tursoDb.execute({
            sql: "SELECT sequence, stream_id, event_type, payload, device, surface FROM events WHERE sequence > ? AND surface != tui ORDER BY sequence ASC LIMIT 50",
            args: [lastSeq],
          });
          for (const row of res.rows) {
            lastSeq = row.sequence as number;
            const p = JSON.parse(row.payload as string);
            if (row.event_type === "chat.created") {
              setChats(prev => {
                if (prev.find(c => c.id === row.stream_id)) return prev;
                return [{ id: row.stream_id as string, title: p.title ?? "Chat", device: row.device as string }, ...prev];
              });
            }
          }
        } catch {}
      }, 3000);
      return () => clearInterval(interval);
    }, []);

    async function sendMessage(text: string) {
      if (runningRef.current) return;
      runningRef.current = true;
      setStatus("thinking...");
      setMessages(m => [...m, { role: "user", text: "you > " + text }]);

      // Only write chat.created if this is the first message in a new chat
      const isNewChat = chats.find(c => c.id === activeChatId)?.title === "New Chat";
      if (isNewChat) {
        appendEvent(activeChatId, "chat.created", { title: text.slice(0, 30), projectId: "default" });
        setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, title: text.slice(0, 20) } : c));
      }
      appendEvent(activeChatId, "turn.user_message", { content: text });

      try {
        const options: any = {
          mcpServers: getMcpServers(),
          allowedTools: getAllowedTools(),
          tools: ["Read", "Glob", "Grep"],
          includePartialMessages: true,
          ...(sessionRef.current ? { resume: sessionRef.current, continue: true } : {}),
        };

        let fullText = "";
        for await (const msg of query({ prompt: text, options })) {
          if (msg.type === "system" && msg.subtype === "init") {
            sessionRef.current = msg.session_id;
            setStatus("connected");
          }
          if (msg.type === "assistant") {
            for (const block of msg.message?.content ?? []) {
              if (block.type === "text" && block.text) {
                fullText = block.text;
                setMessages(m => {
                  const last = m[m.length - 1];
                  if (last?.role === "assistant") return [...m.slice(0, -1), { role: "assistant", text: fullText }];
                  return [...m, { role: "assistant", text: fullText }];
                });
              }
              if (block.type === "tool_use") {
                setMessages(m => [...m, { role: "tool", text: "[" + block.name + "]" }]);
                setStatus(block.name + "...");
              }
            }
          }
          if (msg.type === "result") {
            appendEvent(activeChatId, "turn.assistant_text", { text: fullText });
            setStatus("ready");
          }
        }
      } catch (err: any) {
        setMessages(m => [...m, { role: "system", text: "Error: " + (err.message?.slice(0, 80) ?? "") }]);
        setStatus("error");
      }
      runningRef.current = false;
      setStatus("ready");
    }

    // New chat
    function createNewChat() {
      const newId = randomUUID();
      setChats(prev => [{ id: newId, title: "New Chat", device: "vps" }, ...prev]);
      setActiveChatId(newId);
      setActiveIdx(0);
      setMessages([]);
      sessionRef.current = null;
      setFocus("editor");
    }

    useKeyboard((key) => {
      if (key.name === "tab") { setFocus(f => f === "sidebar" ? "editor" : "sidebar"); return; }

      // Ctrl+N = new chat
      if (key.ctrl && key.name === "n") { createNewChat(); return; }

      if (focus === "sidebar") {
        if (key.name === "up") {
          const newIdx = Math.max(0, activeIdx - 1);
          setActiveIdx(newIdx);
          return;
        }
        if (key.name === "down") {
          const newIdx = Math.min(chats.length - 1, activeIdx + 1);
          setActiveIdx(newIdx);
          return;
        }
        // Enter = select chat and load messages
        if (key.name === "return") {
          switchToChat(activeIdx);
          setFocus("editor");
          return;
        }
      }

      if (focus === "editor") {
        if (key.name === "return" && input.trim() && !runningRef.current) {
          const text = input;
          setInput("");
          sendMessage(text);
          return;
        }
        if (key.name === "backspace") { setInput(s => s.slice(0, -1)); return; }
        if (key.name === "space") { setInput(s => s + " "); return; }
        if (!key.ctrl && !key.meta && key.raw && key.raw.length === 1 && key.raw.charCodeAt(0) >= 32) {
          setInput(s => s + key.raw);
        }
      }
    });

    const sBorder = focus === "sidebar" ? "cyan" : "gray";
    const eBorder = focus === "editor" ? "cyan" : "gray";

    return (
      <box style={{ flexDirection: "column", width: "100%", height: "100%" }}>
        <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <text bold color="cyan">{" MainAI"}</text>
          <text color="gray">{status + "  Ctrl+N=new  Tab=focus  Enter=select "}</text>
        </box>

        <box style={{ flexDirection: "row", flexGrow: 1 }}>
          <box style={{ width: 26, borderStyle: "single", borderColor: sBorder, flexDirection: "column" }}>
            <text bold color="white">{" Chats"}</text>
            {chats.map((c, i) => {
              const selected = i === activeIdx;
              const isActive = c.id === activeChatId;
              const prefix = selected ? " > " : "   ";
              const suffix = isActive ? " *" : "";
              return (
                <text key={c.id} color={selected ? "cyan" : isActive ? "white" : "gray"}>
                  {prefix + c.title.slice(0, 18) + suffix}
                </text>
              );
            })}
          </box>

          <box style={{ flexGrow: 1, flexDirection: "column", paddingLeft: 1 }}>
            <box style={{ flexGrow: 1, flexDirection: "column" }}>
              {messages.length === 0 && (
                <text color="gray">{" No messages yet. Type something!"}</text>
              )}
              {messages.map((msg, i) => (
                <text key={i} color={
                  msg.role === "user" ? "blue" :
                  msg.role === "assistant" ? "white" :
                  msg.role === "tool" ? "gray" : "red"
                }>
                  {msg.role === "user" ? " " + msg.text :
                   msg.role === "assistant" ? " MainAI > " + msg.text.slice(0, 200) :
                   " " + msg.text}
                </text>
              ))}
            </box>
            <box style={{ borderStyle: "single", borderColor: eBorder, height: 3, paddingLeft: 1 }}>
              <text color="white">{input + "_"}</text>
            </box>
          </box>
        </box>
      </box>
    );
  }

  root.render(<App />);
}

main();
