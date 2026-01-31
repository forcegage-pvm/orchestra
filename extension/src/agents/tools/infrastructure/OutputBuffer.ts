/**
 * OutputBuffer - ring buffer for process output
 */

import { Buffer } from "node:buffer";

interface OutputBufferOptions {
  maxLines?: number;
  maxBytes?: number;
  headRatio?: number;
  tailRatio?: number;
  truncationMessage?: string;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_HEAD_RATIO = 0.2;
const DEFAULT_TAIL_RATIO = 0.8;
const DEFAULT_TRUNCATION_MESSAGE = "... output truncated ...";

/**
 * Ring buffer for managing process output with size limits and head/tail truncation
 * Handles line-based buffering with automatic truncation when limits are exceeded
 */
export class OutputBuffer {
  private readonly maxLines: number | null;
  private readonly maxBytes: number;
  private readonly headRatio: number;
  private readonly tailRatio: number;
  private readonly truncationMessage: string;
  private readonly lines: string[] = [];
  private remainder = "";
  private totalBytes = 0;
  private truncated = false;

  /**
   * Create a new output buffer
   * @param options - Buffer configuration options
   * @param options.maxLines - Maximum lines to retain (null for unlimited)
   * @param options.maxBytes - Maximum bytes to retain (default: 10MB)
   * @param options.headRatio - Proportion of head to keep when truncating (default: 0.2)
   * @param options.tailRatio - Proportion of tail to keep when truncating (default: 0.8)
   * @param options.truncationMessage - Message inserted when truncation occurs
   */
  public constructor(options: OutputBufferOptions = {}) {
    this.maxLines =
      typeof options.maxLines === "number" && options.maxLines > 0
        ? options.maxLines
        : null;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.headRatio = options.headRatio ?? DEFAULT_HEAD_RATIO;
    this.tailRatio = options.tailRatio ?? DEFAULT_TAIL_RATIO;
    this.truncationMessage =
      options.truncationMessage ?? DEFAULT_TRUNCATION_MESSAGE;
  }

  /**
   * Append a chunk of output to the buffer
   * Handles partial lines and enforces size limits
   * @param chunk - Output chunk to append
   */
  public append(chunk: string): void {
    if (!chunk) {
      return;
    }

    const combined = `${this.remainder}${chunk}`;
    const hasTrailingNewline = /(\r\n|\r|\n)$/.test(combined);
    const parts = combined.split(/\r\n|\r|\n/);

    if (!hasTrailingNewline) {
      this.remainder = parts.pop() ?? "";
    } else {
      this.remainder = "";
    }

    for (const line of parts) {
      this.pushLine(line);
    }

    if (
      this.remainder &&
      this.byteLength(this.remainder) + this.totalBytes > this.maxBytes
    ) {
      const remainderLine = this.remainder;
      this.remainder = "";
      this.pushLine(remainderLine);
    }
  }

  /**
   * Get all buffered lines including any partial line remainder
   * @returns Array of output lines
   */
  public getLines(): string[] {
    if (!this.remainder) {
      return [...this.lines];
    }

    return [...this.lines, this.remainder];
  }

  /**
   * Get all buffered output as a single string
   * @returns All lines joined with newlines
   */
  public getText(): string {
    return this.getLines().join("\n");
  }

  /**
   * Clear all buffered output and reset state
   */
  public clear(): void {
    this.lines.length = 0;
    this.remainder = "";
    this.totalBytes = 0;
    this.truncated = false;
  }

  /**
   * Get buffer statistics
   * @returns Object containing line count, byte count, and truncation status
   */
  public getStats(): { lines: number; bytes: number; truncated: boolean } {
    return {
      lines: this.lines.length + (this.remainder ? 1 : 0),
      bytes:
        this.totalBytes +
        (this.remainder ? this.byteLength(this.remainder) : 0),
      truncated: this.truncated,
    };
  }

  private pushLine(line: string): void {
    this.lines.push(line);
    this.totalBytes += this.byteLengthWithNewline(line);

    if (this.maxLines !== null) {
      while (this.lines.length > this.maxLines) {
        const removed = this.lines.shift();
        if (typeof removed === "string") {
          this.totalBytes -= this.byteLengthWithNewline(removed);
          this.truncated = true;
        }
      }
    }

    this.enforceMaxBytes();
  }

  private enforceMaxBytes(): void {
    if (this.totalBytes <= this.maxBytes) {
      return;
    }

    const markerBytes = this.byteLengthWithNewline(this.truncationMessage);
    if (markerBytes >= this.maxBytes) {
      this.trimToMaxBytesFromEnd();
      this.truncated = true;
      return;
    }

    const headBudget = Math.max(
      0,
      Math.floor(this.maxBytes * this.headRatio) - markerBytes,
    );
    const tailBudget = Math.max(0, Math.floor(this.maxBytes * this.tailRatio));

    const head = this.collectFromStart(headBudget);
    const tail = this.collectFromEnd(tailBudget);

    if (head.count + tail.count >= this.lines.length) {
      this.trimToMaxBytesFromEnd();
      this.truncated = true;
      return;
    }

    const combined = [...head.lines, this.truncationMessage, ...tail.lines];
    this.lines.length = 0;
    this.lines.push(...combined);
    this.totalBytes = this.computeTotalBytes(this.lines);
    this.truncated = true;

    if (this.totalBytes > this.maxBytes) {
      this.trimToMaxBytesFromEnd();
    }
  }

  private collectFromStart(budget: number): { lines: string[]; count: number } {
    const collected: string[] = [];
    let used = 0;

    for (const line of this.lines) {
      const lineBytes = this.byteLengthWithNewline(line);
      if (used + lineBytes > budget) {
        break;
      }
      collected.push(line);
      used += lineBytes;
    }

    return { lines: collected, count: collected.length };
  }

  private collectFromEnd(budget: number): { lines: string[]; count: number } {
    const collected: string[] = [];
    let used = 0;

    for (let index = this.lines.length - 1; index >= 0; index -= 1) {
      const line = this.lines[index];
      if (line !== undefined) {
        const lineBytes = this.byteLengthWithNewline(line);
        if (used + lineBytes > budget) {
          break;
        }
        collected.push(line);
        used += lineBytes;
      }
    }

    collected.reverse();
    return { lines: collected, count: collected.length };
  }

  private trimToMaxBytesFromEnd(): void {
    while (this.totalBytes > this.maxBytes && this.lines.length > 0) {
      const removed = this.lines.shift();
      if (typeof removed === "string") {
        this.totalBytes -= this.byteLengthWithNewline(removed);
      }
    }
  }

  private computeTotalBytes(lines: string[]): number {
    return lines.reduce(
      (total, line) => total + this.byteLengthWithNewline(line),
      0,
    );
  }

  private byteLengthWithNewline(line: string): number {
    return this.byteLength(line) + 1;
  }

  private byteLength(value: string): number {
    return Buffer.byteLength(value, "utf8");
  }
}
