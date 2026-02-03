/**
 * Greets a person by name.
 */
export function greet(name: string): string {
  const trimmedName = name.trim();
  const actualName = trimmedName.length > 0 ? trimmedName : "World";
  return `Hello, ${actualName}!`;
}
