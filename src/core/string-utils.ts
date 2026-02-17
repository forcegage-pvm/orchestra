/**
 * String Utility Functions
 *
 * Pure utility functions for common string operations.
 * Part of the test-tools-001 validation sprint.
 */

/**
 * Convert a string to a URL-friendly slug.
 */
export function slugify(input: string): string {
  const normalized = input.trim().toLowerCase();
  if (normalized.length === 0) {
    return "";
  }

  return normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
/**
 * Truncate a string to a maximum length, appending an ellipsis if truncated.
 */
export function truncate(
  input: string,
  maxLength: number,
  ellipsis = "...",
): string {
  if (maxLength === 0) {
    return "";
  }

  if (maxLength < ellipsis.length) {
    throw new Error("maxLength must be greater than or equal to ellipsis length");
  }

  if (input.length <= maxLength) {
    return input;
  }

  const keepLength = maxLength - ellipsis.length;
  return `${input.slice(0, keepLength)}${ellipsis}`;
}
/**
 * Capitalize the first character of each word (space-separated).
 */
export function capitalize(input: string): string {
  if (input.length === 0) {
    return "";
  }

  return input.replace(/\S+/g, (word) => {
    const firstChar = word.at(0);
    if (firstChar === undefined) {
      return "";
    }

    return `${firstChar.toUpperCase()}${word.slice(1).toLowerCase()}`;
  });
}
/**
 * Count the number of whitespace-separated words in a string.
 */
export function countWords(input: string): number {
  const normalized = input.trim();
  if (normalized.length === 0) {
    return 0;
  }

  return normalized.split(/\s+/).length;
}