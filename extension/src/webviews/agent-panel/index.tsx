import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { FileActivityPanel } from "./components/FileActivityPanel.js";
import { StatusBar } from "./components/StatusBar.js";
import { useKeyboardNav } from "./hooks/index.js";
import { initializeMessageHandler } from "./protocol/index.js";
import { events } from "./stores/sessionStore.js";
import "./styles.css";
import { TimelineView } from "./views/index.js";

// Get VS Code API - must be called ONCE and stored globally for protocol handler
declare const acquireVsCodeApi: () => {
  postMessage: (message: unknown) => void;
};
const vscode = acquireVsCodeApi();

// Make vscode API available globally for protocol handler to use
declare global {
  interface Window {
    vscode: typeof vscode;
  }
}
window.vscode = vscode;

// Initialize message handler AFTER setting window.vscode
initializeMessageHandler();

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

  return (
    <div class="h-screen flex flex-col overflow-hidden text-zinc-400 selection:bg-indigo-500/20 selection:text-indigo-200">
      <StatusBar />
      <FileActivityPanel />
      <div class="flex-1 min-h-0 overflow-hidden">
        <TimelineView focusedEventIndex={keyboardNav.focusedEventIndex} />
      </div>
    </div>
  );
}

render(() => <App />, document.getElementById("root")!);
