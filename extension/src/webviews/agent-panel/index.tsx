import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { SessionHeader } from "./components/SessionHeader.js";
import { useKeyboardNav } from "./hooks/index.js";
import { initializeMessageHandler } from "./protocol/index.js";
import { events, session } from "./stores/sessionStore.js";
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
    <div>
      <SessionHeader
        session={session}
        availableTasks={availableTasks()}
        availableSessions={availableSessions()}
        onStop={handleStop}
        onTaskChange={handleTaskChange}
        onSessionChange={handleSessionChange}
      />
      <TimelineView focusedEventIndex={keyboardNav.focusedEventIndex} />
    </div>
  );
}

render(() => <App />, document.getElementById("root")!);
