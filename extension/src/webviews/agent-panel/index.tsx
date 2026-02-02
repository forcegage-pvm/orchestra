import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { SessionHeader } from "./components/SessionHeader.js";
import { useKeyboardNav } from "./hooks/index.js";
import { initializeMessageHandler } from "./protocol/index.js";
import { events, session } from "./stores/sessionStore.js";
import "./styles.css";

// Initialize message handler for Extension ↔ Webview communication
initializeMessageHandler();

// Get vscode API
declare const acquireVsCodeApi: () => {
  postMessage: (message: unknown) => void;
};
const vscode = acquireVsCodeApi();

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
    // For now, just post switch_session with a placeholder sessionId
    // In full implementation, this would look up the most recent session for the task
    vscode.postMessage({
      type: "switch_session",
      sessionId: `session-for-task-${taskId}`,
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
      <div>
        Agent Panel Content
        {/* Keyboard Navigation State (for debugging/development) */}
        <div class="text-xs text-gray-600 p-2">
          Focused Event: {keyboardNav.focusedEventIndex()}
        </div>
      </div>
    </div>
  );
}

render(() => <App />, document.getElementById("root")!);
