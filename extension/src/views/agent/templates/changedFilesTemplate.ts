/**
 * HTML template for ChangedFilesPanel webview
 */

import { getChangedFilesStyles } from "./changedFilesStyles.js";

export interface ChangedFileItem {
  id: string;
  relativePath: string;
  operation: "create" | "modify" | "delete";
  timestamp: string;
  undone: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function operationLabel(operation: ChangedFileItem["operation"]): string {
  switch (operation) {
    case "create":
      return "Create";
    case "modify":
      return "Modify";
    case "delete":
      return "Delete";
    default:
      return operation;
  }
}

function renderItem(item: ChangedFileItem): string {
  const statusPill = item.undone
    ? `<span class="status-pill">Undone</span>`
    : "";
  const undoDisabled = item.undone ? "disabled" : "";

  return `
    <div class="file-row ${item.undone ? "undone" : ""}" data-id="${escapeHtml(item.id)}">
      <div class="file-info">
        <div class="file-meta">
          <span class="operation-badge operation-${escapeHtml(item.operation)}">${escapeHtml(
            operationLabel(item.operation),
          )}</span>
          ${statusPill}
        </div>
        <div class="file-path">${escapeHtml(item.relativePath)}</div>
        <div class="file-meta">${escapeHtml(item.timestamp)}</div>
      </div>
      <div class="file-actions">
        <button
          class="action-button diff"
          type="button"
          data-action="diff"
          data-id="${escapeHtml(item.id)}"
        >
          Diff
        </button>
        <button
          class="action-button undo"
          type="button"
          data-action="undo"
          data-id="${escapeHtml(item.id)}"
          ${undoDisabled}
        >
          Undo
        </button>
      </div>
    </div>
  `;
}

function getScript(initialItemsJson: string): string {
  return `
    const vscode = acquireVsCodeApi();
    const state = {
      items: Array.isArray(${initialItemsJson}) ? ${initialItemsJson} : [],
    };

    function escapeHtml(text) {
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function operationLabel(operation) {
      if (operation === "create") {
        return "Create";
      }
      if (operation === "modify") {
        return "Modify";
      }
      if (operation === "delete") {
        return "Delete";
      }
      return operation || "";
    }

    function renderRow(item) {
      const statusPill = item.undone
        ? "<span class=\\"status-pill\\">Undone</span>"
        : "";
      const undoDisabled = item.undone ? "disabled" : "";
      const rowClass = item.undone ? "file-row undone" : "file-row";
      return (
        "<div class=\\"" + rowClass + "\\" data-id=\\"" +
        escapeHtml(item.id) +
        "\\">" +
        "<div class=\\"file-info\\">" +
        "<div class=\\"file-meta\\">" +
        "<span class=\\"operation-badge operation-" +
        escapeHtml(item.operation) +
        "\\">" +
        escapeHtml(operationLabel(item.operation)) +
        "</span>" +
        statusPill +
        "</div>" +
        "<div class=\\"file-path\\">" +
        escapeHtml(item.relativePath) +
        "</div>" +
        "<div class=\\"file-meta\\">" +
        escapeHtml(item.timestamp) +
        "</div>" +
        "</div>" +
        "<div class=\\"file-actions\\">" +
        "<button class=\\"action-button diff\\" type=\\"button\\" data-action=\\"diff\\" data-id=\\"" +
        escapeHtml(item.id) +
        "\\">Diff</button>" +
        "<button class=\\"action-button undo\\" type=\\"button\\" data-action=\\"undo\\" data-id=\\"" +
        escapeHtml(item.id) +
        "\\" " +
        undoDisabled +
        ">Undo</button>" +
        "</div>" +
        "</div>"
      );
    }

    function renderItems() {
      const list = document.getElementById("file-list");
      if (!list) {
        return;
      }

      if (!state.items.length) {
        list.innerHTML = "<div class=\\"empty-state\\">No file changes yet.</div>";
        return;
      }

      list.innerHTML = state.items.map(renderRow).join("");
    }

    function handleAction(event) {
      const target = event.target;
      if (!target) {
        return;
      }

      const action = target.dataset ? target.dataset.action : undefined;
      const id = target.dataset ? target.dataset.id : undefined;
      if (!action) {
        return;
      }

      if (action === "undoAll") {
        vscode.postMessage({ type: "undoAll" });
        return;
      }

      if (!id) {
        return;
      }

      if (action === "diff") {
        vscode.postMessage({ type: "diff", changeId: id });
      }

      if (action === "undo") {
        vscode.postMessage({ type: "undo", changeId: id });
      }
    }

    function bindEvents() {
      const list = document.getElementById("file-list");
      if (list) {
        list.addEventListener("click", (event) => handleAction(event));
      }

      const undoAllButton = document.getElementById("undo-all");
      if (undoAllButton) {
        undoAllButton.addEventListener("click", (event) => handleAction(event));
      }
    }

    function applyMessage(message) {
      if (!message || !message.type) {
        return;
      }

      if (message.type === "setItems") {
        state.items = Array.isArray(message.items) ? message.items : [];
        renderItems();
      }
    }

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message || !message.type) {
        return;
      }

      if (message.type === "batch") {
        for (const entry of message.messages || []) {
          applyMessage(entry);
        }
        return;
      }

      applyMessage(message);
    });

    bindEvents();
    renderItems();
    vscode.postMessage({ type: "ready" });
  `;
}

export function generateChangedFilesHtml(
  items: ChangedFileItem[],
  cspSource: string,
  nonce = "",
): string {
  const style = getChangedFilesStyles();
  const scriptNonce = nonce || "1";
  const initialItemsJson = serializeForScript(items);
  const renderedItems = items.map(renderItem).join("\n");
  const emptyState = items.length
    ? ""
    : `<div class="empty-state">No file changes yet.</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'nonce-${scriptNonce}';" />
  <title>Changed Files</title>
  <style>${style}</style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="title">Changed Files</div>
      <div class="header-actions">
        <button id="undo-all" class="action-primary" type="button" data-action="undoAll">
          Undo All
        </button>
      </div>
    </header>
    <main class="content">
      <div id="file-list">
        ${renderedItems}
        ${emptyState}
      </div>
    </main>
  </div>
  <script nonce="${scriptNonce}">${getScript(initialItemsJson)}</script>
</body>
</html>`;
}
