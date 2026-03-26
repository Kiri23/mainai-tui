/**
 * Horizontal split layout component for pi-tui.
 * Renders two components side by side with a border between them.
 */
import type { Component } from "@mariozechner/pi-tui";
import { visibleWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";

export class SplitLayout implements Component {
  left: Component;
  right: Component;
  leftWidth: number; // columns for left panel

  constructor(left: Component, right: Component, leftWidth: number) {
    this.left = left;
    this.right = right;
    this.leftWidth = leftWidth;
  }

  invalidate() {
    this.left.invalidate();
    this.right.invalidate();
  }

  render(width: number): string[] {
    const lw = this.leftWidth;
    const border = 1; // │ separator
    const rw = width - lw - border;
    if (rw < 5) {
      // Too narrow for split — just render right panel
      return this.right.render(width);
    }

    const leftLines = this.left.render(lw);
    const rightLines = this.right.render(rw);
    const maxLines = Math.max(leftLines.length, rightLines.length);

    const result: string[] = [];
    for (let i = 0; i < maxLines; i++) {
      const l = padToWidth(leftLines[i] ?? "", lw);
      const r = rightLines[i] ?? "";
      result.push(l + chalk.dim("│") + r);
    }
    return result;
  }
}

/** Pad or truncate a styled string to exact visible width */
function padToWidth(str: string, targetWidth: number): string {
  const vw = visibleWidth(str);
  if (vw >= targetWidth) return str;
  return str + " ".repeat(targetWidth - vw);
}
