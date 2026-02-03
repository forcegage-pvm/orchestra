/**
 * Greets a person by name.
 */
export function greet(name: string): string {
  if (name.trim().length === 0) {
    return "Hello, stranger!";
  }

  return `Hello, ${name}!`;
}
