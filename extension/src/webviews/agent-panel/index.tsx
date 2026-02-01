import { render } from "solid-js/web";
import { initializeMessageHandler } from "./protocol/index.js";
import "./styles.css";

// Initialize message handler for Extension ↔ Webview communication
initializeMessageHandler();

function App() {
  return <div>Agent Panel</div>;
}

render(() => <App />, document.getElementById("root")!);
