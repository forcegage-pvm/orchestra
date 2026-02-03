/**
 * Greets a person by name, returning a personalized greeting message.
 *
 * @param name - The name of the person to greet. May be empty or contain only whitespace.
 * @returns A greeting message in the format "Hello, {name}!" for non-empty names,
 *          or "Hello, stranger!" for empty or whitespace-only inputs.
 *
 * @example
 * ```typescript
 * greet("Alice");        // Returns: "Hello, Alice!"
 * greet("Bob Smith");    // Returns: "Hello, Bob Smith!"
 * greet("");             // Returns: "Hello, stranger!"
 * greet("   ");          // Returns: "Hello, stranger!"
 * greet("  John  ");     // Returns: "Hello, John!" (trimmed)
 * ```
 *
 * **Behavior:**
 * - The input name is trimmed of leading and trailing whitespace before processing.
 * - If the trimmed name is empty (zero-length string), returns "Hello, stranger!".
 * - If the trimmed name is non-empty, returns "Hello, {name}!" using the trimmed name.
 * - The inner content of the name is preserved as-is after trimming.
 *
 * **Edge Cases:**
 * - Empty string "" → "Hello, stranger!"
 * - Whitespace-only "   " → "Hello, stranger!"
 * - Leading/trailing spaces "  Alice  " → "Hello, Alice!"
 */
export function greet(name: string): string {
  const trimmedName = name.trim();
  
  if (trimmedName === "") {
    return "Hello, stranger!";
  }
  
  return `Hello, ${trimmedName}!`;
}
