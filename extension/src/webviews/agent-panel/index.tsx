import { render } from "solid-js/web";
import "./styles.css";
import { initializeMessageHandler } from "./protocol/index.js";

// Initialize message handler for Extension ↔ Webview communication
initializeMessageHandler();

function App() {
  return <div>Agent Panel</div>;
}

render(() => <App />, document.getElementById("root")!);
