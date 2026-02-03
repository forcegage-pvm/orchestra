/**
 * Greets a person by name.
 * Returns "Hello, {name}!" for non-empty, non-whitespace names.
 * Returns "Hello, stranger!" for empty or whitespace-only input.
 */
export function greet(name: string): string {
  // Trim whitespace and check if the result is empty
  const trimmedName = name.trim();
  
  if (trimmedName === "") {
    return "Hello, stranger!";
  }
  
  return `Hello, ${trimmedName}!`;
}
