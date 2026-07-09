import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve("dist");
const serverDir = path.join(distDir, "server");
const hostingDir = path.join(distDir, ".openai");

const htmlFiles = [
  "index.html",
  "Michigan_HeadNeck_Navigator.html",
  "design-gallery.html",
  "design-option-clinical.html",
  "design-option-journey.html",
  "design-option-trial-desk.html"
];

const pages = {};
for (const file of htmlFiles) {
  pages[`/${file}`] = fs.readFileSync(path.join(distDir, file), "utf8");
}
pages["/"] = pages["/index.html"];

fs.mkdirSync(serverDir, { recursive: true });
fs.mkdirSync(hostingDir, { recursive: true });
fs.copyFileSync(path.resolve(".openai/hosting.json"), path.join(hostingDir, "hosting.json"));

const entrypoint = `const pages = ${JSON.stringify(pages)};\n\nfunction resolvePath(requestUrl) {\n  const url = new URL(requestUrl);\n  let pathname = decodeURIComponent(url.pathname);\n  if (pathname.endsWith(\"/\") && pathname !== \"/\") pathname += \"index.html\";\n  return pathname;\n}\n\nasync function handleRequest(request) {\n  const pathname = resolvePath(request.url);\n  const body = pages[pathname];\n  if (body) {\n    return new Response(body, {\n      headers: {\n        \"content-type\": \"text/html; charset=utf-8\",\n        \"cache-control\": \"public, max-age=60\"\n      }\n    });\n  }\n  return new Response(\"Not found\", {\n    status: 404,\n    headers: { \"content-type\": \"text/plain; charset=utf-8\" }\n  });\n}\n\nexport const fetch = handleRequest;\nexport default { fetch: handleRequest };\n`;

fs.writeFileSync(path.join(serverDir, "index.js"), entrypoint);
