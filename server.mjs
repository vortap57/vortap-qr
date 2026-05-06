import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(root, "data");
const dbFile = join(dataDir, "codes.json");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Vortap-Owner"
};

async function ensureDb() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(dbFile)) {
    await writeFile(dbFile, JSON.stringify({ codes: [] }, null, 2));
  }
}

async function readDb() {
  await ensureDb();
  return JSON.parse(await readFile(dbFile, "utf8"));
}

async function writeDb(db) {
  await writeFile(dbFile, JSON.stringify(db, null, 2));
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", ...corsHeaders });
  res.end(body);
}

function json(res, status, payload) {
  send(res, status, JSON.stringify(payload), "application/json; charset=utf-8");
}

async function bodyJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function isUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function ownerToken(req) {
  const token = req.headers["x-vortap-owner"];
  return typeof token === "string" && token.trim() ? token.trim() : "anonymous";
}

function cleanCode(code) {
  return {
    id: code.id,
    name: code.name,
    targetUrl: code.targetUrl,
    foreground: code.foreground || "#242424",
    background: code.background || "#ffffff",
    scans: code.scans || 0,
    createdAt: code.createdAt,
    updatedAt: code.updatedAt,
    lastScanAt: code.lastScanAt || null
  };
}

async function handleApi(req, res, url) {
  const db = await readDb();
  const owner = ownerToken(req);

  if (url.pathname === "/api/codes" && req.method === "GET") {
    json(res, 200, { codes: db.codes.filter((code) => code.ownerToken === owner).map(cleanCode).reverse() });
    return true;
  }

  if (url.pathname === "/api/codes" && req.method === "POST") {
    const payload = await bodyJson(req);
    if (!payload.name?.trim() || !isUrl(payload.targetUrl)) {
      json(res, 400, { error: "Nom et URL valide requis." });
      return true;
    }

    const now = new Date().toISOString();
    const code = {
      id: randomUUID().slice(0, 8),
      ownerToken: owner,
      name: payload.name.trim(),
      targetUrl: payload.targetUrl.trim(),
      foreground: isHexColor(payload.foreground) ? payload.foreground : "#242424",
      background: isHexColor(payload.background) ? payload.background : "#ffffff",
      scans: 0,
      createdAt: now,
      updatedAt: now,
      lastScanAt: null
    };
    db.codes.push(code);
    await writeDb(db);
    json(res, 201, { code: cleanCode(code) });
    return true;
  }

  const match = url.pathname.match(/^\/api\/codes\/([a-zA-Z0-9-]+)$/);
  if (match && req.method === "PATCH") {
    const code = db.codes.find((item) => item.id === match[1] && item.ownerToken === owner);
    const payload = await bodyJson(req);
    if (!code) {
      json(res, 404, { error: "QR code introuvable." });
      return true;
    }
    if (payload.name !== undefined && !payload.name.trim()) {
      json(res, 400, { error: "Nom requis." });
      return true;
    }
    if (payload.targetUrl !== undefined && !isUrl(payload.targetUrl)) {
      json(res, 400, { error: "URL valide requise." });
      return true;
    }
    if (payload.name !== undefined) code.name = payload.name.trim();
    if (payload.targetUrl !== undefined) code.targetUrl = payload.targetUrl.trim();
    if (payload.foreground !== undefined) code.foreground = isHexColor(payload.foreground) ? payload.foreground : code.foreground;
    if (payload.background !== undefined) code.background = isHexColor(payload.background) ? payload.background : code.background;
    code.updatedAt = new Date().toISOString();
    await writeDb(db);
    json(res, 200, { code: cleanCode(code) });
    return true;
  }

  if (match && req.method === "DELETE") {
    const before = db.codes.length;
    db.codes = db.codes.filter((item) => item.id !== match[1] || item.ownerToken !== owner);
    await writeDb(db);
    json(res, before === db.codes.length ? 404 : 200, { ok: before !== db.codes.length });
    return true;
  }

  return false;
}

async function handleRedirect(res, url) {
  const match = url.pathname.match(/^\/r\/([a-zA-Z0-9-]+)$/);
  if (!match) return false;

  const db = await readDb();
  const code = db.codes.find((item) => item.id === match[1]);
  if (!code) {
    send(res, 404, "<h1>QR code introuvable</h1>", "text/html; charset=utf-8");
    return true;
  }

  code.scans = (code.scans || 0) + 1;
  code.lastScanAt = new Date().toISOString();
  await writeDb(db);
  res.writeHead(302, { Location: code.targetUrl, "Cache-Control": "no-store", ...corsHeaders });
  res.end();
  return true;
}

async function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) {
    send(res, 403, "Acces refuse", "text/plain; charset=utf-8");
    return;
  }
  try {
    const data = await readFile(filePath);
    send(res, 200, data, mime[extname(filePath)] || "application/octet-stream");
  } catch {
    send(res, 404, "Page introuvable", "text/plain; charset=utf-8");
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/health") {
      send(res, 200, "ok", "text/plain; charset=utf-8");
      return;
    }
    if (await handleRedirect(res, url)) return;
    if (url.pathname.startsWith("/api/") && await handleApi(req, res, url)) return;
    await serveStatic(res, url.pathname);
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`Vortap QR running on ${host}:${port}`);
});
