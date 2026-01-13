/**
 * SQLite Trigger System
 *
 * Provides granular change detection as an alternative/supplement to file watching.
 * SQLite triggers track specific table changes (task status, new signals, feedback)
 * and insert into a notifications table. The extension can poll this table to know
 * exactly what changed, enabling more efficient UI updates.
 *
 * NOTE: Extension opens database in read-only mode, so triggers must be created
 * by the MCP server. This module provides the polling/reading side.
 */

import type Database from "better-sqlite3";

/**
 * Notification event types for granular change tracking
 */
export enum NotificationEventType {
  TASK_STATUS_CHANGED = "TASK_STATUS_CHANGED",
  SIGNAL_CREATED = "SIGNAL_CREATED",
  FEEDBACK_CREATED = "FEEDBACK_CREATED",
}

/**
 * Notification data structure
 */
export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  action_required: number; // 0 = false, 1 = true
  sprint_id: string | null;
  task_id: number | null;
  read: number; // 0 = false, 1 = true
  acknowledged: number; // 0 = false, 1 = true
  created_at: string;
  read_at: string | null;
  acknowledged_at: string | null;
}

/**
 * Setup SQLite triggers for change detection
 *
 * Creates triggers on tasks, signals, and feedback tables that automatically
 * insert notifications when specific changes occur. These triggers enable
 * granular change detection without constantly polling all tables.
 *
 * IMPORTANT: This function requires write access to the database. It should
 * only be called by the MCP server, not by the extension (which is read-only).
 *
 * @param db better-sqlite3 Database instance with write access
 */
export function setupTriggers(db: Database.Database): void {
  // Create trigger for task status changes
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS task_status_change_notify
    AFTER UPDATE OF status ON tasks
    FOR EACH ROW
    WHEN OLD.status != NEW.status
    BEGIN
      INSERT INTO notifications (
        type,
        title,
        message,
        action_required,
        sprint_id,
        task_id,
        read,
        acknowledged,
        created_at
      )
      VALUES (
        'INFO',
        'Task Status Changed',
        'Task ' || NEW.task_id || ': ' || NEW.title || ' changed from ' || OLD.status || ' to ' || NEW.status,
        0,
        NEW.sprint_id,
        NEW.id,
        0,
        0,
        datetime('now')
      );
    END;
  `);

  // Create trigger for new signals
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS signal_created_notify
    AFTER INSERT ON signals
    FOR EACH ROW
    BEGIN
      INSERT INTO notifications (
        type,
        title,
        message,
        action_required,
        sprint_id,
        task_id,
        read,
        acknowledged,
        created_at
      )
      SELECT
        'INFO',
        'Signal Created',
        'Signal created for task ' || t.task_id || ': ' || t.title || ' (attempt ' || NEW.attempt || ')',
        0,
        t.sprint_id,
        NEW.task_id,
        0,
        0,
        datetime('now')
      FROM tasks t
      WHERE t.id = NEW.task_id;
    END;
  `);

  // Create trigger for new feedback
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS feedback_created_notify
    AFTER INSERT ON feedback
    FOR EACH ROW
    BEGIN
      INSERT INTO notifications (
        type,
        title,
        message,
        action_required,
        sprint_id,
        task_id,
        read,
        acknowledged,
        created_at
      )
      SELECT
        CASE WHEN NEW.can_retry = 1 THEN 'WARNING' ELSE 'ERROR' END,
        'Feedback Available',
        'Feedback available for task ' || t.task_id || ': ' || t.title || ' (attempt ' || NEW.attempt || ')',
        1,
        t.sprint_id,
        NEW.task_id,
        0,
        0,
        datetime('now')
      FROM tasks t
      WHERE t.id = NEW.task_id;
    END;
  `);
}

/**
 * Poll for new notifications and clear processed ones
 *
 * Queries the notifications table for unread notifications and marks them
 * as read by deleting them after retrieval. This implements a simple
 * read-once notification queue.
 *
 * @param db better-sqlite3 Database instance (read-only is sufficient for SELECT)
 * @returns Array of unread notifications
 */
export function pollNotifications(db: Database.Database): Notification[] {
  try {
    // Query unread notifications
    const notifications = db
      .prepare(
        `
      SELECT 
        id,
        type,
        title,
        message,
        action_required,
        sprint_id,
        task_id,
        read,
        acknowledged,
        created_at,
        read_at,
        acknowledged_at
      FROM notifications
      WHERE read = 0
      ORDER BY created_at ASC
    `
      )
      .all() as Notification[];

    // Note: We cannot DELETE in read-only mode
    // The extension will need to track which notifications it has processed
    // or the MCP server needs to provide a tool to mark notifications as read

    return notifications;
  } catch (error) {
    console.error("Error polling notifications:", error);
    return [];
  }
}
