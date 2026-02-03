/**
 * Greets a person by name.
 */
export function greet(name: string): string {
  // Handle empty or whitespace-only inputs
  if (!name || name.trim().length === 0) {
    return "Hello, stranger!";
  }
  
  // Return personalized greeting for valid names
  return `Hello, ${name}!`;
}
