import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";

vi.mock("../../../src/mcp-server/handlers/audit-logging.js", () => ({
  logToolExecution: vi.fn().mockResolvedValue(undefined),
}));

import { handleAddInterfaceValidation } from "../../../src/mcp-server/handlers/add-interface-validation.js";

const CONFIG_RELATIVE_PATH = ".orchestra/interface-validations.yaml";

let tempDir: string;
let cwdSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "orchestra-interface-validation-"),
  );
  cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);
});

afterEach(async () => {
  cwdSpy?.mockRestore();
  cwdSpy = null;
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("add_interface_validation handler", () => {
  it("adds a new interface validation successfully", async () => {
    const response = await handleAddInterfaceValidation({
      name: "API Schema Validation",
      patterns: ["src/interfaces/**/*.ts"],
      command: "echo ok",
    });

    const payload = JSON.parse(response.content[0]?.text ?? "{}");
    expect(payload.success).toBe(true);
    expect(payload.validationName).toBe("API Schema Validation");

    const configPath = path.join(process.cwd(), CONFIG_RELATIVE_PATH);
    const configText = await fs.readFile(configPath, "utf8");
    const config = parse(configText) as {
      version: string;
      validations: Array<{ name: string; patterns: string[] }>;
    };

    expect(config.version).toBeTruthy();
    expect(config.validations).toHaveLength(1);
    expect(config.validations[0]?.name).toBe("API Schema Validation");
  });

  it("returns validation error when name is missing", async () => {
    const response = await handleAddInterfaceValidation({
      patterns: ["src/**/*.ts"],
      command: "echo ok",
    });

    const errorPayload = JSON.parse(response.content[0]?.text ?? "{}");
    expect(errorPayload.success).toBe(false);
    expect(errorPayload.error?.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(errorPayload.error?.details?.issues)).toBe(true);
    expect(errorPayload.error?.details?.issues.length).toBeGreaterThan(0);
  });

  it("returns validation error when patterns are invalid", async () => {
    const response = await handleAddInterfaceValidation({
      name: "Invalid patterns",
      patterns: [],
      command: "echo ok",
    });

    const errorPayload = JSON.parse(response.content[0]?.text ?? "{}");
    expect(errorPayload.success).toBe(false);
    expect(errorPayload.error?.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(errorPayload.error?.details?.issues)).toBe(true);
    expect(errorPayload.error?.details?.issues.length).toBeGreaterThan(0);
  });

  it("returns error when patterns overlap existing validations", async () => {
    const configPath = path.join(process.cwd(), CONFIG_RELATIVE_PATH);
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      stringify({
        version: "1.0",
        validations: [
          {
            name: "Existing",
            patterns: ["src/**/*.ts"],
            command: "echo ok",
          },
        ],
      }),
      "utf8",
    );

    const response = await handleAddInterfaceValidation({
      name: "Overlap",
      patterns: ["src/**/*.ts"],
      command: "echo ok",
    });

    const payload = JSON.parse(response.content[0]?.text ?? "{}");
    expect(payload.success).toBe(false);
    expect(payload.error?.message).toContain("overlap");
  });
});
