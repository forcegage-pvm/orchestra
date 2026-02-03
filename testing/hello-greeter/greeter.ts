/**
 * Greeter module providing a simple greeting function.
 * 
 * @module greeter
 */

/**
 * Generates a greeting message for a given name.
 * 
 * Edge cases:
 * - Empty string (`""`) returns "Hello, stranger!"
 * - Whitespace-only input (e.g., `"   "`) returns "Hello, stranger!"
 * - Non-empty input returns "Hello, {name}!" preserving the original input value
 * 
 * @param name - The name to greet. Can be any string including empty or whitespace-only.
 * @returns A greeting message string
 * 
 * @example
 * ```typescript
 * greet("Alice")      // Returns: "Hello, Alice!"
 * greet("  Bob  ")    // Returns: "Hello,   Bob  !"
 * greet("")           // Returns: "Hello, stranger!"
 * greet("   ")        // Returns: "Hello, stranger!"
 * ```
 */
export function greet(name: string): string {
  // Check if the input is empty or whitespace-only
  if (name.trim() === "") {
    return "Hello, stranger!";
  }
  
  // For non-empty input, preserve the original value
  return `Hello, ${name}!`;
}
