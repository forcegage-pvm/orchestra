import Handlebars from "handlebars";
const hb = Handlebars.create();
hb.registerHelper("default", (value: unknown, defaultValue: unknown) => {
  console.log("args:", JSON.stringify(value), JSON.stringify(defaultValue));
  return value ?? defaultValue;
});
const tpl = hb.compile("Result: {{default reviewAttempt 1}}");
console.log(tpl({}));
console.log(tpl({ reviewAttempt: 5 }));
