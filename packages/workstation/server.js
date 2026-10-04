import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 4173);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
]);

createServer(async (request, response) => {
  try {
    const requested = new URL(request.url ?? "/", "http://localhost").pathname;
    const relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
    const file = normalize(join(root, relative));

    if (!file.startsWith(root)) {
      response.writeHead(403);
      response.end("forbidden");
      return;
    }

    const body = await readFile(file);
    response.writeHead(200, {
      "content-type": contentTypes.get(extname(file)) ?? "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`TradeLedger workstation: http://127.0.0.1:${port}`);
});
