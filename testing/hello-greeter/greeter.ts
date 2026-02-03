/**
 * Greets a person by name.
 */
export function greet(name: string): string {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return "Hello, stranger!";
  }

  return `Hello, ${trimmedName}!`;
}
