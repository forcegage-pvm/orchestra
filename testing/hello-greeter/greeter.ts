/**
 * Greets a person by name.
 * Returns "Hello, {name}!" for non-empty, non-whitespace input.
 * Returns "Hello, stranger!" for empty or whitespace-only input.
 */
export function greet(name: string): string {
  // Check if name is empty or contains only whitespace
  if (name.trim() === '') {
    return 'Hello, stranger!';
  }
  
  // Return personalized greeting for valid names
  return `Hello, ${name}!`;
}
