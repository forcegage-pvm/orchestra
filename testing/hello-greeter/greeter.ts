/**
 * Greeter module that formats personalized hello messages.
 * 
 * @param name - The name to greet. Empty or whitespace-only strings are treated as "stranger".
 * @returns A formatted greeting message.
 */
export function greet(name: string): string {
  const trimmedName = name.trim();
  
  if (trimmedName === '') {
    return 'Hello, stranger!';
  }
  
  return `Hello, ${trimmedName}!`;
}
