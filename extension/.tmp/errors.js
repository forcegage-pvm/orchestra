/**
 * Tool Error Codes and Factory Helpers
 */
/**
 * Fixed error codes for tool failures
 */
export var ToolErrorCode;
(function (ToolErrorCode) {
    // File operations
    ToolErrorCode["FILE_NOT_FOUND"] = "FILE_NOT_FOUND";
    ToolErrorCode["FILE_EXISTS"] = "FILE_EXISTS";
    ToolErrorCode["PATH_TRAVERSAL"] = "PATH_TRAVERSAL";
    ToolErrorCode["PERMISSION_DENIED"] = "PERMISSION_DENIED";
    ToolErrorCode["BINARY_FILE"] = "BINARY_FILE";
    ToolErrorCode["FILE_TOO_LARGE"] = "FILE_TOO_LARGE";
    // Edit operations
    ToolErrorCode["MULTIPLE_MATCHES"] = "MULTIPLE_MATCHES";
    ToolErrorCode["NO_MATCH"] = "NO_MATCH";
    ToolErrorCode["INVALID_RANGE"] = "INVALID_RANGE";
    // Terminal operations
    ToolErrorCode["SHELL_INTEGRATION_UNAVAILABLE"] = "SHELL_INTEGRATION_UNAVAILABLE";
    ToolErrorCode["COMMAND_FAILED"] = "COMMAND_FAILED";
    ToolErrorCode["NO_OUTPUT"] = "NO_OUTPUT";
    ToolErrorCode["TERMINAL_NOT_FOUND"] = "TERMINAL_NOT_FOUND";
    // Task operations
    ToolErrorCode["TASK_NOT_FOUND"] = "TASK_NOT_FOUND";
    ToolErrorCode["TASK_FAILED"] = "TASK_FAILED";
    // General
    ToolErrorCode["TIMEOUT"] = "TIMEOUT";
    ToolErrorCode["CANCELLED"] = "CANCELLED";
    ToolErrorCode["INVALID_INPUT"] = "INVALID_INPUT";
    ToolErrorCode["WORKSPACE_REQUIRED"] = "WORKSPACE_REQUIRED";
    ToolErrorCode["PARTIAL_FAILURE"] = "PARTIAL_FAILURE";
    ToolErrorCode["UNKNOWN"] = "UNKNOWN";
    // Test runner operations
    ToolErrorCode["TEST_RUN_IN_PROGRESS"] = "TEST_RUN_IN_PROGRESS";
    ToolErrorCode["TIER_NOT_CONFIGURED"] = "TIER_NOT_CONFIGURED";
    ToolErrorCode["CONFIG_NOT_FOUND"] = "CONFIG_NOT_FOUND";
    ToolErrorCode["PROMOTION_BLOCKED"] = "PROMOTION_BLOCKED";
    ToolErrorCode["NO_CHANGES_DETECTED"] = "NO_CHANGES_DETECTED";
    ToolErrorCode["TEST_COMMAND_BLOCKED"] = "TEST_COMMAND_BLOCKED";
})(ToolErrorCode || (ToolErrorCode = {}));
/**
 * Create a structured ToolError object
 */
export function createToolError(code, message, suggestion, details) {
    const error = {
        code,
        message,
    };
    if (suggestion) {
        error.suggestion = suggestion;
    }
    if (details) {
        error.details = details;
    }
    return error;
}
