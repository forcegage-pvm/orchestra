/**
 * Greets a person by name, or greets a stranger if name is empty or whitespace-only
 * @param name - The name of the person to greet
 * @returns A greeting message
 */
export function greet(name: string): string {
  // Trim whitespace and check if the result is empty
  const trimmedName = name.trim();
  
  if (trimmedName === "") {
    return "Hello, stranger!";
  }
  
  return `Hello, ${trimmedName}!`;
}
