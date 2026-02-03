/**
 * Greets a person by name.
 */
export function greet(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    return "Hello, stranger!";
  }

  return `Hello, ${normalized}!`;
}
