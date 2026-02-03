/**
 * Greets a person by name.
 */
export function greet(name: string): string {
  // Handle empty or whitespace-only strings
  if (name.trim() === "") {
    return "Hello, stranger!";
  }
  
  return `Hello, ${name}!`;
}
