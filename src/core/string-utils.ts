/**
 * String Utility Functions
 *
 * Pure utility functions for common string operations.
 * Part of the test-tools-001 validation sprint.
 */

/**
 * Convert a string to a URL-friendly slug.
 *
 * - Converts to lowercase
 * - Replaces spaces and non-alphanumeric characters with hyphens
 * - Collapses multiple consecutive hyphens into one
 * - Trims leading/trailing hyphens
 * - Returns empty string for empty/whitespace-only input
 */
export function slugify(input: string): string {
  // Return empty string for empty/whitespace-only input
  if (!input || input.trim().length === 0) {
    return "";
  }

  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/-+/g, "-") // Collapse multiple consecutive hyphens
    .replace(/^-|-$/g, ""); // Trim leading/trailing hyphens
}
/**
 * Truncate a string to a maximum length, appending an ellipsis if truncated.
 *
 * - Returns input unchanged if length <= maxLength
 * - The total returned length = maxLength (ellipsis included in the limit)
 * - Throws Error if maxLength < ellipsis length
 * - If maxLength is 0, returns empty string
 *
 * @param input - The string to truncate
 * @param maxLength - Maximum total length of the returned string
 * @param ellipsis - The ellipsis string to append (default: "...")
 */
export function truncate(
  input: string,
  maxLength: number,
  ellipsis = "...",
): string {
  // Throw error if maxLength < ellipsis length
  if (maxLength < ellipsis.length) {
    throw new Error(
      `maxLength (${maxLength}) must be >= ellipsis length (${ellipsis.length})`,
    );
  }

  // Return empty string if maxLength is 0
  if (maxLength === 0) {
    return "";
  }

  // Return input unchanged if length <= maxLength
  if (input.length <= maxLength) {
    return input;
  }

  // Truncate and append ellipsis
  const truncateAt = maxLength - ellipsis.length;
  return input.slice(0, truncateAt) + ellipsis;
}
/**
 * Capitalize the first character of each word (space-separated).
 *
 * - Lowercases remaining characters in each word
 * - Preserves multiple spaces
 * - Returns empty string for empty input
 */
export function capitalize(input: string): string {
  // Return empty string for empty input
  if (input.length === 0) {
    return "";
  }

  let result = "";
  let capitalizeNext = true;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    
    // TypeScript noUncheckedIndexedAccess requires this check
    if (char === undefined) continue;
    
    if (char === " ") {
      result += char;
      capitalizeNext = true;
    } else {
      if (capitalizeNext) {
        result += char.toUpperCase();
        capitalizeNext = false;
      } else {
        result += char.toLowerCase();
      }
    }
  }
  return result;
}/**
 * Count the number of whitespace-separated words in a string.
 *
 * - Returns 0 for empty/whitespace-only input
 * - Treats any consecutive whitespace as a single delimiter
 */
export function countWords(input: string): number {
  // Return 0 for empty/whitespace-only input
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  // Split by whitespace and filter out empty strings (consecutive whitespace)
  return trimmed.split(/\s+/).length;
}