/**
 * Greets a person by name.
 * @param name - The name of the person to greet
 * @returns A friendly greeting string
 */
export function greet(name: string): string {
  // Trim whitespace to handle edge cases consistently
  const trimmedName = name.trim();
  
  // Handle empty string or whitespace-only input
  if (trimmedName === "") {
    return "Hello, stranger!";
  }
  
  // Return greeting for valid names
  return `Hello, ${trimmedName}!`;
}
