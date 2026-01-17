/**
 * HTML/CSS template for the Current Task webview panel
 *
 * Provides template generation functions for rendering the current in-progress task
 * in the VS Code sidebar. Uses VS Code CSS variables for theme integration and
 * includes interactive elements for task management.
 */

import type { StatusDisplay } from "../statusTranslation.js";

/**
 * Alignment issue from spec review (Sprint 004)
 */
export interface AlignmentIssue {
  severity: "critical" | "warning" | "info";
  requirement: string;
  finding: string;
  recommendation: string;
}

/**
 * Review data for display (Sprint 004 - Controller Agent)
 */
export interface ReviewData {
  decision: string; // 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED'
  conformance: string; // 'PASS' | 'WARN' | 'FAIL'
  reviewedBy: string;
  reviewedAt: string;
  revisionCount: number;
  issues: AlignmentIssue[];
  recommendations: string[];
  notes: string | null;
}

/**
 * Amendment record (Sprint 004 - Controller Agent)
 */
export interface AmendmentData {
  id: number;
  tool_name: string;
  amendment_type: string;
  workflow_step_at_amendment: string;
  rationale: string;
  changed_fields: string; // JSON array
  amended_by: string;
  amended_at: string;
}

/**
 * Task data for rendering in the webview
 */
export interface TaskData {
  id: number;
  task_id: number; // Sprint-relative task number for display
  title: string;
  description: string;
  status: string;
  priority: string;
  priorityLabel: string; // Human-readable priority (e.g., "High Priority")
  category: string;
  updated_at: string;
  statusDisplay: StatusDisplay;
  isNextPending?: boolean; // True if this is the next pending task (not in progress)
  escalation?: {
    reason: string;
    attempts_summary: string;
    recommended_action: string | null;
    escalated_at: string;
  } | null;
  tdd?: {
    isRedPhase: boolean;
    registeredFiles: number; // Number of test files with markers
    totalTestCount: number; // Total tests across all files
    redTaskId?: number;
    redTaskTitle?: string;
  } | null;
  // Sprint 004: Review data for pending/failed review states
  review?: ReviewData | null;
  // Sprint 004: Amendments made to task specification
  amendments?: AmendmentData[];
}

/**
 * Escape HTML to prevent XSS attacks
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generate CSS styles for the webview
 * Uses VS Code CSS variables for theme integration
 */
function getStyles(): string {
  return `
    body {
      padding: 0;
      margin: 0;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
    }
    .container {
      padding: 12px;
    }
    .task-card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 14px;
      background: var(--vscode-editor-background);
    }
    .task-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-bottom: 10px;
    }
    .task-id {
      font-weight: 600;
      font-size: 13px;
      color: var(--vscode-textLink-foreground);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .pill-status {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .pill-status.pending { background: var(--vscode-charts-blue); color: #fff; }
    .pill-status.implement { background: var(--vscode-charts-purple); color: #fff; }
    .pill-status.verify { background: var(--vscode-charts-yellow); color: #000; }
    .pill-status.complete { background: var(--vscode-charts-green); color: #fff; }
    .pill-status.escalated { background: var(--vscode-charts-red); color: #fff; }
    .pill-status.verify_failed { background: var(--vscode-charts-orange); color: #000; }
    .pill-priority {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .pill-priority.p0 { background: var(--vscode-charts-red); color: #fff; }
    .pill-priority.p1 { background: var(--vscode-charts-orange); color: #000; }
    .pill-priority.p2 { background: var(--vscode-charts-blue); color: #fff; }
    .pill-priority.p3 { background: var(--vscode-descriptionForeground); color: var(--vscode-editor-background); }
    .pill-category {
      background: var(--vscode-textBlockQuote-background);
      color: var(--vscode-textBlockQuote-border);
      border: 1px solid var(--vscode-textBlockQuote-border);
    }
    .task-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
      line-height: 1.3;
    }
    .task-description {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 14px;
      line-height: 1.5;
    }
    .escalation-banner {
      background: var(--vscode-inputValidation-errorBackground);
      border: 2px solid var(--vscode-charts-red);
      border-radius: 4px;
      padding: 10px 12px;
      margin-bottom: 14px;
    }
    .escalation-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      font-weight: 600;
      font-size: 12px;
      color: var(--vscode-errorForeground);
      margin-bottom: 6px;
    }
    .escalation-header-title {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .escalation-actions {
      display: flex;
      justify-content: flex-start;
      gap: 2px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--vscode-charts-red);
    }
    .escalation-actions .btn-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      padding: 0;
      background: transparent;
      border: none;
      border-radius: 3px;
      color: var(--vscode-errorForeground);
      cursor: pointer;
      font-size: 14px;
      opacity: 0.9;
    }
    .escalation-actions .btn-icon:hover {
      background: var(--vscode-toolbar-hoverBackground);
      opacity: 1;
    }
    .escalation-reason {
      font-size: 12px;
      line-height: 1.4;
      margin-bottom: 8px;
    }
    .escalation-details {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .escalation-details summary {
      cursor: pointer;
      font-weight: 500;
    }
    .escalation-details pre {
      margin: 6px 0 0 0;
      padding: 8px;
      background: var(--vscode-textBlockQuote-background);
      border-radius: 3px;
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
    }
    .no-task {
      padding: 20px 12px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .action-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 14px;
    }
    .btn {
      padding: 5px 12px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
    }
    .btn-secondary {
      background: transparent;
      color: var(--vscode-textLink-foreground);
      border: 1px solid var(--vscode-textLink-foreground);
    }
    .btn-secondary:hover {
      background: var(--vscode-textLink-foreground);
      color: var(--vscode-editor-background);
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 6px 16px;
      font-size: 12px;
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-primary.escalated {
      background: var(--vscode-charts-red);
    }
    .tdd-banner {
      background: var(--vscode-inputValidation-infoBackground);
      border: 1px solid var(--vscode-charts-purple);
      border-radius: 4px;
      padding: 8px 12px;
      margin-bottom: 12px;
      font-size: 11px;
    }
    .tdd-banner.red-phase {
      border-color: var(--vscode-charts-red);
    }
    .tdd-banner.green-phase {
      border-color: var(--vscode-charts-green);
    }
    .tdd-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 12px;
      margin-bottom: 6px;
    }
    .tdd-header .pill {
      font-size: 9px;
    }
    .pill-tdd-red {
      background: var(--vscode-charts-red);
      color: #fff;
    }
    .pill-tdd-green {
      background: var(--vscode-charts-green);
      color: #fff;
    }
    .tdd-stats {
      display: flex;
      gap: 12px;
      margin-top: 6px;
    }
    .tdd-stat {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .tdd-stat-value {
      font-weight: 600;
    }
    .tdd-link {
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      text-decoration: underline;
    }
    .tdd-link:hover {
      color: var(--vscode-textLink-activeForeground);
    }
    .review-banner {
      background: var(--vscode-inputValidation-warningBackground);
      border: 2px solid var(--vscode-charts-yellow);
      border-radius: 4px;
      padding: 10px 12px;
      margin-bottom: 14px;
      font-size: 11px;
    }
    .review-banner.pending {
      border-color: var(--vscode-charts-blue);
      background: var(--vscode-inputValidation-infoBackground);
    }
    .review-banner.failed {
      border-color: var(--vscode-charts-orange);
      background: var(--vscode-inputValidation-warningBackground);
    }
    .review-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      font-weight: 600;
      font-size: 12px;
      margin-bottom: 8px;
    }
    .review-header-title {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .review-status {
      font-size: 11px;
      margin-bottom: 8px;
      line-height: 1.4;
    }
    .review-issues {
      margin-top: 8px;
    }
    .review-issue {
      margin-bottom: 6px;
      padding-left: 12px;
      border-left: 2px solid var(--vscode-textBlockQuote-border);
    }
    .review-issue.critical {
      border-left-color: var(--vscode-charts-red);
    }
    .review-issue.warning {
      border-left-color: var(--vscode-charts-orange);
    }
    .review-issue.info {
      border-left-color: var(--vscode-charts-blue);
    }
    .review-issue-severity {
      font-weight: 600;
      font-size: 10px;
      text-transform: uppercase;
    }
    .review-issue-requirement {
      font-weight: 500;
      margin-bottom: 2px;
    }
    .review-issue-finding {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 2px;
    }
    .review-recommendations {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .review-recommendations-title {
      font-weight: 600;
      margin-bottom: 4px;
    }
    .review-recommendation {
      margin-left: 12px;
      margin-bottom: 4px;
    }
    .review-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .btn-controller {
      background: var(--vscode-charts-purple);
      color: #fff;
      padding: 5px 12px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
    }
    .btn-controller:hover {
      opacity: 0.9;
    }
    
    /* Amendments section (Sprint 004) */
    .amendments-section {
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-charts-yellow);
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 12px;
    }
    .amendments-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }
    .amendment-item {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 3px;
      padding: 8px;
      margin-bottom: 6px;
    }
    .amendment-item:last-child {
      margin-bottom: 0;
    }
    .amendment-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .amendment-type {
      font-weight: 600;
      font-size: 11px;
      color: var(--vscode-textLink-foreground);
    }
    .amendment-date {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }
    .amendment-rationale {
      font-size: 12px;
      margin-bottom: 4px;
      line-height: 1.4;
    }
    .amendment-meta {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }
  `;
}

/**
 * Generate JavaScript for the webview
 */
function getScript(): string {
  return `
    const vscode = acquireVsCodeApi();
    
    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.command) {
        case 'update':
          updateContent(message.data);
          break;
      }
    });
    
    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    function renderTaskCard(task) {
      const statusClass = task.status.toLowerCase().replace('_', '-');
      const priorityClass = task.priority.toLowerCase();
      
      // Determine action button label and handler based on task status
      // Mirrors the PlayTaskHandler logic exactly
      let actionLabel = '';
      let actionDisabled = false;
      
      switch (task.status) {
        case 'PENDING':
          actionLabel = 'Prepare Task';
          break;
        case 'PREPARE':
          actionLabel = 'Continue Preparation';
          break;
        case 'IMPLEMENT':
          actionLabel = 'Start Implementation';
          break;
        case 'VERIFY_FAILED':
          actionLabel = 'Retry Task';
          break;
        case 'VERIFY':
        case 'GATE_CHECK':
          actionLabel = 'Verify Task';
          break;
        case 'ESCALATED':
          actionLabel = 'Review Escalation';
          break;
        case 'COMPLETE':
          actionLabel = 'Completed';
          actionDisabled = true;
          break;
        default:
          actionLabel = 'Continue Task';
      }
      
      const btnClass = 'btn btn-primary' + (task.status === 'ESCALATED' ? ' escalated' : '');
      const disabledAttr = actionDisabled ? ' disabled' : '';
      const actionButton = \`<button class="\${btnClass}"\${disabledAttr} onclick="playTask(\${task.id})">\${actionLabel}</button>\`;

      // Render escalation banner if escalated
      let escalationBanner = '';
      if (task.escalation) {
        escalationBanner = \`
          <div class="escalation-banner">
            <div class="escalation-header">
              <span class="escalation-header-title">
                <span class="codicon codicon-warning"></span>
                Task Escalated - Requires Supervisor Action
              </span>
            </div>
            <div class="escalation-reason">\${escapeHtml(task.escalation.reason)}</div>
            <details class="escalation-details">
              <summary>View Details</summary>
              <pre>\${escapeHtml(task.escalation.attempts_summary)}</pre>
              \${task.escalation.recommended_action ? \`<p><strong>Recommended:</strong> \${escapeHtml(task.escalation.recommended_action)}</p>\` : ''}
            </details>
            <div class="escalation-actions">
              <button class="btn-icon" onclick="resolveEscalation(\${task.id})" title="De-escalate: Return task to previous state with supervisor notes">↩</button>
              <button class="btn-icon" onclick="moveToGateCheck(\${task.id})" title="Re-verify: Run verification checks again">⟳</button>
              <button class="btn-icon" onclick="moveToImplement(\${task.id})" title="Re-do: Send task back to implementation phase">↺</button>
              <button class="btn-icon" onclick="forceComplete(\${task.id})" title="Force Complete: Override and mark task as complete">✓</button>
            </div>
          </div>
        \`;
      }

      // Render TDD banner if this is a TDD task
      let tddBanner = '';
      if (task.tdd) {
        if (task.tdd.isRedPhase) {
          tddBanner = \`
            <div class="tdd-banner red-phase">
              <div class="tdd-header">
                <span class="pill pill-tdd-red">TDD RED</span>
                Write Failing Tests
              </div>
              <div class="tdd-stats">
                <div class="tdd-stat">
                  <span>Files:</span>
                  <span class="tdd-stat-value">\${task.tdd.registeredFiles}</span>
                </div>
                <div class="tdd-stat">
                  <span>Total Tests:</span>
                  <span class="tdd-stat-value">\${task.tdd.totalTestCount}</span>
                </div>
              </div>
            </div>
          \`;
        } else {
          // Green phase task
          const redLink = task.tdd.redTaskId 
            ? \`<span class="tdd-link" onclick="openTask(\${task.tdd.redTaskId})">Task \${task.tdd.redTaskId}: \${escapeHtml(task.tdd.redTaskTitle || 'Red Task')}</span>\`
            : '';
          tddBanner = \`
            <div class="tdd-banner green-phase">
              <div class="tdd-header">
                <span class="pill pill-tdd-green">TDD GREEN</span>
                Make Tests Pass
              </div>
              <div class="tdd-stats">
                <div class="tdd-stat">
                  <span>Tests to green:</span>
                  <span class="tdd-stat-value">\${task.tdd.totalTestCount}</span>
                </div>
                <div class="tdd-stat">
                  <span>Files with markers:</span>
                  <span class="tdd-stat-value">\${task.tdd.registeredFiles}</span>
                </div>
              </div>
              \${redLink ? \`<div style="margin-top: 6px;">From: \${redLink}</div>\` : ''}
            </div>
          \`;
        }
      }
      
      // Render review banner if task is in review or review failed state (Sprint 004)
      let reviewBanner = '';
      if (task.review) {
        const isPending = task.status === 'PENDING_HANDOVER_REVIEW' || task.status === 'PENDING_SPEC_REVIEW';
        const isFailed = task.status === 'HANDOVER_REVIEW_FAILED' || task.status === 'SPEC_REVIEW_FAILED';
        const bannerClass = isPending ? 'pending' : isFailed ? 'failed' : '';
        const iconClass = isPending ? 'clock' : 'warning';
        const statusText = isPending ? 'Task awaiting Controller review' : 'Controller requested revisions';
        
        let issuesHtml = '';
        if (task.review.issues && task.review.issues.length > 0) {
          const issueItems = task.review.issues.map(issue => \`
            <div class="review-issue \${issue.severity}">
              <div class="review-issue-severity">\${issue.severity}</div>
              <div class="review-issue-requirement">\${escapeHtml(issue.requirement)}</div>
              <div class="review-issue-finding">\${escapeHtml(issue.finding)}</div>
            </div>
          \`).join('');
          issuesHtml = \`
            <div class="review-issues">
              <div class="review-recommendations-title">Issues Found:</div>
              \${issueItems}
            </div>
          \`;
        }
        
        let recommendationsHtml = '';
        if (task.review.recommendations && task.review.recommendations.length > 0) {
          const recItems = task.review.recommendations.map(rec => \`<div class="review-recommendation">• \${escapeHtml(rec)}</div>\`).join('');
          recommendationsHtml = \`
            <div class="review-recommendations">
              <div class="review-recommendations-title">Recommendations:</div>
              \${recItems}
            </div>
          \`;
        }
        
        reviewBanner = \`
          <div class="review-banner \${bannerClass}">
            <div class="review-header">
              <span class="review-header-title">
                <span class="codicon codicon-\${iconClass}"></span>
                \${statusText}
              </span>
            </div>
            <div class="review-status">
              Reviewed by \${escapeHtml(task.review.reviewedBy)} • \${escapeHtml(new Date(task.review.reviewedAt).toLocaleString())}
              \${task.review.revisionCount > 0 ? \` • Revision \${task.review.revisionCount}\` : ''}
            </div>
            \${issuesHtml}
            \${recommendationsHtml}
            \${task.review.notes ? \`<div style="margin-top: 8px; font-style: italic;">\${escapeHtml(task.review.notes)}</div>\` : ''}
            \${isPending ? \`
              <div class="review-actions">
                <button class="btn-controller" onclick="launchController()">Launch Controller Agent</button>
              </div>
            \` : ''}
          </div>
        \`;
      }
      
      // Render amendments section if any exist (Sprint 004)
      let amendmentsSection = '';
      if (task.amendments && task.amendments.length > 0) {
        const amendmentItems = task.amendments.map(amendment => {
          const changedFields = JSON.parse(amendment.changed_fields || '[]');
          const fieldsText = changedFields.join(', ');
          return \`
            <div class="amendment-item">
              <div class="amendment-header">
                <span class="amendment-type">\${escapeHtml(amendment.amendment_type)}</span>
                <span class="amendment-date">\${escapeHtml(new Date(amendment.amended_at).toLocaleString())}</span>
              </div>
              <div class="amendment-rationale">\${escapeHtml(amendment.rationale)}</div>
              <div class="amendment-meta">
                Changed: \${escapeHtml(fieldsText)} • By: \${escapeHtml(amendment.amended_by)}
              </div>
            </div>
          \`;
        }).join('');
        
        amendmentsSection = \`
          <div class="amendments-section">
            <div class="amendments-header">
              <span class="codicon codicon-edit"></span>
              Specification Amendments (\${task.amendments.length})
            </div>
            \${amendmentItems}
          </div>
        \`;
      }
      
      return \`
        <div class="task-card">
          <div class="task-header">
            <span class="task-id">Task \${task.task_id}</span>
            <span class="pill pill-status \${statusClass}">
              <span class="codicon codicon-\${task.statusDisplay.icon}"></span>
              \${task.statusDisplay.label}
            </span>
            <span class="pill pill-priority \${priorityClass}" title="\${task.priorityLabel}">\${task.priority}</span>
            <span class="pill pill-category">\${task.category}</span>
          </div>
          <div class="task-title">\${escapeHtml(task.title)}</div>
          \${tddBanner}
          \${reviewBanner}
          \${amendmentsSection}
          \${escalationBanner}
          <div class="task-description">\${escapeHtml(task.description)}</div>
          <div class="action-buttons">
            <button class="btn btn-secondary" onclick="openTask(\${task.id})">View Details</button>
            \${actionButton}
          </div>
        </div>
      \`;
    }
    
    function renderNoTask() {
      return \`
        <div class="no-task">
          <p>No task currently in progress</p>
          <button class="btn btn-secondary" onclick="refresh()">Refresh</button>
        </div>
      \`;
    }
    
    function renderSprintReviewCard(data) {
      const isPending = data.isPending;
      const isFailed = data.isFailed;
      const sprint = data.sprint;
      const review = data.review;

      const status = isPending ? "pending-review" : "review-failed";
      const statusLabel = isPending ? "Pending Review" : "Review Failed";
      const statusIcon = isPending ? "⏳" : "⚠️";

      let reviewBanner = "";
      if (isFailed && review) {
        let issuesHtml = "";
        if (review.issues && review.issues.length > 0) {
          const issueItems = review.issues
            .map(issue => \`
              <div class="review-issue \${issue.severity}">
                <div class="review-issue-severity">\${issue.severity}</div>
                <div class="review-issue-requirement">\${escapeHtml(issue.requirement)}</div>
                <div class="review-issue-finding">\${escapeHtml(issue.finding)}</div>
              </div>
            \`)
            .join("");
          issuesHtml = \`
            <div class="review-issues">
              <div class="review-recommendations-title">Issues Found:</div>
              \${issueItems}
            </div>
          \`;
        }

        let recommendationsHtml = "";
        if (review.recommendations && review.recommendations.length > 0) {
          const recItems = review.recommendations
            .map(rec => \`<div class="review-recommendation">• \${escapeHtml(rec)}</div>\`)
            .join("");
          recommendationsHtml = \`
            <div class="review-recommendations">
              <div class="review-recommendations-title">Recommendations:</div>
              \${recItems}
            </div>
          \`;
        }

        reviewBanner = \`
          <div class="review-banner review-rejected">
            <div class="review-header">
              <span class="review-icon">⚠️</span>
              <span class="review-title">Sprint Review Failed</span>
            </div>
            <div class="review-metadata">
              <div class="review-conformance">Conformance: \${escapeHtml(review.conformance)}</div>
              <div class="review-by">Reviewed by: \${escapeHtml(review.reviewed_by)}</div>
              <div class="review-at">At: \${new Date(review.reviewed_at).toLocaleString()}</div>
              <div class="review-revision">Revision: \${review.revision_count}</div>
            </div>
            \${issuesHtml}
            \${recommendationsHtml}
          </div>
        \`;
      }

      return \`
        <div class="task-card">
          <div class="task-header">
            <span class="task-id">Sprint: \${escapeHtml(sprint.name)}</span>
            <span class="pill pill-status \${status}">
              <span class="pill-icon">\${statusIcon}</span>
              \${statusLabel}
            </span>
          </div>

          \${reviewBanner}

          <div class="section">
            <div class="section-title">Sprint Review Required</div>
            <div class="description">
              This sprint configuration needs to be reviewed by the Controller agent before tasks can be implemented.
              \${isFailed ? "<br><br>The previous review found issues that need to be addressed. Review the feedback above and resubmit the sprint configuration." : ""}
            </div>
          </div>

          <div class="action-row">
            <button class="action-btn primary" onclick="launchController()">
              <span class="btn-icon">▶️</span>
              Launch Controller Agent
            </button>
          </div>
        </div>
      \`;
    }
    
    function updateContent(data) {
      const content = document.getElementById('content');
      if (!data) {
        content.innerHTML = renderNoTask();
      } else if (data.type === 'sprint-review') {
        content.innerHTML = renderSprintReviewCard(data);
      } else {
        content.innerHTML = renderTaskCard(data);
      }
    }
    
    function openTask(taskId) {
      vscode.postMessage({
        command: 'openTask',
        taskId: taskId
      });
    }
    
    function signalCompletion(taskId) {
      vscode.postMessage({
        command: 'signalCompletion',
        taskId: taskId
      });
    }
    
    function playTask(taskId) {
      vscode.postMessage({
        command: 'playTask',
        taskId: taskId
      });
    }
    
    function prepareTask(taskId) {
      vscode.postMessage({
        command: 'prepareTask',
        taskId: taskId
      });
    }
    
    function resolveEscalation(taskId) {
      vscode.postMessage({
        command: 'resolveEscalation',
        taskId: taskId
      });
    }
    
    function moveToGateCheck(taskId) {
      vscode.postMessage({
        command: 'moveToGateCheck',
        taskId: taskId
      });
    }
    
    function launchController() {
      vscode.postMessage({
        command: 'launchController'
      });
    }
    
    function moveToImplement(taskId) {
      vscode.postMessage({
        command: 'moveToImplement',
        taskId: taskId
      });
    }
    
    function forceComplete(taskId) {
      vscode.postMessage({
        command: 'forceComplete',
        taskId: taskId
      });
    }
    
    function launchController() {
      vscode.postMessage({
        command: 'launchController'
      });
    }
    
    function refresh() {
      vscode.postMessage({
        command: 'refresh'
      });
    }
  `;
}

/**
 * Render a task card with all task information
 */
function renderTaskCard(task: TaskData): string {
  const statusClass = task.status.toLowerCase().replace("_", "-");
  const priorityClass = task.priority.toLowerCase();

  // Determine action button label and handler based on task status
  // Mirrors the PlayTaskHandler logic exactly
  let actionLabel = "";
  let actionDisabled = false;

  switch (task.status) {
    case "PENDING":
      actionLabel = "Prepare Task";
      break;
    case "PREPARE":
      actionLabel = "Continue Preparation";
      break;
    case "IMPLEMENT":
      actionLabel = "Start Implementation";
      break;
    case "VERIFY_FAILED":
      actionLabel = "Retry Task";
      break;
    case "VERIFY":
    case "GATE_CHECK":
      actionLabel = "Verify Task";
      break;
    case "ESCALATED":
      actionLabel = "Review Escalation";
      break;
    case "COMPLETE":
      actionLabel = "Completed";
      actionDisabled = true;
      break;
    default:
      actionLabel = "Continue Task";
  }

  const btnClass =
    "btn btn-primary" + (task.status === "ESCALATED" ? " escalated" : "");
  const disabledAttr = actionDisabled ? " disabled" : "";
  const actionButton = `<button class="${btnClass}"${disabledAttr} onclick="playTask(${task.id})">${actionLabel}</button>`;

  // Render escalation banner if escalated
  const escalationBanner = task.escalation
    ? `
    <div class="escalation-banner">
      <div class="escalation-header">
        <span class="escalation-header-title">
          <span class="codicon codicon-warning"></span>
          Task Escalated - Requires Supervisor Action
        </span>
      </div>
      <div class="escalation-reason">${escapeHtml(task.escalation.reason)}</div>
      <details class="escalation-details">
        <summary>View Details</summary>
        <pre>${escapeHtml(task.escalation.attempts_summary)}</pre>
        ${
          task.escalation.recommended_action
            ? `<p><strong>Recommended:</strong> ${escapeHtml(
                task.escalation.recommended_action,
              )}</p>`
            : ""
        }
      </details>
      <div class="escalation-actions">
        <button class="btn-icon" onclick="resolveEscalation(${
          task.id
        })" title="De-escalate: Return task to previous state with supervisor notes">↩</button>
        <button class="btn-icon" onclick="moveToGateCheck(${
          task.id
        })" title="Re-verify: Run verification checks again">⟳</button>
        <button class="btn-icon" onclick="moveToImplement(${
          task.id
        })" title="Re-do: Send task back to implementation phase">↺</button>
        <button class="btn-icon" onclick="forceComplete(${
          task.id
        })" title="Force Complete: Override and mark task as complete">✓</button>
      </div>
    </div>
  `
    : "";

  // Render TDD banner if this is a TDD task
  let tddBanner = "";
  if (task.tdd) {
    if (task.tdd.isRedPhase) {
      tddBanner = `
        <div class="tdd-banner red-phase">
          <div class="tdd-header">
            <span class="pill pill-tdd-red">TDD RED</span>
            Write Failing Tests
          </div>
          <div class="tdd-stats">
            <div class="tdd-stat">
              <span>Files:</span>
              <span class="tdd-stat-value">${task.tdd.registeredFiles}</span>
            </div>
            <div class="tdd-stat">
              <span>Total Tests:</span>
              <span class="tdd-stat-value">${task.tdd.totalTestCount}</span>
            </div>
          </div>
        </div>
      `;
    } else {
      // Green phase task
      const redLink = task.tdd.redTaskId
        ? `<span class="tdd-link" onclick="openTask(${
            task.tdd.redTaskId
          })">Task ${task.tdd.redTaskId}: ${escapeHtml(
            task.tdd.redTaskTitle || "Red Task",
          )}</span>`
        : "";
      tddBanner = `
        <div class="tdd-banner green-phase">
          <div class="tdd-header">
            <span class="pill pill-tdd-green">TDD GREEN</span>
            Make Tests Pass
          </div>
          <div class="tdd-stats">
            <div class="tdd-stat">
              <span>Tests to green:</span>
              <span class="tdd-stat-value">${task.tdd.totalTestCount}</span>
            </div>
            <div class="tdd-stat">
              <span>Files with markers:</span>
              <span class="tdd-stat-value">${task.tdd.registeredFiles}</span>
            </div>
          </div>
          ${
            redLink
              ? `<div style="margin-top: 6px;">From: ${redLink}</div>`
              : ""
          }
        </div>
      `;
    }
  }

  // Render review banner if task is in review or review failed state (Sprint 004)
  let reviewBanner = "";
  if (task.review) {
    const isPending =
      task.status === "PENDING_HANDOVER_REVIEW" ||
      task.status === "PENDING_SPEC_REVIEW";
    const isFailed =
      task.status === "HANDOVER_REVIEW_FAILED" ||
      task.status === "SPEC_REVIEW_FAILED";
    const bannerClass = isPending ? "pending" : isFailed ? "failed" : "";
    const iconClass = isPending ? "clock" : "warning";

    const statusText = isPending
      ? "Task awaiting Controller review"
      : "Controller requested revisions";

    // Render issues if present
    let issuesHtml = "";
    if (task.review.issues && task.review.issues.length > 0) {
      const issueItems = task.review.issues
        .map(
          (issue) => `
        <div class="review-issue ${issue.severity}">
          <div class="review-issue-severity">${issue.severity}</div>
          <div class="review-issue-requirement">${escapeHtml(
            issue.requirement,
          )}</div>
          <div class="review-issue-finding">${escapeHtml(issue.finding)}</div>
        </div>
      `,
        )
        .join("");
      issuesHtml = `
        <div class="review-issues">
          <div class="review-recommendations-title">Issues Found:</div>
          ${issueItems}
        </div>
      `;
    }

    // Render recommendations if present
    let recommendationsHtml = "";
    if (task.review.recommendations && task.review.recommendations.length > 0) {
      const recItems = task.review.recommendations
        .map(
          (rec) =>
            `<div class="review-recommendation">• ${escapeHtml(rec)}</div>`,
        )
        .join("");
      recommendationsHtml = `
        <div class="review-recommendations">
          <div class="review-recommendations-title">Recommendations:</div>
          ${recItems}
        </div>
      `;
    }

    reviewBanner = `
      <div class="review-banner ${bannerClass}">
        <div class="review-header">
          <span class="review-header-title">
            <span class="codicon codicon-${iconClass}"></span>
            ${statusText}
          </span>
        </div>
        <div class="review-status">
          Reviewed by ${escapeHtml(task.review.reviewedBy)} • ${escapeHtml(
            new Date(task.review.reviewedAt).toLocaleString(),
          )}
          ${
            task.review.revisionCount > 0
              ? ` • Revision ${task.review.revisionCount}`
              : ""
          }
        </div>
        ${issuesHtml}
        ${recommendationsHtml}
        ${
          task.review.notes
            ? `<div style="margin-top: 8px; font-style: italic;">${escapeHtml(
                task.review.notes,
              )}</div>`
            : ""
        }
        ${
          isPending
            ? `
          <div class="review-actions">
            <button class="btn-controller" onclick="launchController()">Launch Controller Agent</button>
          </div>
        `
            : ""
        }
      </div>
    `;
  }

  // Render amendments section if any exist (Sprint 004)
  let amendmentsSection = "";
  if (task.amendments && task.amendments.length > 0) {
    const amendmentItems = task.amendments
      .map((amendment) => {
        const changedFields = JSON.parse(amendment.changed_fields || "[]");
        const fieldsText = changedFields.join(", ");
        return `
          <div class="amendment-item">
            <div class="amendment-header">
              <span class="amendment-type">${escapeHtml(
                amendment.amendment_type,
              )}</span>
              <span class="amendment-date">${escapeHtml(
                new Date(amendment.amended_at).toLocaleString(),
              )}</span>
            </div>
            <div class="amendment-rationale">${escapeHtml(
              amendment.rationale,
            )}</div>
            <div class="amendment-meta">
              Changed: ${escapeHtml(fieldsText)} • By: ${escapeHtml(
                amendment.amended_by,
              )}
            </div>
          </div>
        `;
      })
      .join("");

    amendmentsSection = `
      <div class="amendments-section">
        <div class="amendments-header">
          <span class="codicon codicon-edit"></span>
          Specification Amendments (${task.amendments.length})
        </div>
        ${amendmentItems}
      </div>
    `;
  }

  return `
    <div class="task-card">
      <div class="task-header">
        <span class="task-id">Task ${task.task_id}</span>
        <span class="pill pill-status ${statusClass}">
          <span class="codicon codicon-${task.statusDisplay.icon}"></span>
          ${task.statusDisplay.label}
        </span>
        <span class="pill pill-priority ${priorityClass}" title="${escapeHtml(
          task.priorityLabel,
        )}">${escapeHtml(task.priority)}</span>
        <span class="pill pill-category">${escapeHtml(task.category)}</span>
      </div>
      <div class="task-title">${escapeHtml(task.title)}</div>
      ${tddBanner}
      ${reviewBanner}
      ${amendmentsSection}
      ${escalationBanner}
      <div class="task-description">${escapeHtml(task.description)}</div>
      <div class="action-buttons">
        <button class="btn btn-secondary" onclick="openTask(${
          task.id
        })">View Details</button>
        ${actionButton}
      </div>
    </div>
  `;
}

/**
 * Render a no-task placeholder
 */
function renderNoTask(): string {
  return `
    <div class="no-task">
      <p>No task currently in progress</p>
      <button class="btn btn-secondary" onclick="refresh()">Refresh</button>
    </div>
  `;
}

/**
 * Render a sprint review card for when sprint needs review
 */
function renderSprintReviewCard(data: any): string {
  const isPending = data.isPending;
  const isFailed = data.isFailed;
  const sprint = data.sprint;
  const review = data.review;

  const status = isPending ? "pending-review" : "review-failed";
  const statusLabel = isPending ? "Pending Review" : "Review Failed";
  const statusIcon = isPending ? "clock" : "warning";

  let reviewBanner = "";
  if (isFailed && review) {
    // Show review failure details
    let issuesHtml = "";
    if (review.issues && review.issues.length > 0) {
      const issueItems = review.issues
        .map(
          (issue: any) => `
        <div class="review-issue ${issue.severity}">
          <div class="review-issue-severity">${issue.severity}</div>
          <div class="review-issue-requirement">${escapeHtml(
            issue.requirement,
          )}</div>
          <div class="review-issue-finding">${escapeHtml(issue.finding)}</div>
        </div>
      `,
        )
        .join("");
      issuesHtml = `
        <div class="review-issues">
          <div class="review-recommendations-title">Issues Found:</div>
          ${issueItems}
        </div>
      `;
    }

    let recommendationsHtml = "";
    if (review.recommendations && review.recommendations.length > 0) {
      const recItems = review.recommendations
        .map(
          (rec: string) =>
            `<div class="review-recommendation">• ${escapeHtml(rec)}</div>`,
        )
        .join("");
      recommendationsHtml = `
        <div class="review-recommendations">
          <div class="review-recommendations-title">Recommendations:</div>
          ${recItems}
        </div>
      `;
    }

    reviewBanner = `
      <div class="review-banner review-rejected">
        <div class="review-header">
          <span class="review-icon">⚠️</span>
          <span class="review-title">Sprint Review Failed</span>
        </div>
        <div class="review-metadata">
          <div class="review-conformance">Conformance: ${escapeHtml(
            review.conformance,
          )}</div>
          <div class="review-by">Reviewed by: ${escapeHtml(
            review.reviewed_by,
          )}</div>
          <div class="review-at">At: ${new Date(
            review.reviewed_at,
          ).toLocaleString()}</div>
          <div class="review-revision">Revision: ${review.revision_count}</div>
        </div>
        ${issuesHtml}
        ${recommendationsHtml}
      </div>
    `;
  }

  return `
    <div class="task-card">
      <div class="task-header">
        <span class="task-id">Sprint: ${escapeHtml(sprint.name)}</span>
        <span class="pill pill-status ${status}">
          <span class="pill-icon">${statusIcon}</span>
          ${statusLabel}
        </span>
      </div>

      ${reviewBanner}

      <div class="section">
        <div class="section-title">Sprint Review Required</div>
        <div class="description">
          This sprint configuration needs to be reviewed by the Controller agent before tasks can be implemented.
          ${
            isFailed
              ? "<br><br>The previous review found issues that need to be addressed. Review the feedback above and resubmit the sprint configuration."
              : ""
          }
        </div>
      </div>

      <div class="action-row">
        <button class="action-btn primary" onclick="launchController()">
          <span class="btn-icon">▶️</span>
          Launch Controller Agent
        </button>
      </div>
    </div>
  `;
}

/**
 * Generate complete HTML document for the webview
 * Handles both task display and sprint review display
 *
 * @param data - Task data, sprint review data, or null for empty state
 * @param cspSource - Content Security Policy source for the webview
 * @returns Complete HTML document as a string
 */
export function generateCurrentTaskHtml(
  data: TaskData | any | null,
  cspSource: string,
): string {
  let content: string;

  // Check if this is sprint review data
  if (data && data.type === "sprint-review") {
    content = renderSprintReviewCard(data);
  } else {
    // Regular task rendering
    content = data ? renderTaskCard(data as TaskData) : renderNoTask();
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline';">
  <title>Current Task</title>
  <style>${getStyles()}</style>
</head>
<body>
  <div class="container" id="content">
    ${content}
  </div>
  <script>${getScript()}</script>
</body>
</html>`;
}
