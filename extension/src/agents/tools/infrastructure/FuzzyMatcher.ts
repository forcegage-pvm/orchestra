/**
 * FuzzyMatcher - Levenshtein-based fuzzy matching
 */

import type * as vscode from "vscode";

import type { FuzzyMatcherConfig, MatchResult, MatchType } from "../types.js";

interface MatchOptions {
  startLineHint?: number;
  token?: vscode.CancellationToken;
}

const DEFAULT_CONFIG: FuzzyMatcherConfig = {
  threshold: 0.85,
  search_radius: 50,
  normalize_whitespace: true,
};

/**
 * Fuzzy text matcher using Levenshtein distance for similarity scoring
 * Supports exact, normalized whitespace, and fuzzy matching modes
 */
export class FuzzyMatcher {
  private readonly config: FuzzyMatcherConfig;

  /**
   * Create a new fuzzy matcher
   * @param config - Matcher configuration
   * @param config.threshold - Minimum similarity score (0.0-1.0, default: 0.85)
   * @param config.search_radius - Lines to search around hint (default: 50)
   * @param config.normalize_whitespace - Normalize whitespace before matching (default: true)
   */
  public constructor(config: Partial<FuzzyMatcherConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Find the best match for target text in an array of lines
   * Attempts exact match first, then normalized whitespace, then fuzzy match
   * @param lines - Array of lines to search
   * @param target - Text to find
   * @param options - Match options
   * @param options.startLineHint - Line number to prioritize (1-indexed)
   * @param options.token - Cancellation token
   * @returns Match result with confidence score and location
   */
  public match(
    lines: string[],
    target: string,
    options: MatchOptions = {},
  ): MatchResult {
    const targetLines = this.splitLines(target);
    if (targetLines.length === 0 || lines.length === 0) {
      return this.noMatch();
    }

    const windowSize = targetLines.length;
    const normalizedTarget = this.config.normalize_whitespace
      ? this.normalizeWhitespace(target)
      : target;

    const candidates = this.buildSearchOrder(
      lines.length,
      windowSize,
      options.startLineHint,
    );

    for (const startIndex of candidates) {
      if (options.token?.isCancellationRequested) {
        return this.noMatch();
      }
      const segment = lines
        .slice(startIndex, startIndex + windowSize)
        .join("\n");
      if (segment === target) {
        return this.buildMatch("EXACT", 1, startIndex, segment, windowSize);
      }

      if (this.config.normalize_whitespace) {
        const normalizedSegment = this.normalizeWhitespace(segment);
        if (normalizedSegment === normalizedTarget) {
          return this.buildMatch(
            "NORMALIZED",
            1,
            startIndex,
            segment,
            windowSize,
          );
        }
      }
    }

    let bestMatch: MatchResult | null = null;

    for (const startIndex of candidates) {
      if (options.token?.isCancellationRequested) {
        return this.noMatch();
      }
      const segment = lines
        .slice(startIndex, startIndex + windowSize)
        .join("\n");
      const comparisonTarget = this.config.normalize_whitespace
        ? this.normalizeWhitespace(segment)
        : segment;
      const distance = this.levenshtein(comparisonTarget, normalizedTarget);
      const maxLength = Math.max(
        comparisonTarget.length,
        normalizedTarget.length,
      );
      const similarity = maxLength === 0 ? 1 : 1 - distance / maxLength;

      if (similarity >= this.config.threshold) {
        const match = this.buildMatch(
          "FUZZY",
          similarity,
          startIndex,
          segment,
          windowSize,
        );
        if (!bestMatch || match.confidence > bestMatch.confidence) {
          bestMatch = match;
        }
      }
    }

    return bestMatch ?? this.noMatch();
  }

  private splitLines(text: string): string[] {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return normalized.split("\n").filter((line, index, array) => {
      if (line.length > 0) {
        return true;
      }
      return index !== array.length - 1;
    });
  }

  private buildSearchOrder(
    totalLines: number,
    windowSize: number,
    startLineHint?: number,
  ): number[] {
    const maxStartIndex = Math.max(0, totalLines - windowSize);

    if (typeof startLineHint !== "number") {
      return Array.from({ length: maxStartIndex + 1 }, (_, index) => index);
    }

    const hintIndex = Math.min(maxStartIndex, Math.max(0, startLineHint - 1));
    const minIndex = Math.max(0, hintIndex - this.config.search_radius);
    const maxIndex = Math.min(
      maxStartIndex,
      hintIndex + this.config.search_radius,
    );
    const order: number[] = [];

    for (let offset = 0; offset <= this.config.search_radius; offset += 1) {
      const left = hintIndex - offset;
      const right = hintIndex + offset;

      if (left >= minIndex && left <= maxIndex) {
        order.push(left);
      }

      if (right !== left && right >= minIndex && right <= maxIndex) {
        order.push(right);
      }

      if (left < minIndex && right > maxIndex) {
        break;
      }
    }

    return order;
  }

  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }

  private buildMatch(
    matchType: MatchType,
    confidence: number,
    startIndex: number,
    segment: string,
    windowSize: number,
  ): MatchResult {
    return {
      found: true,
      match_type: matchType,
      confidence,
      start_line: startIndex + 1,
      end_line: startIndex + windowSize,
      matched_text: segment,
    };
  }

  private noMatch(): MatchResult {
    return {
      found: false,
      match_type: "FUZZY",
      confidence: 0,
      start_line: 0,
      end_line: 0,
      matched_text: "",
    };
  }

  private levenshtein(a: string, b: string): number {
    if (a === b) {
      return 0;
    }

    const aLength = a.length;
    const bLength = b.length;

    if (aLength === 0) {
      return bLength;
    }

    if (bLength === 0) {
      return aLength;
    }

    const costs = new Array(bLength + 1).fill(0);

    for (let index = 0; index <= bLength; index += 1) {
      costs[index] = index;
    }

    for (let i = 1; i <= aLength; i += 1) {
      let previousCost = i - 1;
      costs[0] = i;

      for (let j = 1; j <= bLength; j += 1) {
        const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
        const insertCost = costs[j] + 1;
        const deleteCost = costs[j - 1] + 1;
        const replaceCost = previousCost + substitutionCost;

        previousCost = costs[j];
        costs[j] = Math.min(insertCost, deleteCost, replaceCost);
      }
    }

    return costs[bLength];
  }
}
