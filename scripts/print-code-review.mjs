import path from "path";
import { PromptBuilder } from "./extension/src/prompts/PromptBuilder.js";
import { TemplateLoader } from "./extension/src/prompts/TemplateLoader.js";

const workspaceRoot = path.join(process.cwd(), "extension");
const builder = new PromptBuilder({ templateLoader: new TemplateLoader({ workspaceRoot, devMode: true }) });
const context = { workspace: { id: "w1" }, other: "value" };
console.log(builder.buildCodeReviewFixImplementPrompt(context, { status: "APPROVED" }));
