/**
 * Greets a person by name.
 * 
 * Returns a personalized greeting string in the format "Hello, {name}!".
 * For empty or whitespace-only inputs, returns a default greeting for strangers.
 * 
 * @param name - The name of the person to greet
 * @returns A greeting string. Returns "Hello, {name}!" for valid non-empty names,
 *          or "Hello, stranger!" for empty or whitespace-only inputs.
 * 
 * @example
 * ```typescript
 * greet("Alice")    // Returns "Hello, Alice!"
 * greet("")         // Returns "Hello, stranger!"
 * greet("   ")      // Returns "Hello, stranger!"
 * ```
 */
export function greet(name: string): string {
  const trimmedName = name.trim();
  
  if (trimmedName === "") {
    return "Hello, stranger!";
  }
  
  return `Hello, ${trimmedName}!`;
}
