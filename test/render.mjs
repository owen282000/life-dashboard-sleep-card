// Serves the repository over a throwaway local port and drives headless Chrome:
// runs the in-browser checks, then writes screenshots. Usage: node test/render.mjs <outdir>
import { execFile } from "node:child_process";
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(process.argv[2] || join(root, "test/out"));
const chrome =
  process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(outDir, { recursive: true });

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png" };
const server = createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname)).replace(/^\/+/, "");
  const file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file)) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(response);
});

await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}/test/harness.html`;

const shots = [
  ["gallery-light", "?theme=light", 1100, 2200],
  ["gallery-dark", "?theme=dark", 1100, 2200],
  ["gallery-ha-dark", "?theme=ha-dark", 1100, 2200],
  ["wide-iphone-light", "?theme=light&one=iphone&width=620", 668, 274],
  ["wide-iphone-dark", "?theme=dark&one=iphone&width=620", 668, 274],
  ["phone-dense-light", "?theme=light&one=dense&width=360", 400, 360],
  ["phone-dense-dark", "?theme=dark&one=dense&width=360", 400, 360],
  ["phone-dense-hover", "?theme=dark&one=dense&width=360&hover=18", 400, 360],
  ["companion-dark", "?theme=dark&one=companion&width=620", 668, 274],
  ["companion-phone-light", "?theme=light&one=companion&width=360", 400, 360],
  ["wide-android-hover", "?theme=dark&one=android&width=620&hover=6", 660, 300],
  ["rtl-hebrew", "?theme=dark&one=iphone&width=520&dir=rtl&lang=he", 560, 300],
  ["narrow-240", "?theme=light&one=iphone&width=240", 280, 400],
  ["empty-light", "?theme=light&one=empty&width=460", 500, 280],
  ["sleeping-dark", "?theme=dark&one=sleeping&width=460", 500, 280],
  ["twelve-hour", "?theme=light&one=android&width=620&lang=en-US&hours=am_pm", 660, 300],
];

const flags = ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--virtual-time-budget=6000"];
let failed = 0;
try {
  for (const theme of ["light", "dark"]) {
    const { stdout } = await run(chrome, [...flags, "--dump-dom", `${base}?theme=${theme}&check=1`], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const text = /<pre id="results">([\s\S]*?)<\/pre>/.exec(stdout)?.[1] ?? "NO RESULTS";
    const decoded = text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
    console.log(`--- browser checks, ${theme} theme ---`);
    console.log(decoded);
    failed += decoded === "NO RESULTS" ? 1 : (decoded.match(/^FAIL/gm) || []).length;
  }
  for (const [name, query, width, height] of shots) {
    const path = join(outDir, `${name}.png`);
    await run(chrome, [
      ...flags,
      "--force-device-scale-factor=2",
      `--screenshot=${path}`,
      `--window-size=${width},${height}`,
      `${base}${query}`,
    ]);
    console.log("wrote", path);
  }
} finally {
  server.close();
}
process.exit(failed ? 1 : 0);
