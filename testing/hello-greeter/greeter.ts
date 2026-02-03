/**
 * Greets a person by name.
 * Returns "Hello, {name}!" for non-empty input after trimming.
 * Returns "Hello, stranger!" for empty or whitespace-only input.
 */
export function greet(name: string): string {
  const trimmedName = name.trim();
  
  if (trimmedName === "") {
    return "Hello, stranger!";
  }
  
  return `Hello, ${trimmedName}!`;
}
