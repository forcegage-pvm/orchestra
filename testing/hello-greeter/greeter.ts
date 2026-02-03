/**
 * Greets a person by name.
 * Returns a personalized greeting for non-empty names,
 * or a default greeting for empty/whitespace-only input.
 * 
 * @param name - The name to greet
 * @returns A greeting message
 */
export function greet(name: string): string {
  // Check if name is empty or whitespace-only using trim
  if (name.trim() === "") {
    return "Hello, stranger!";
  }
  
  // Return greeting with original name preserved
  return `Hello, ${name}!`;
}
