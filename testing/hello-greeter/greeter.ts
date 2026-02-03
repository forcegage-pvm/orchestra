/**
 * Greets a person by name.
 */
export function greet(name: string): string {
  // Handle empty string or whitespace-only input
  if (name.trim() === "") {
    return "Hello, stranger!";
  }
  
  // Return personalized greeting
  return `Hello, ${name}!`;
}
