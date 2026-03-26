/**
 * Horizontal split layout component for pi-tui.
 * Renders two components side by side with a border between them.
 */
import type { Component } from "@mariozechner/pi-tui";
import { visibleWidth, truncateToWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";

export class SplitLayout implements Component {
  left: Component;
  right: Component;
  leftWidth: number;

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
    const lw = Math.min(this.leftWidth, Math.floor(width * 0.35));
    const border = 1;
    const rw = width - lw - border;
    if (rw < 10) {
      return this.right.render(width);
    }

    const leftLines = this.left.render(lw);
    const rightLines = this.right.render(rw);
    const maxLines = Math.max(leftLines.length, rightLines.length);

    const result: string[] = [];
    for (let i = 0; i < maxLines; i++) {
      const l = fitToWidth(leftLines[i] ?? "", lw);
      const r = fitToWidth(rightLines[i] ?? "", rw);
      result.push(l + chalk.dim("│") + r);
    }
    return result;
  }
}

function fitToWidth(str: string, targetWidth: number): string {
  const vw = visibleWidth(str);
  if (vw > targetWidth) return truncateToWidth(str, targetWidth);
  if (vw < targetWidth) return str + " ".repeat(targetWidth - vw);
  return str;
}
