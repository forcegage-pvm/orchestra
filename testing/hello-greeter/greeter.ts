/**
 * Greets a person by name.
 */
export function greet(name: string): string {
  const normalizedName = name.trim();
  const finalName = normalizedName.length === 0 ? "stranger" : normalizedName;
  return `Hello, ${finalName}!`;
}
