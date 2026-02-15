/**
 * Tool result builder helpers
 */
import { createToolError } from "../errors.js";
export function successResult(toolName, content, warnings) {
    const contentArray = typeof content === "string" ? [{ type: "text", value: content }] : content;
    return {
        success: true,
        content: contentArray,
        metadata: {
            toolName,
            callId: "",
            durationMs: 0,
            warnings,
        },
    };
}
export function errorResult(toolName, code, message, suggestion, details) {
    const error = createToolError(code, message, suggestion, details);
    return {
        success: false,
        content: [{ type: "error", value: message }],
        error,
        metadata: {
            toolName,
            callId: "",
            durationMs: 0,
        },
    };
}
export function toLegacyResult(result) {
    const output = result.content.map((part) => part.value).join("\n");
    const error = result.success ? undefined : (result.error?.message ?? output);
    return {
        success: result.success,
        output,
        error,
    };
}
