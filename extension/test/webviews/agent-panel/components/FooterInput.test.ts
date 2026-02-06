/**
 * FooterInput Component Tests
 *
 * Tests for FooterInput component - text input with Send button for agent interaction.
 *
 * These tests verify component exports, props interfaces, disabled states,
 * keyboard handling, and component functionality without requiring a browser environment.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const componentsDir = join(
  __dirname,
  "../../../../src/webviews/agent-panel/components",
);

describe("FooterInput Component", () => {
  describe("Component Export", () => {
    it("should export FooterInput component function", async () => {
      const module =
        await import("../../../../src/webviews/agent-panel/components/FooterInput.js");
      expect(module).toHaveProperty("FooterInput");
      expect(typeof module.FooterInput).toBe("function");
    });

    it("should be exported from barrel export", async () => {
      const module =
        await import("../../../../src/webviews/agent-panel/components/index.js");
      expect(module).toHaveProperty("FooterInput");
    });

    it("should export FooterInputProps type", async () => {
      const module =
        await import("../../../../src/webviews/agent-panel/components/index.js");
      // TypeScript types are not available at runtime, but we can verify the export statement exists
      const source = readFileSync(join(componentsDir, "index.ts"), "utf-8");
      expect(source).toContain("export type { FooterInputProps }");
    });
  });

  describe("Component Structure", () => {
    it("should have textarea for text input", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("<textarea");
      expect(source).toContain("value={inputText()}");
      expect(source).toContain("onInput=");
      expect(source).toContain("onKeyDown=");
    });

    it("should have send button with icon", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("<button");
      expect(source).toContain("onClick={handleSend}");
      expect(source).toContain("Send");
      expect(source).toContain('icon="lucide:send"');
    });

    it("should use Icon component from @iconify-icon/solid", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain('import { Icon } from "@iconify-icon/solid"');
    });

    it("should use createSignal from solid-js", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain('import { createSignal } from "solid-js"');
      expect(source).toContain("createSignal");
    });
  });

  describe("Props Interface", () => {
    it("should accept session prop", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("export interface FooterInputProps");
      expect(source).toContain("session: AgentSession | null");
    });

    it("should accept onSendMessage callback", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("onSendMessage?: (text: string) => void");
    });

    it("should import AgentSession type", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain(
        'import type { AgentSession } from "../../../agents/sessions/types.js"',
      );
    });
  });

  describe("Disabled States", () => {
    it("should have isDisabled helper function", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("isDisabled");
      expect(source).toContain("if (!props.session) return true");
    });

    it("should disable when no session is active", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("if (!props.session) return true"); // No session active
    });

    it("should disable when session is running", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("running");
      expect(source).toContain("thinking");
      expect(source).toContain("waiting_for_tool");
    });

    it("should enable when session is paused or completed", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("isEnabled");
      expect(source).toContain("paused");
      expect(source).toContain("completed");
      expect(source).toContain("failed");
      expect(source).toContain("cancelled");
    });

    it("should have placeholder text that changes based on state", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("placeholderText");
      expect(source).toContain("No active session");
      expect(source).toContain("Inject a message to the agent...");
      expect(source).toContain("Continue the session with a message...");
    });
  });

  describe("Keyboard Handling", () => {
    it("should have handleKeyDown function", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("handleKeyDown");
      expect(source).toContain("onKeyDown={handleKeyDown}");
    });

    it("should send message on Enter key", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain('event.key === "Enter"');
      expect(source).toContain("!event.shiftKey");
      expect(source).toContain("event.preventDefault()");
      expect(source).toContain("handleSend");
    });

    it("should allow newline on Shift+Enter", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      // Shift+Enter allows default behavior (newline)
      expect(source).toContain("Shift+Enter");
    });
  });

  describe("Send Functionality", () => {
    it("should have handleSend function", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("handleSend");
    });

    it("should trim input text before sending", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("inputText().trim()");
    });

    it("should not send if input is empty", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("if (!text || isDisabled()) return");
    });

    it("should not send if disabled", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("if (!text || isDisabled()) return");
    });

    it("should call onSendMessage callback with text", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("props.onSendMessage?.(text)");
    });

    it("should clear input after sending", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain('setInputText("")');
    });
  });

  describe("Visual Styling", () => {
    it("should use Tailwind CSS classes", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("class=");
      expect(source).toContain("bg-");
      expect(source).toContain("border-");
      expect(source).toContain("text-");
      expect(source).toContain("rounded");
    });

    it("should have border-t for top border", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("border-t");
      expect(source).toContain("border-gray-800");
    });

    it("should style disabled state differently", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("cursor-not-allowed");
      expect(source).toContain("text-gray-600");
      expect(source).toContain("text-gray-700");
    });

    it("should have hover states for enabled button", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("hover:text-blue-400");
      expect(source).toContain("hover:bg-gray-900");
      expect(source).toContain("focus:border-blue-500");
      expect(source).toContain("focus:ring-1");
    });

    it("should use resize-none for textarea", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("resize-none");
    });

    it("should set max-height and min-height for textarea", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("max-height");
      expect(source).toContain("min-height");
    });
  });

  describe("Hint Text", () => {
    it("should not show keyboard hint (simplified footer)", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      // Hint text removed for cleaner/simpler design
      expect(source).not.toContain("Press Enter to send");
      expect(source).not.toContain("Shift+Enter for new line");
    });
  });

  describe("Button States", () => {
    it("should disable button when input is empty", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain(
        "disabled={isDisabled() || !inputText().trim()}",
      );
    });

    it("should disable button when session is disabled", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("disabled={isDisabled()");
    });

    it("should have different button colors for disabled/enabled", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("text-gray-700"); // disabled
      expect(source).toContain("text-blue-500"); // enabled
    });

    it("should have title attribute for accessibility", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("title=");
      expect(source).toContain("Agent is running");
      expect(source).toContain("Send (Enter)");
      expect(source).toContain("aria-label=");
    });
  });

  describe("Documentation", () => {
    it("should have JSDoc comment with specification reference", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("/**");
      expect(source).toContain("* FooterInput Component");
      expect(source).toContain("specs/011-agent-panel-rework/spec.md");
      expect(source).toContain("Section 6.5");
    });

    it("should have usage example in JSDoc", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("@example");
      expect(source).toContain("<FooterInput");
    });

    it("should document behavior in JSDoc", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("Disabled when no session is active");
      expect(source).toContain("Enabled during running");
      expect(source).toContain("Enabled when session is paused/completed");
      expect(source).toContain("Enter: Send message");
      expect(source).toContain("Shift+Enter: Insert newline");
    });
  });

  describe("Layout", () => {
    it("should use flexbox layout", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("flex");
      expect(source).toContain("items-center");
      expect(source).toContain("gap-");
    });

    it("should make textarea flex-1 to fill space", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      expect(source).toContain("flex-1");
    });

    it("should have compact padding on container", () => {
      const source = readFileSync(
        join(componentsDir, "FooterInput.tsx"),
        "utf-8",
      );
      // Reduced padding for cleaner/simpler design
      expect(source).toContain("px-3 py-2");
    });
  });
});
