/**
 * fetch tool - Retrieve web content via HTTP requests
 */

import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";

interface FetchInput {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

interface FetchOutput {
  url: string;
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
}

const DEFAULT_TIMEOUT_MS = 60000;

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

async function fetchUrl(input: FetchInput): Promise<FetchOutput> {
  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestInit: RequestInit = {
      method: "GET",
      signal: controller.signal,
    };

    if (input.headers) {
      requestInit.headers = input.headers;
    }

    const response = await fetch(input.url, requestInit);
    const body = await response.text();

    return {
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: headersToRecord(response.headers),
      body,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runFetch(input: FetchInput): Promise<ToolResult> {
  try {
    const output = await fetchUrl(input);
    return {
      success: true,
      output: JSON.stringify(output, null, 2),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      output: JSON.stringify({
        url: input.url,
      }),
      error: `Fetch failed: ${message}`,
    };
  }
}

export const fetchTool: AgentTool = {
  name: "fetch",
  description: "Fetch a URL and return response status, headers, and body.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to fetch",
      },
      headers: {
        type: "object",
        description: "Optional request headers",
      },
      timeoutMs: {
        type: "number",
        description: "Optional timeout in milliseconds (default 60000)",
      },
    },
    required: ["url"],
  },
  execute: async (
    input: unknown,
    _context: ToolContext,
  ): Promise<ToolResult> => {
    return runFetch(input as FetchInput);
  },
};
