import Handlebars from "handlebars";
const hb = Handlebars.create();
hb.registerHelper("default", (value: unknown, defaultValue: unknown) => {
  return value ?? defaultValue;
});
const tpl = hb.compile("Review Attempt: {{default reviewAttempt 1}}");
const result = tpl({});
console.log("result:", JSON.stringify(result));
console.log("includes check:", result.includes("Review Attempt: 1"));
