/**
 * Chat sidebar — shows list of chats with active indicator.
 * Syncs with Turso to show chats from all devices.
 */
import type { Component } from "@mariozechner/pi-tui";
import chalk from "chalk";

export interface SidebarChat {
  id: string;
  title: string;
  device?: string;
  updatedAt?: string;
}

export class Sidebar implements Component {
  chats: SidebarChat[] = [];
  activeChatId: string | null = null;
  private cachedLines: string[] | null = null;

  invalidate() {
    this.cachedLines = null;
  }

  addChat(chat: SidebarChat) {
    // Avoid duplicates
    if (!this.chats.find(c => c.id === chat.id)) {
      this.chats.unshift(chat); // newest first
      this.cachedLines = null;
    }
  }

  setActive(chatId: string) {
    this.activeChatId = chatId;
    this.cachedLines = null;
  }

  render(width: number): string[] {
    if (this.cachedLines) return this.cachedLines;

    const lines: string[] = [];
    lines.push(chalk.bold.cyan(" Chats"));
    lines.push(chalk.dim(" " + "─".repeat(width - 2)));

    if (this.chats.length === 0) {
      lines.push(chalk.dim(" No chats yet"));
    }

    for (const chat of this.chats) {
      const isActive = chat.id === this.activeChatId;
      const indicator = isActive ? chalk.cyan("▸ ") : "  ";
      const title = chat.title.length > width - 6
        ? chat.title.slice(0, width - 9) + "..."
        : chat.title;
      const device = chat.device ? chalk.dim(` ${chat.device}`) : "";

      if (isActive) {
        lines.push(indicator + chalk.bold.white(title) + device);
      } else {
        lines.push(indicator + chalk.gray(title) + device);
      }
    }

    lines.push(""); // spacer

    this.cachedLines = lines;
    return lines;
  }
}
