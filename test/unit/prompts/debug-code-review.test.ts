import { it } from "vitest";
import { PromptBuilder } from "../../../extension/src/prompts/PromptBuilder.js";
import { TemplateLoader } from "../../../extension/src/prompts/TemplateLoader.js";
import path from "path";

it("debug implement output", () => {
  const workspaceRoot = path.join(process.cwd(), "extension");
  const builder = new PromptBuilder({ templateLoader: new TemplateLoader({ workspaceRoot, devMode: true }) });
  const context = { workspace: { id: "w1" }, other: "value" } as any;
  const output = builder.buildCodeReviewFixImplementPrompt(context, { status: "APPROVED" } as any);
  console.log("DEBUG OUTPUT:\n" + output);
  if (output.includes("Review summary:")) throw new Error("Output contains 'Review summary:'");});