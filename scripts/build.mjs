import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const sources = ["index.html", "app.css", "core.js", "demo.js", "app.js"];
const [template, css, ...scripts] = await Promise.all(
  sources.map(async (name) => (await readFile(new URL("src/" + name, root), "utf8")).replace(/\r\n/g, "\n")),
);

for (const placeholder of ["<!-- STYLE -->", "<!-- SCRIPT -->"]) {
  if (template.split(placeholder).length !== 2) {
    throw new Error("Expected one " + placeholder + " placeholder");
  }
}
if (/<\/style/i.test(css) || scripts.some((source) => /<\/script/i.test(source))) {
  throw new Error("A source file contains a closing tag that cannot be inlined");
}

const output = template
  .replace("<!-- STYLE -->", () => "<style>\n" + css + "</style>")
  .replace("<!-- SCRIPT -->", () => "<script>\n" + scripts.join("\n") + "</script>");
const path = new URL("index.html", root);
if (process.argv.includes("--check")) {
  const current = (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
  if (current !== output) {
    console.error("index.html is out of date. Run npm run build.");
    process.exitCode = 1;
  }
} else {
  await writeFile(path, output);
}
