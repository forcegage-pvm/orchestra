/**
 * Greets a person by name.
 * Returns a personalized greeting for non-empty names,
 * or a generic greeting for empty/whitespace input.
 * 
 * @param name - The name of the person to greet
 * @returns A greeting string
 */
export function greet(name: string): string {
  // Trim whitespace and check if the name is empty
  const trimmedName: string = name.trim();
  
  if (trimmedName === "") {
    return "Hello, stranger!";
  }
  
  return `Hello, ${trimmedName}!`;
}
