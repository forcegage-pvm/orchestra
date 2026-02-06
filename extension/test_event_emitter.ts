import { vi } from "vitest";
import * as vscode from "vscode";

vi.mock("vscode", () => ({
  EventEmitter: class {
    event = vi.fn((callback: () => void) => ({ dispose: vi.fn() }));
    fire = vi.fn();
    dispose = vi.fn();
  },
}));

// Test instantiation
const emitter = new vscode.EventEmitter<void>();
console.log("EventEmitter created successfully:", emitter);
console.log("Has event method:", typeof emitter.event === 'function');
console.log("Has fire method:", typeof emitter.fire === 'function');
console.log("Has dispose method:", typeof emitter.dispose === 'function');

// Test calling methods
const subscription = emitter.event(() => console.log("Event fired"));
console.log("Subscription created:", subscription);
emitter.fire();
console.log("Fire called successfully");
emitter.dispose();
console.log("Dispose called successfully");
