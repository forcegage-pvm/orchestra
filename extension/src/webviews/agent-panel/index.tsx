import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { SessionHeader } from "./components/SessionHeader.js";
import { initializeMessageHandler } from "./protocol/index.js";
import { sessionStore } from "./stores/sessionStore.js";
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
        session={sessionStore.currentSession()}
        availableTasks={availableTasks()}
        availableSessions={availableSessions()}
        onStop={handleStop}
        onTaskChange={handleTaskChange}
        onSessionChange={handleSessionChange}
      />
      <div>Agent Panel Content</div>
    </div>
  );
}

render(() => <App />, document.getElementById("root")!);
