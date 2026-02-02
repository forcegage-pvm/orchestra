/**
 * Greets a person by name.
 *
 * - Return "Hello, {name}!" for valid names
 * - Return "Hello, stranger!" for empty/whitespace input
 */
export function greet(name: string): string {
  // Check if name is empty or contains only whitespace
  if (!name || name.trim() === "") {
    return "Hello, stranger!";
  }
  return `Hello, ${name}!`;
}
