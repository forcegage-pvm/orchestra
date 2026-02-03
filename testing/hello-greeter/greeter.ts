/**
 * Greets a person by name.
 * @param name - The name of the person to greet
 * @returns A greeting message
 */
export function greet(name: string): string {
  // Handle empty or whitespace-only names
  if (name.trim() === "") {
    return "Hello, stranger!";
  }
  
  return `Hello, ${name}!`;
}
