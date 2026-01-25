/**
 * HTML template for AgentOutputPanel webview
 */

import { getAgentOutputStyles } from "./agentOutputStyles.js";

export interface AgentOutputItem {
  id: string;
  type: "thinking" | "tool_call" | "tool_result";
  timestamp: string;
  content:
    | { text: string }
    | { toolName: string; arguments: Record<string, unknown> }
    | { toolName: string; success: boolean; output: string; error?: string };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function renderThinking(item: AgentOutputItem): string {
  const content = item.content as { text: string };
  return `
    <div class="output-item output-thinking" data-id="${escapeHtml(item.id)}" id="output-${escapeHtml(item.id)}">
      <div class="output-meta">
        <span class="pill pill-thinking">Thinking</span>
        <span>${escapeHtml(item.timestamp)}</span>
      </div>
      <div class="thinking-text">${escapeHtml(content.text)}</div>
    </div>
  `;
}

function renderToolCall(item: AgentOutputItem): string {
  const content = item.content as { toolName: string; arguments: Record<string, unknown> };
  return `
    <div class="output-item output-tool-call" data-id="${escapeHtml(item.id)}" id="output-${escapeHtml(item.id)}">
      <div class="output-meta">
        <span class="pill pill-tool-call">Tool Call</span>
        <span>${escapeHtml(item.timestamp)}</span>
      </div>
      <div class="tool-call-title">${escapeHtml(content.toolName)}</div>
      <pre class="tool-arguments">${escapeHtml(formatJson(content.arguments))}</pre>
    </div>
  `;
}

function renderToolResult(item: AgentOutputItem): string {
  const content = item.content as { toolName: string; success: boolean; output: string; error?: string };
  const resultClass = content.success ? "" : "error";
  const statusLabel = content.success ? "Success" : "Error";
  const errorBlock = content.error
    ? `<pre class="tool-error">${escapeHtml(content.error)}</pre>`
    : "";

  return `
    <div class="output-item output-tool-result" data-id="${escapeHtml(item.id)}" id="output-${escapeHtml(item.id)}">
      <div class="output-meta">
        <span class="pill pill-tool-result ${resultClass}">${statusLabel}</span>
        <span>${escapeHtml(item.timestamp)}</span>
      </div>
      <details class="tool-result" ${content.success ? "" : "open"}>
        <summary>${escapeHtml(content.toolName)}</summary>
        <div class="tool-result-body">
          <pre class="tool-output">${escapeHtml(content.output)}</pre>
          ${errorBlock}
        </div>
      </details>
    </div>
  `;
}

function renderOutputItem(item: AgentOutputItem): string {
  if (item.type === "thinking") {
    return renderThinking(item);
  }
  if (item.type === "tool_call") {
    return renderToolCall(item);
  }
  return renderToolResult(item);
}

function getScript(): string {
  return `
    const vscode = acquireVsCodeApi();

    function escapeHtml(text) {
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function formatJson(value) {
      try {
        return JSON.stringify(value, null, 2);
      } catch (error) {
        return String(value);
      }
    }

    function renderItem(item) {
      const container = document.createElement("div");
      container.classList.add("output-item");
      container.dataset.id = item.id;
      container.id = "output-" + item.id;

      const meta = document.createElement("div");
      meta.classList.add("output-meta");

      const pill = document.createElement("span");
      pill.classList.add("pill");

      const timestamp = document.createElement("span");
      timestamp.textContent = item.timestamp;

      meta.appendChild(pill);
      meta.appendChild(timestamp);

      container.appendChild(meta);

      if (item.type === "thinking") {
        container.classList.add("output-thinking");
        pill.classList.add("pill-thinking");
        pill.textContent = "Thinking";

        const body = document.createElement("div");
        body.classList.add("thinking-text");
        body.textContent = item.content.text;
        container.appendChild(body);
        return container;
      }

      if (item.type === "tool_call") {
        container.classList.add("output-tool-call");
        pill.classList.add("pill-tool-call");
        pill.textContent = "Tool Call";

        const title = document.createElement("div");
        title.classList.add("tool-call-title");
        title.textContent = item.content.toolName;

        const args = document.createElement("pre");
        args.classList.add("tool-arguments");
        args.textContent = formatJson(item.content.arguments);

        container.appendChild(title);
        container.appendChild(args);
        return container;
      }

      container.classList.add("output-tool-result");
      pill.classList.add("pill-tool-result");
      pill.textContent = item.content.success ? "Success" : "Error";
      if (!item.content.success) {
        pill.classList.add("error");
      }

      const details = document.createElement("details");
      details.classList.add("tool-result");
      if (!item.content.success) {
        details.open = true;
      }

      const summary = document.createElement("summary");
      summary.textContent = item.content.toolName;

      const body = document.createElement("div");
      body.classList.add("tool-result-body");

      const output = document.createElement("pre");
      output.classList.add("tool-output");
      output.textContent = item.content.output;

      body.appendChild(output);

      if (item.content.error) {
        const errorBlock = document.createElement("pre");
        errorBlock.classList.add("tool-error");
        errorBlock.textContent = item.content.error;
        body.appendChild(errorBlock);
      }

      details.appendChild(summary);
      details.appendChild(body);
      container.appendChild(details);

      return container;
    }

    function addOutput(item) {
      const list = document.getElementById("output-list");
      const empty = document.getElementById("empty-state");
      if (empty) {
        empty.remove();
      }
      const element = renderItem(item);
      list.appendChild(element);
    }

    function clearOutput() {
      const list = document.getElementById("output-list");
      list.innerHTML = "";
      const container = document.getElementById("content");
      const empty = document.createElement("div");
      empty.id = "empty-state";
      empty.classList.add("empty-state");
      empty.textContent = "Agent output will appear here.";
      container.appendChild(empty);
    }

    function updateStatus(status) {
      const statusEl = document.getElementById("panel-status");
      if (statusEl) {
        statusEl.textContent = status;
      }
    }

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message || !message.type) {
        return;
      }

      if (message.type === "addOutput") {
        addOutput(message.output);
      }

      if (message.type === "clear") {
        clearOutput();
      }

      if (message.type === "updateStatus") {
        updateStatus(message.status);
      }
    });

    vscode.postMessage({ type: "ready" });
  `;
}

export function generateAgentOutputHtml(
  items: AgentOutputItem[],
  cspSource: string,
  status = "Idle",
  nonce = "",
): string {
  const style = getAgentOutputStyles();
  const outputItems = items.map(renderOutputItem).join("\n");
  const emptyState = items.length
    ? ""
    : `<div id="empty-state" class="empty-state">Agent output will appear here.</div>`;

  const scriptNonce = nonce || "1";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'nonce-${scriptNonce}';" />
  <title>Agent Output</title>
  <style>${style}</style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="title">Agent Output</div>
      <div id="panel-status" class="status">${escapeHtml(status)}</div>
    </header>
    <main id="content" class="content">
      <div id="output-list">
        ${outputItems}
      </div>
      ${emptyState}
    </main>
  </div>
  <script nonce="${scriptNonce}">${getScript()}</script>
</body>
</html>`;
}
