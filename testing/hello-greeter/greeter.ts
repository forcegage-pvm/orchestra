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
 * greet("  John  ");     // Returns: "Hello,   John  !" (original input preserved)
 * ```
 *
 * **Behavior:**
 * - The input is trimmed to detect if it's empty or whitespace-only.
 * - If the trimmed value is empty (zero-length string), returns "Hello, stranger!".
 * - If the trimmed value is non-empty, returns "Hello, {name}!" using the **original** input parameter.
 * - The original input is preserved exactly as provided, including any leading/trailing spaces.
 *
 * **Edge Cases:**
 * - Empty string "" → "Hello, stranger!"
 * - Whitespace-only "   " → "Hello, stranger!"
 * - Leading/trailing spaces "  Alice  " → "Hello,   Alice  !" (spaces preserved)
 */
export function greet(name: string): string {
  if (name.trim() === "") {
    return "Hello, stranger!";
  }
  
  return `Hello, ${name}!`;
}
