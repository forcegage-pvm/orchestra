import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { FileActivityPanel } from "./components/FileActivityPanel.js";
import { FooterInput } from "./components/FooterInput.js";
import { StatusBar } from "./components/StatusBar.js";
import { useKeyboardNav } from "./hooks/index.js";
import { registerIcons } from "./iconRegistry.js";
import { initializeMessageHandler } from "./protocol/index.js";
import { events, session } from "./stores/sessionStore.js";
import "./styles.css";
import { TimelineView } from "./views/index.js";

console.log("[AgentPanel] Module loading started");
const moduleLoadStart = performance.now();

// Register all icons synchronously before rendering
// This eliminates network requests to Iconify CDN
console.log("[AgentPanel] Registering icons");
const iconStart = performance.now();
try {
  registerIcons();
  console.log(
    `[AgentPanel] Icons registered (${(performance.now() - iconStart).toFixed(2)}ms)`,
  );
} catch (iconError) {
  console.error("[AgentPanel] Failed to register icons:", iconError);
}

// Get VS Code API - must be called ONCE and stored globally for protocol handler
// VS Code API is acquired by the preload script and set on window.vscode
// Do NOT call acquireVsCodeApi() again — it can only be called once
declare global {
  interface Window {
    vscode: { postMessage: (message: unknown) => void };
    _agentPanelMessageQueue?: unknown[];
    _agentPanelHandlerReady?: boolean;
  }
}

if (!window.vscode) {
  // Fallback for test environments
  const acquireVsCodeApi: () => { postMessage: (message: unknown) => void } = (
    globalThis as any
  ).acquireVsCodeApi;
  window.vscode = acquireVsCodeApi();
}
const vscode = window.vscode;

// Initialize message handler AFTER setting window.vscode
console.log("[AgentPanel] Initializing message handler");
try {
  initializeMessageHandler();
  console.log("[AgentPanel] Message handler initialized successfully");
} catch (handlerError) {
  console.error(
    "[AgentPanel] Failed to initialize message handler:",
    handlerError,
  );
  throw handlerError;
}

function App() {
  // Mock available tasks and sessions for now - will be populated via stores later
  const [availableTasks] = createSignal([
    { taskId: 1, title: "Task 1" },
    { taskId: 2, title: "Task 2" },
  ]);
  const [availableSessions] = createSignal([]);

  // Track expanded event indices
  const [expandedEvents, setExpandedEvents] = createSignal<Set<number>>(
    new Set(),
  );

  // Get event count for keyboard navigation
  const eventCount = () => Object.keys(events).length;

  // Initialize keyboard navigation
  const keyboardNav = useKeyboardNav({
    eventCount,
    onToggleExpand: (eventIndex: number) => {
      setExpandedEvents((prev) => {
        const next = new Set(prev);
        if (next.has(eventIndex)) {
          next.delete(eventIndex);
        } else {
          next.add(eventIndex);
        }
        return next;
      });
    },
  });

  const handleTaskChange = (taskId: number) => {
    // Send switch_task to extension which will fetch sessions for this task
    vscode.postMessage({
      type: "switch_task",
      taskId,
    });
  };

  const handleSessionChange = (sessionId: string) => {
    vscode.postMessage({
      type: "switch_session",
      sessionId,
    });
  };

  const handleStop = () => {
    vscode.postMessage({ type: "stop_agent" });
  };

  const handleSendMessage = (text: string) => {
    vscode.postMessage({ type: "user_message", text });
  };

  return (
    <div class="h-screen flex flex-col overflow-hidden text-zinc-400 selection:bg-indigo-500/20 selection:text-indigo-200">
      <StatusBar />
      <FileActivityPanel />
      <div class="flex-1 min-h-0 overflow-hidden">
        <TimelineView focusedEventIndex={keyboardNav.focusedEventIndex} />
      </div>
      <FooterInput session={session} onSendMessage={handleSendMessage} />
    </div>
  );
}

console.log("[AgentPanel] Starting render");
const renderStart = performance.now();
// Clear the loading spinner - SolidJS render() APPENDS to the container,
// it does NOT replace existing children. Without this, the loading-container
// div stays in the DOM at 100% height, pushing the app off-screen.
const rootEl = document.getElementById("root")!;
rootEl.innerHTML = "";
render(() => <App />, rootEl);
const renderTime = performance.now() - renderStart;
const totalTime = performance.now() - moduleLoadStart;
console.log(`[AgentPanel] Render complete (${renderTime.toFixed(2)}ms)`);
console.log(
  `[AgentPanel] Total module initialization: ${totalTime.toFixed(2)}ms`,
);
