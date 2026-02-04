/**
 * HTML template for AgentOutputPanel webview
 */

import { getAgentOutputStyles } from "./agentOutputStyles.js";

/**
 * File operation info for display
 */
export interface FileOperationInfo {
  operation: "create" | "update" | "delete" | "move" | "copy" | "read";
  path: string;
  targetPath?: string;
  size?: number;
  linesChanged?: number;
}

export interface AgentOutputItem {
  id: string;
  type:
    | "prompt"
    | "thinking"
    | "tool_call"
    | "tool_result"
    | "tool_progress"
    | "tool_output"
    | "tool_file_operation"
    | "tool_metadata"
    | "unknown";
  timestamp: string;
  content:
    | { text: string; attachments?: Array<{ name: string; path: string }> }
    | { toolName: string; arguments: Record<string, unknown> }
    | { toolName: string; success: boolean; output: string; error?: string }
    | { toolName: string; message: string; percent?: number } // tool_progress
    | { toolName: string; chunk: string } // tool_output
    | { toolName: string; fileOperation: FileOperationInfo } // tool_file_operation
    | { toolName: string; metadata: Record<string, unknown> } // tool_metadata
    | { rawType: string; rawOutput: string };
  debug?: { tokenCount?: number; durationMs?: number };
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

const jsonTokenPattern =
  /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\\"])*"(?:\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;

function highlightCode(value: string): string {
  let result = "";
  let lastIndex = 0;
  for (const match of value.matchAll(jsonTokenPattern)) {
    const matchIndex = match.index ?? 0;
    const token = match[0] ?? "";
    result += escapeHtml(value.slice(lastIndex, matchIndex));

    let className = "token-number";
    if (token.startsWith('"')) {
      className = token.endsWith(":") ? "token-key" : "token-string";
    } else if (token === "true" || token === "false") {
      className = "token-boolean";
    } else if (token === "null") {
      className = "token-null";
    }

    result += `<span class="${className}">${escapeHtml(token)}</span>`;
    lastIndex = matchIndex + token.length;
  }

  result += escapeHtml(value.slice(lastIndex));
  return result;
}

function highlightJson(value: unknown): string {
  return highlightCode(formatJson(value));
}

function highlightMaybeJson(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return highlightJson(parsed);
  } catch {
    return highlightCode(value);
  }
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function formatDebugInfo(debug?: {
  tokenCount?: number;
  durationMs?: number;
}): string {
  if (!debug) {
    return "";
  }

  const tokens =
    typeof debug.tokenCount === "number" ? `${debug.tokenCount} tokens` : "";
  const duration =
    typeof debug.durationMs === "number" ? `${debug.durationMs} ms` : "";
  return [tokens, duration].filter(Boolean).join(" • ");
}

function renderDebugMeta(item: AgentOutputItem): string {
  const info = formatDebugInfo(item.debug);
  if (!info) {
    return "";
  }

  return `<div class="output-debug">${escapeHtml(info)}</div>`;
}

function renderPrompt(item: AgentOutputItem): string {
  const content = item.content as {
    text: string;
    attachments?: Array<{ name: string; path: string }>;
  };
  const attachmentsHtml =
    content.attachments && content.attachments.length > 0
      ? `
      <div class="prompt-attachments">
        <div class="attachments-header">📎 Context Files:</div>
        <ul class="attachments-list">
          ${content.attachments.map((a) => `<li class="attachment-item" title="${escapeHtml(a.path)}">${escapeHtml(a.name)}</li>`).join("")}
        </ul>
      </div>
    `
      : "";
  return `
    <div class="output-item output-prompt" data-id="${escapeHtml(item.id)}" id="output-${escapeHtml(item.id)}">
      <div class="output-meta">
        <span class="pill pill-prompt">Prompt</span>
        <span>${escapeHtml(item.timestamp)}</span>
      </div>
      ${attachmentsHtml}
      <div class="prompt-text">${escapeHtml(content.text)}</div>
    </div>
  `;
}

function renderUnknown(item: AgentOutputItem): string {
  const content = item.content as { rawType: string; rawOutput: string };
  return `
    <div class="output-item output-unknown" data-id="${escapeHtml(item.id)}" id="output-${escapeHtml(item.id)}">
      <div class="output-meta">
        <span class="pill pill-unknown">Unregistered: ${escapeHtml(content.rawType)}</span>
        <span>${escapeHtml(item.timestamp)}</span>
      </div>
      <pre class="unknown-text code-block">${escapeHtml(content.rawOutput)}</pre>
    </div>
  `;
}

function renderThinking(item: AgentOutputItem): string {
  const content = item.content as { text: string };
  const debugMeta = renderDebugMeta(item);
  return `
    <div class="output-item output-thinking" data-id="${escapeHtml(item.id)}" id="output-${escapeHtml(item.id)}">
      <div class="output-meta">
        <span class="pill pill-thinking">Thinking</span>
        <span>${escapeHtml(item.timestamp)}</span>
      </div>
      ${debugMeta}
      <div class="thinking-text">${escapeHtml(content.text)}</div>
    </div>
  `;
}

function renderToolCall(item: AgentOutputItem): string {
  const content = item.content as {
    toolName: string;
    arguments: Record<string, unknown>;
  };
  const debugMeta = renderDebugMeta(item);
  return `
    <div class="output-item output-tool-call" data-id="${escapeHtml(item.id)}" id="output-${escapeHtml(item.id)}">
      <div class="output-meta">
        <span class="pill pill-tool-call">Tool Call</span>
        <span>${escapeHtml(item.timestamp)}</span>
      </div>
      ${debugMeta}
      <div class="tool-call-title">${escapeHtml(content.toolName)}</div>
      <pre class="tool-arguments code-block">${highlightJson(content.arguments)}</pre>
    </div>
  `;
}

function renderToolResult(item: AgentOutputItem): string {
  const content = item.content as {
    toolName: string;
    success: boolean;
    output: string;
    error?: string;
  };
  const debugMeta = renderDebugMeta(item);
  const resultClass = content.success ? "" : "error";
  const statusLabel = content.success ? "Success" : "Error";
  const errorBlock = content.error
    ? `<pre class="tool-error code-block">${highlightMaybeJson(content.error)}</pre>`
    : "";

  return `
    <div class="output-item output-tool-result" data-id="${escapeHtml(item.id)}" id="output-${escapeHtml(item.id)}">
      <div class="output-meta">
        <span class="pill pill-tool-result ${resultClass}">${statusLabel}</span>
        <span>${escapeHtml(item.timestamp)}</span>
      </div>
      ${debugMeta}
      <details class="tool-result" ${content.success ? "" : "open"}>
        <summary>${escapeHtml(content.toolName)}</summary>
        <div class="tool-result-body">
          <pre class="tool-output code-block">${highlightMaybeJson(content.output)}</pre>
          ${errorBlock}
        </div>
      </details>
    </div>
  `;
}

function renderToolProgress(item: AgentOutputItem): string {
  const content = item.content as {
    toolName: string;
    message: string;
    percent?: number;
  };
  const progressBar =
    typeof content.percent === "number"
      ? `<div class="progress-bar"><div class="progress-fill" style="width: ${content.percent}%"></div></div>`
      : "";
  const percentText =
    typeof content.percent === "number" ? ` (${content.percent}%)` : "";

  return `
    <div class="output-item output-tool-progress" data-id="${escapeHtml(item.id)}" id="output-${escapeHtml(item.id)}">
      <div class="output-meta">
        <span class="pill pill-progress">⏳ Progress</span>
        <span>${escapeHtml(item.timestamp)}</span>
      </div>
      <div class="progress-content">
        <span class="tool-name">${escapeHtml(content.toolName)}</span>
        <span class="progress-message">${escapeHtml(content.message)}${percentText}</span>
        ${progressBar}
      </div>
    </div>
  `;
}

function renderToolOutput(item: AgentOutputItem): string {
  const content = item.content as {
    toolName: string;
    chunk: string;
  };

  return `
    <div class="output-item output-tool-stream" data-id="${escapeHtml(item.id)}" id="output-${escapeHtml(item.id)}">
      <div class="output-meta">
        <span class="pill pill-stream">📤 Output</span>
        <span>${escapeHtml(item.timestamp)}</span>
      </div>
      <div class="stream-content">
        <span class="tool-name">${escapeHtml(content.toolName)}</span>
        <pre class="stream-chunk">${escapeHtml(content.chunk)}</pre>
      </div>
    </div>
  `;
}

function renderToolFileOperation(item: AgentOutputItem): string {
  const content = item.content as {
    toolName: string;
    fileOperation: FileOperationInfo;
  };
  const op = content.fileOperation;
  const opIcons: Record<string, string> = {
    create: "📄",
    update: "✏️",
    delete: "🗑️",
    move: "📁",
    copy: "📋",
    read: "👁️",
  };
  const icon = opIcons[op.operation] ?? "📄";
  const targetInfo = op.targetPath ? ` → ${escapeHtml(op.targetPath)}` : "";
  const sizeInfo =
    typeof op.size === "number" ? ` (${formatBytes(op.size)})` : "";
  const linesInfo =
    typeof op.linesChanged === "number" ? ` [${op.linesChanged} lines]` : "";

  return `
    <div class="output-item output-file-operation" data-id="${escapeHtml(item.id)}" id="output-${escapeHtml(item.id)}">
      <div class="output-meta">
        <span class="pill pill-file-op">${icon} ${escapeHtml(op.operation.toUpperCase())}</span>
        <span>${escapeHtml(item.timestamp)}</span>
      </div>
      <div class="file-op-content">
        <span class="file-path">${escapeHtml(op.path)}${targetInfo}</span>
        <span class="file-meta">${sizeInfo}${linesInfo}</span>
      </div>
    </div>
  `;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderToolMetadata(item: AgentOutputItem): string {
  const content = item.content as {
    toolName: string;
    metadata: Record<string, unknown>;
  };

  return `
    <div class="output-item output-tool-metadata" data-id="${escapeHtml(item.id)}" id="output-${escapeHtml(item.id)}">
      <div class="output-meta">
        <span class="pill pill-metadata">ℹ️ Info</span>
        <span>${escapeHtml(item.timestamp)}</span>
      </div>
      <div class="metadata-content">
        <span class="tool-name">${escapeHtml(content.toolName)}</span>
        <pre class="metadata-json code-block">${highlightJson(content.metadata)}</pre>
      </div>
    </div>
  `;
}

function renderOutputItem(item: AgentOutputItem): string {
  if (item.type === "prompt") {
    return renderPrompt(item);
  }
  if (item.type === "unknown") {
    return renderUnknown(item);
  }
  if (item.type === "thinking") {
    return renderThinking(item);
  }
  if (item.type === "tool_call") {
    return renderToolCall(item);
  }
  if (item.type === "tool_progress") {
    return renderToolProgress(item);
  }
  if (item.type === "tool_output") {
    return renderToolOutput(item);
  }
  if (item.type === "tool_file_operation") {
    return renderToolFileOperation(item);
  }
  if (item.type === "tool_metadata") {
    return renderToolMetadata(item);
  }
  return renderToolResult(item);
}

function getScript(initialItemsJson: string): string {
  return `
    const vscode = acquireVsCodeApi();
    const initialItems = ${initialItemsJson};
    const MAX_ITEMS = 500;
    const BUFFER = 8;
    let renderPending = false;
    let averageItemHeight = 120;
    let lastStart = -1;
    let lastEnd = -1;
    const state = {
      items: Array.isArray(initialItems) ? initialItems : [],
    };

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

    // Simplified: No regex-based syntax highlighting to avoid document.write escaping issues
    function highlightCode(value) {
      return escapeHtml(value);
    }

    function highlightJson(value) {
      return escapeHtml(formatJson(value));
    }

    function highlightMaybeJson(value) {
      const trimmed = value.trim();
      if (!trimmed) {
        return "";
      }

      try {
        const parsed = JSON.parse(trimmed);
        return highlightJson(parsed);
      } catch (error) {
        return highlightCode(value);
      }
    }

    function formatDebugInfo(debug) {
      if (!debug) {
        return "";
      }

      const tokens =
        typeof debug.tokenCount === "number" ? debug.tokenCount + " tokens" : "";
      const duration =
        typeof debug.durationMs === "number" ? debug.durationMs + " ms" : "";
      return [tokens, duration].filter(Boolean).join(" • ");
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

      if (item.debug) {
        const debugText = formatDebugInfo(item.debug);
        if (debugText) {
          const debug = document.createElement("div");
          debug.classList.add("output-debug");
          debug.textContent = debugText;
          container.appendChild(debug);
        }
      }

      if (item.type === "prompt") {
        container.classList.add("output-prompt");
        pill.classList.add("pill-prompt");
        pill.textContent = "Prompt";

        // Add attachments section if present
        if (item.content.attachments && item.content.attachments.length > 0) {
          const attachmentsDiv = document.createElement("div");
          attachmentsDiv.classList.add("prompt-attachments");

          const header = document.createElement("div");
          header.classList.add("attachments-header");
          header.textContent = "📎 Context Files:";
          attachmentsDiv.appendChild(header);

          const list = document.createElement("ul");
          list.classList.add("attachments-list");
          item.content.attachments.forEach(function(a) {
            const li = document.createElement("li");
            li.classList.add("attachment-item");
            li.textContent = a.name;
            li.title = a.path;
            list.appendChild(li);
          });
          attachmentsDiv.appendChild(list);
          container.appendChild(attachmentsDiv);
        }

        const body = document.createElement("div");
        body.classList.add("prompt-text");
        body.textContent = item.content.text;
        container.appendChild(body);
        return container;
      }

      if (item.type === "unknown") {
        container.classList.add("output-unknown");
        pill.classList.add("pill-unknown");
        pill.textContent = "Unregistered: " + (item.content.rawType || "unknown");

        const body = document.createElement("pre");
        body.classList.add("unknown-text", "code-block");
        body.textContent = item.content.rawOutput || "";
        container.appendChild(body);
        return container;
      }

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
        args.classList.add("tool-arguments", "code-block");
        args.innerHTML = highlightJson(item.content.arguments);

        container.appendChild(title);
        container.appendChild(args);
        return container;
      }

      if (item.type === "tool_progress") {
        container.classList.add("output-tool-progress");
        pill.classList.add("pill-progress");
        pill.textContent = "⏳ Progress";

        const progressContent = document.createElement("div");
        progressContent.classList.add("progress-content");

        const toolName = document.createElement("span");
        toolName.classList.add("tool-name");
        toolName.textContent = item.content.toolName;
        progressContent.appendChild(toolName);

        const message = document.createElement("span");
        message.classList.add("progress-message");
        const percentText = typeof item.content.percent === "number" ? " (" + item.content.percent + "%)" : "";
        message.textContent = (item.content.message || "") + percentText;
        progressContent.appendChild(message);

        if (typeof item.content.percent === "number") {
          const progressBar = document.createElement("div");
          progressBar.classList.add("progress-bar");
          const progressFill = document.createElement("div");
          progressFill.classList.add("progress-fill");
          progressFill.style.width = item.content.percent + "%";
          progressBar.appendChild(progressFill);
          progressContent.appendChild(progressBar);
        }

        container.appendChild(progressContent);
        return container;
      }

      if (item.type === "tool_output") {
        container.classList.add("output-tool-stream");
        pill.classList.add("pill-stream");
        pill.textContent = "📤 Output";

        const streamContent = document.createElement("div");
        streamContent.classList.add("stream-content");

        const toolName = document.createElement("span");
        toolName.classList.add("tool-name");
        toolName.textContent = item.content.toolName;
        streamContent.appendChild(toolName);

        const chunk = document.createElement("pre");
        chunk.classList.add("stream-chunk");
        chunk.textContent = item.content.chunk || "";
        streamContent.appendChild(chunk);

        container.appendChild(streamContent);
        return container;
      }

      if (item.type === "tool_file_operation") {
        const op = item.content.fileOperation || {};
        const opIcons = {
          create: "📄",
          update: "✏️",
          delete: "🗑️",
          move: "📁",
          copy: "📋",
          read: "👁️"
        };
        const icon = opIcons[op.operation] || "📄";

        container.classList.add("output-file-operation");
        pill.classList.add("pill-file-op");
        pill.textContent = icon + " " + (op.operation || "FILE").toUpperCase();

        const fileOpContent = document.createElement("div");
        fileOpContent.classList.add("file-op-content");

        const filePath = document.createElement("span");
        filePath.classList.add("file-path");
        let pathText = op.path || "";
        if (op.targetPath) {
          pathText += " → " + op.targetPath;
        }
        filePath.textContent = pathText;
        fileOpContent.appendChild(filePath);

        const fileMeta = document.createElement("span");
        fileMeta.classList.add("file-meta");
        let metaText = "";
        if (typeof op.size === "number") {
          metaText += " (" + formatBytes(op.size) + ")";
        }
        if (typeof op.linesChanged === "number") {
          metaText += " [" + op.linesChanged + " lines]";
        }
        fileMeta.textContent = metaText;
        fileOpContent.appendChild(fileMeta);

        container.appendChild(fileOpContent);
        return container;
      }

      if (item.type === "tool_metadata") {
        container.classList.add("output-tool-metadata");
        pill.classList.add("pill-metadata");
        pill.textContent = "ℹ️ Info";

        const metaContent = document.createElement("div");
        metaContent.classList.add("metadata-content");

        const toolName = document.createElement("span");
        toolName.classList.add("tool-name");
        toolName.textContent = item.content.toolName;
        metaContent.appendChild(toolName);

        const metaJson = document.createElement("pre");
        metaJson.classList.add("metadata-json", "code-block");
        metaJson.innerHTML = highlightJson(item.content.metadata || {});
        metaContent.appendChild(metaJson);

        container.appendChild(metaContent);
        return container;
      }

      // Default: tool_result
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
      output.classList.add("tool-output", "code-block");
      output.innerHTML = highlightMaybeJson(item.content.output);

      body.appendChild(output);

      if (item.content.error) {
        const errorBlock = document.createElement("pre");
        errorBlock.classList.add("tool-error", "code-block");
        errorBlock.innerHTML = highlightMaybeJson(item.content.error);
        body.appendChild(errorBlock);
      }

      details.appendChild(summary);
      details.appendChild(body);
      container.appendChild(details);

      return container;
    }

    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    function addOutput(item) {
      state.items.push(item);
      if (state.items.length > MAX_ITEMS) {
        pruneItems(state.items.length - MAX_ITEMS);
      }
      scheduleRender();
    }

    function clearOutput() {
      state.items = [];
      lastStart = -1;
      lastEnd = -1;
      scheduleRender();
    }

    function normalizeStatus(status) {
      if (!status) {
        return "idle";
      }
      return String(status).trim().toLowerCase().replace(/\s+/g, "-");
    }

    function updateStatus(status) {
      const statusEl = document.getElementById("panel-status");
      if (statusEl) {
        statusEl.textContent = status;
      }
      document.body.dataset.agentStatus = normalizeStatus(status);
    }

    function pruneItems(count) {
      if (!count) {
        return;
      }

      const container = document.getElementById("content");
      if (container) {
        container.scrollTop = Math.max(0, container.scrollTop - count * averageItemHeight);
      }

      state.items.splice(0, count);
      lastStart = -1;
      lastEnd = -1;
      scheduleRender();
    }

    function updateEmptyState() {
      const content = document.getElementById("content");
      const existing = document.getElementById("empty-state");
      if (!content) {
        return;
      }

      if (state.items.length === 0) {
        if (!existing) {
          const empty = document.createElement("div");
          empty.id = "empty-state";
          empty.classList.add("empty-state");
          empty.textContent = "Agent output will appear here.";
          content.appendChild(empty);
        }
        return;
      }

      if (existing) {
        existing.remove();
      }
    }

    function renderWindow() {
      const content = document.getElementById("content");
      const list = document.getElementById("output-list");
      const itemsContainer = document.getElementById("virtual-items");
      const topSpacer = document.getElementById("virtual-spacer-top");
      const bottomSpacer = document.getElementById("virtual-spacer-bottom");
      if (!content || !list || !itemsContainer || !topSpacer || !bottomSpacer) {
        return;
      }

      const viewportHeight = content.clientHeight || 1;
      const scrollTop = content.scrollTop || 0;
      const totalItems = state.items.length;
      if (totalItems === 0) {
        itemsContainer.innerHTML = "";
        topSpacer.style.height = "0px";
        bottomSpacer.style.height = "0px";
        updateEmptyState();
        return;
      }

      const start = Math.max(0, Math.floor(scrollTop / averageItemHeight) - BUFFER);
      const end = Math.min(
        totalItems,
        Math.ceil((scrollTop + viewportHeight) / averageItemHeight) + BUFFER,
      );

      if (start === lastStart && end === lastEnd) {
        return;
      }

      lastStart = start;
      lastEnd = end;
      topSpacer.style.height = String(start * averageItemHeight) + "px";
      bottomSpacer.style.height = String((totalItems - end) * averageItemHeight) + "px";
      itemsContainer.innerHTML = "";
      for (let i = start; i < end; i += 1) {
        itemsContainer.appendChild(renderItem(state.items[i]));
      }

      requestAnimationFrame(() => {
        const children = itemsContainer.children;
        if (children.length > 0) {
          const totalHeight = itemsContainer.getBoundingClientRect().height;
          averageItemHeight = Math.max(60, totalHeight / children.length);
        }
      });

      updateEmptyState();
    }

    function scheduleRender() {
      if (renderPending) {
        return;
      }

      renderPending = true;
      requestAnimationFrame(() => {
        renderPending = false;
        renderWindow();
      });
    }

    function bindControls() {
      const pauseBtn = document.getElementById("agent-control-pause");
      const resumeBtn = document.getElementById("agent-control-resume");
      const stopBtn = document.getElementById("agent-control-stop");
      const redirectInput = document.getElementById("agent-redirect-input");
      const redirectSend = document.getElementById("agent-redirect-send");

      if (pauseBtn) {
        pauseBtn.addEventListener("click", () => {
          vscode.postMessage({ type: "pause" });
        });
      }

      if (resumeBtn) {
        resumeBtn.addEventListener("click", () => {
          vscode.postMessage({ type: "resume" });
        });
      }

      if (stopBtn) {
        stopBtn.addEventListener("click", () => {
          vscode.postMessage({ type: "stop" });
        });
      }

      function sendRedirect() {
        if (!redirectInput) {
          return;
        }
        const instruction = redirectInput.value.trim();
        if (!instruction) {
          return;
        }
        vscode.postMessage({ type: "redirect", instruction });
        redirectInput.value = "";
      }

      if (redirectSend) {
        redirectSend.addEventListener("click", () => {
          sendRedirect();
        });
      }

      if (redirectInput) {
        redirectInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            sendRedirect();
          }
        });
      }

      const copyAllBtn = document.getElementById("agent-control-copy-all");
      if (copyAllBtn) {
        copyAllBtn.addEventListener("click", () => {
          copyAllOutput();
        });
      }
    }

    function formatItemAsText(item) {
      const lines = [];
      const time = item.timestamp || "";
      
      if (item.type === "prompt") {
        lines.push("=== PROMPT [" + time + "] ===");
        lines.push(item.content.text || "");
      } else if (item.type === "unknown") {
        lines.push("=== UNREGISTERED MESSAGE [" + time + "] type=" + (item.content.rawType || "unknown") + " ===");
        lines.push(item.content.rawOutput || "");
      } else if (item.type === "thinking") {
        lines.push("=== THINKING [" + time + "] ===");
        lines.push(item.content.text || "");
      } else if (item.type === "tool_call") {
        lines.push("=== TOOL CALL [" + time + "] ===");
        lines.push("Tool: " + (item.content.toolName || "unknown"));
        lines.push("Arguments:");
        lines.push(formatJson(item.content.arguments || {}));
      } else if (item.type === "tool_result") {
        const status = item.content.success ? "SUCCESS" : "ERROR";
        lines.push("=== TOOL RESULT [" + time + "] " + status + " ===");
        lines.push("Tool: " + (item.content.toolName || "unknown"));
        if (item.content.output) {
          lines.push("Output:");
          lines.push(item.content.output);
        }
        if (item.content.error) {
          lines.push("Error:");
          lines.push(item.content.error);
        }
      }
      
      return lines.join("\\n");
    }

    function copyAllOutput() {
      if (state.items.length === 0) {
        return;
      }
      
      const textParts = state.items.map(formatItemAsText);
      const fullText = textParts.join("\\n\\n");
      
      navigator.clipboard.writeText(fullText).then(() => {
        const copyBtn = document.getElementById("agent-control-copy-all");
        if (copyBtn) {
          const originalTitle = copyBtn.title;
          copyBtn.title = "Copied!";
          copyBtn.classList.add("copied");
          setTimeout(() => {
            copyBtn.title = originalTitle;
            copyBtn.classList.remove("copied");
          }, 1500);
        }
      }).catch((err) => {
        console.error("Failed to copy:", err);
      });
    }

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message || !message.type) {
        return;
      }

      if (message.type === "batch") {
        for (const entry of message.messages || []) {
          if (entry.type === "addOutput") {
            addOutput(entry.output);
          }
          if (entry.type === "clear") {
            clearOutput();
          }
          if (entry.type === "updateStatus") {
            updateStatus(entry.status);
          }
          if (entry.type === "prune") {
            pruneItems(entry.count || 0);
          }
        }
        return;
      }

      if (message.type === "addOutput") {
        addOutput(message.output);
        return;
      }

      if (message.type === "clear") {
        clearOutput();
        return;
      }

      if (message.type === "updateStatus") {
        updateStatus(message.status);
        return;
      }

      if (message.type === "prune") {
        pruneItems(message.count || 0);
      }
    });

    const content = document.getElementById("content");
    if (content) {
      content.addEventListener("scroll", () => {
        scheduleRender();
      });
    }

    scheduleRender();
    bindControls();

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
  const initialRenderCount = 20;
  const outputItems = items.length
    ? items.slice(0, initialRenderCount).map(renderOutputItem).join("\n")
    : "";
  const emptyState = items.length
    ? ""
    : `<div id="empty-state" class="empty-state">Agent output will appear here.</div>`;

  const statusKey = status.trim().toLowerCase().replace(/\s+/g, "-") || "idle";

  const scriptNonce = nonce || "1";
  const initialItemsJson = serializeForScript(items);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'nonce-${scriptNonce}';" />
  <title>Agent Output</title>
  <style>${style}</style>
</head>
<body data-agent-status="${escapeHtml(statusKey)}">
  <div class="container">
    <header class="header">
      <div class="title">Agent Output</div>
      <div class="header-controls">
        <div class="control-buttons" role="group" aria-label="Agent controls">
          <button
            id="agent-control-pause"
            class="control-button pause"
            type="button"
            aria-label="Pause agent"
            title="Pause agent"
          >
            <span class="codicon codicon-debug-pause" aria-hidden="true"></span>
          </button>
          <button
            id="agent-control-resume"
            class="control-button resume"
            type="button"
            aria-label="Resume agent"
            title="Resume agent"
          >
            <span class="codicon codicon-debug-start" aria-hidden="true"></span>
          </button>
          <button
            id="agent-control-stop"
            class="control-button stop"
            type="button"
            aria-label="Stop agent"
            title="Stop agent"
          >
            <span class="codicon codicon-debug-stop" aria-hidden="true"></span>
          </button>
          <span class="control-divider"></span>
          <button
            id="agent-control-copy-all"
            class="control-button copy"
            type="button"
            aria-label="Copy all output"
            title="Copy all output"
          >
            <span class="codicon codicon-copy" aria-hidden="true"></span>
          </button>
        </div>
        <div id="panel-status" class="status">${escapeHtml(status)}</div>
      </div>
    </header>
    <main id="content" class="content">
      <div id="output-list" class="output-list">
        <div id="virtual-spacer-top"></div>
        <div id="virtual-items">
          ${outputItems}
        </div>
        <div id="virtual-spacer-bottom"></div>
      </div>
      ${emptyState}
      <div class="loading-indicator">
        <div class="ball-beat">
          <div class="ball"></div>
          <div class="ball"></div>
          <div class="ball"></div>
        </div>
      </div>
    </main>
    <div class="redirect-bar">
      <input
        id="agent-redirect-input"
        class="redirect-input"
        type="text"
        placeholder="Send a redirect instruction"
        aria-label="Redirect instruction"
      />
      <button
        id="agent-redirect-send"
        class="redirect-send"
        type="button"
        aria-label="Send redirect instruction"
        title="Send"
      >
        Send
      </button>
    </div>
  </div>
  <script nonce="${scriptNonce}">${getScript(initialItemsJson)}</script>
</body>
</html>`;
}
