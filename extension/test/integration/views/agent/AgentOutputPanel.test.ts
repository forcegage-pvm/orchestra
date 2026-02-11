import { describe, expect, it, vi } from "vitest";
import type { AgentOutput } from "../../../../src/agents/AgentRunner.js";
import {
  bindAgentOutput,
  convertAgentOutput,
} from "../../../../src/views/agent/agentOutputConverter.js";

const baseOutput = {
  timestamp: "2026-01-25T10:00:00.000Z",
  iteration: 1,
};

type Listener = (output: AgentOutput) => void;

function createEmitter() {
  const listeners = new Set<Listener>();
  const event = (listener: Listener) => {
    listeners.add(listener);
    return {
      dispose: () => listeners.delete(listener),
    };
  };

  const fire = (output: AgentOutput) => {
    for (const listener of [...listeners]) {
      listener(output);
    }
  };

  return { event, fire };
}

describe("agent output converter", () => {
  it("converts error output into tool_result item", () => {
    const conversion = convertAgentOutput({
      ...baseOutput,
      type: "error",
      errorCode: "TOOL_EXECUTION_FAILED",
      errorMessage: "Boom",
    });

    expect(conversion.type).toBe("item");
    if (conversion.type !== "item") {
      throw new Error("Expected item conversion");
    }

    expect(conversion.item.type).toBe("tool_result");
    if (conversion.item.type !== "tool_result") {
      throw new Error("Expected tool_result item");
    }

    const content = conversion.item.content;
    expect(content.success).toBe(false);
    expect(content.output).toBe("Boom");
    expect(content.error).toBe("TOOL_EXECUTION_FAILED");
  });
});

describe("agent output wiring", () => {
  it("forwards events to panel in order and updates status", () => {
    const emitter = createEmitter();
    const panel = {
      addOutput: vi.fn(),
      updateStatus: vi.fn(),
    };

    let idCounter = 0;
    const generateId = () => {
      idCounter += 1;
      return `id-${idCounter}`;
    };

    const subscription = bindAgentOutput(emitter.event, panel, generateId);

    emitter.fire({
      ...baseOutput,
      type: "thinking",
      text: "Thinking...",
    });
    emitter.fire({
      ...baseOutput,
      type: "tool_call",
      toolName: "get_current_task",
      toolInput: { task_id: 2 },
    });
    emitter.fire({
      ...baseOutput,
      type: "tool_result",
      toolName: "get_current_task",
      toolResult: "ok",
      toolSuccess: true,
    });
    emitter.fire({
      ...baseOutput,
      type: "status",
      newStatus: "running",
    });

    subscription.dispose();

    expect(panel.addOutput).toHaveBeenCalledTimes(3);
    const [thinking, toolCall, toolResult] = panel.addOutput.mock.calls.map(
      (call) => call[0],
    );

    expect(thinking.type).toBe("thinking");
    expect(thinking.content.text).toBe("Thinking...");

    expect(toolCall.type).toBe("tool_call");
    expect(toolCall.content.toolName).toBe("get_current_task");

    expect(toolResult.type).toBe("tool_result");
    expect(toolResult.content.success).toBe(true);
    expect(toolResult.content.output).toBe("ok");

    expect(panel.updateStatus).toHaveBeenCalledWith("running");
  });
});
