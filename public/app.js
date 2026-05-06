const BASE_KEY = "vortap.baseUrl";
const OWNER_KEY = "vortap.ownerToken";
const VORTAP_CONFIG = window.VORTAP_CONFIG || {};
const isNative = ["capacitor:", "ionic:"].includes(location.protocol);
const configApi = normalizeBaseUrl(VORTAP_CONFIG.apiUrl);
const configDomain = normalizeBaseUrl(VORTAP_CONFIG.publicQrDomain);
const apiBase = isNative && configApi ? configApi : location.origin;
const defaultBase = isNative ? (configDomain || configApi || apiBase) : location.origin;
const savedBase = normalizeBaseUrl(localStorage.getItem(BASE_KEY));

const state = {
  codes: [],
  baseUrl: savedBase || defaultBase,
  activePreviewCode: null
};

const els = {
  form: document.querySelector("#create-form"),
  error: document.querySelector("#form-error"),
  targetUrl: document.querySelector("#targetUrl"),
  foreground: document.querySelector("#foreground"),
  background: document.querySelector("#background"),
  previewQr: document.querySelector("#preview-qr"),
  previewLink: document.querySelector("#preview-link"),
  previewSvg: document.querySelector("#preview-svg"),
  previewPng: document.querySelector("#preview-png"),
  previewStatus: document.querySelector("#preview-status"),
  baseForm: document.querySelector("#base-form"),
  baseUrl: document.querySelector("#base-url"),
  baseWarning: document.querySelector("#base-warning"),
  domainDiagnostic: document.querySelector("#domain-diagnostic"),
  codes: document.querySelector("#codes"),
  empty: document.querySelector("#empty"),
  template: document.querySelector("#code-card"),
  totalCodes: document.querySelector("#total-codes"),
  totalScans: document.querySelector("#total-scans")
};

function ownerToken() {
  let token = localStorage.getItem(OWNER_KEY);
  if (!token) {
    token = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(OWNER_KEY, token);
  }
  return token;
}

async function api(path, options = {}) {
  const response = await fetch(`${apiBase.replace(/\/+$/, "")}${path}`, {
    headers: { "Content-Type": "application/json", "X-Vortap-Owner": ownerToken() },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Action impossible.");
  return payload;
}

function normalizeBaseUrl(value) {
  if (!value) return "";
  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.href.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function shortUrl(id) {
  return `${state.baseUrl.replace(/\/+$/, "")}/r/${id}`;
}

function activePreviewUrl() {
  return state.activePreviewCode ? shortUrl(state.activePreviewCode.id) : `${state.baseUrl.replace(/\/+$/, "")}/r/demo`;
}

function currentDesign() {
  return {
    foreground: els.foreground.value || "#242424",
    background: els.background.value || "#ffffff"
  };
}

function buildQr(text) {
  if (!window.qrcode) throw new Error("Bibliotheque QR indisponible.");
  const qr = window.qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr;
}

function qrSvg(text, design = {}) {
  return buildQr(text)
    .createSvgTag({ cellSize: 8, margin: 32, scalable: true, alt: "QR code Vortap" })
    .replace('fill="white"', `fill="${design.background || "#ffffff"}"`)
    .replace('fill="black"', `fill="${design.foreground || "#242424"}"`);
}

function inactiveQrPreview() {
  return `<svg viewBox="0 0 220 220" role="img" aria-label="Apercu QR"><rect width="220" height="220" rx="20" fill="#fff"/><g fill="#242424" opacity=".16"><rect x="30" y="30" width="54" height="54" rx="8"/><rect x="136" y="30" width="54" height="54" rx="8"/><rect x="30" y="136" width="54" height="54" rx="8"/><rect x="102" y="102" width="24" height="24" rx="5"/><rect x="140" y="104" width="44" height="18" rx="5"/><rect x="104" y="140" width="18" height="44" rx="5"/></g></svg>`;
}

function renderPreview() {
  const active = Boolean(state.activePreviewCode);
  const link = activePreviewUrl();
  els.previewQr.innerHTML = active ? qrSvg(link, currentDesign()) : inactiveQrPreview();
  els.previewStatus.textContent = active ? "Scannable" : "A creer";
  els.previewLink.textContent = active ? link : "Le lien apparait apres creation";
  els.previewLink.href = active ? link : "#generator";
  els.previewSvg.disabled = !active;
  els.previewPng.disabled = !active;
}

function formatDate(value) {
  if (!value) return "jamais scanne";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function safeName(value, fallback = "qr") {
  return (value || fallback).toLowerCase().replace(/[^a-z0-9]+/g, "-") || fallback;
}

function render() {
  els.codes.innerHTML = "";
  els.empty.hidden = state.codes.length > 0;
  els.totalCodes.textContent = state.codes.length;
  els.totalScans.textContent = state.codes.reduce((sum, code) => sum + code.scans, 0);
  els.baseUrl.value = state.baseUrl;
  els.domainDiagnostic.textContent = `Les QR utilisent: ${state.baseUrl}`;
  renderPreview();

  for (const code of state.codes) {
    const fragment = els.template.content.cloneNode(true);
    const card = fragment.querySelector(".card");
    const form = fragment.querySelector(".edit-form");
    const design = { foreground: code.foreground, background: code.background };
    const link = shortUrl(code.id);
    const svg = qrSvg(link, design);
    fragment.querySelector(".qr-box").innerHTML = svg;
    fragment.querySelector(".card-title").textContent = code.name;
    fragment.querySelector(".short-link").textContent = link;
    fragment.querySelector(".short-link").href = link;
    fragment.querySelector(".scans").textContent = code.scans;
    fragment.querySelector(".updated").textContent = formatDate(code.lastScanAt);
    form.name.value = code.name;
    form.targetUrl.value = code.targetUrl;
    form.foreground.value = code.foreground || "#242424";
    form.background.value = code.background || "#ffffff";

    const filename = `vortap-${safeName(code.name, code.id)}`;
    const downloadSvg = fragment.querySelector(".download-svg");
    downloadSvg.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    downloadSvg.download = `${filename}.svg`;
    fragment.querySelector(".download-png").addEventListener("click", () => downloadPng(link, design, filename));

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const { code: updated } = await api(`/api/codes/${code.id}`, { method: "PATCH", body: JSON.stringify(data) });
      state.codes = state.codes.map((item) => item.id === updated.id ? updated : item);
      render();
    });

    fragment.querySelector(".delete").addEventListener("click", async () => {
      await api(`/api/codes/${code.id}`, { method: "DELETE" });
      state.codes = state.codes.filter((item) => item.id !== code.id);
      render();
    });

    els.codes.appendChild(card);
  }
}

function downloadPng(text, design, filename) {
  const qr = buildQr(text);
  const count = qr.getModuleCount();
  const margin = 4;
  const scale = 18;
  const size = (count + margin * 2) * scale;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = design.background || "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = design.foreground || "#242424";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) ctx.fillRect((col + margin) * scale, (row + margin) * scale, scale, scale);
    }
  }
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${filename}.png`;
  a.click();
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.error.textContent = "";
  try {
    const data = Object.fromEntries(new FormData(els.form));
    const { code } = await api("/api/codes", { method: "POST", body: JSON.stringify(data) });
    state.activePreviewCode = code;
    state.codes.unshift(code);
    els.form.reset();
    els.foreground.value = data.foreground || "#242424";
    els.background.value = data.background || "#ffffff";
    render();
  } catch (error) {
    els.error.textContent = error.message;
  }
});

els.baseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const next = normalizeBaseUrl(els.baseUrl.value);
  if (!next) {
    els.baseWarning.textContent = "Entrez une adresse valide.";
    return;
  }
  state.baseUrl = next;
  localStorage.setItem(BASE_KEY, next);
  render();
});

for (const input of [els.targetUrl, els.foreground, els.background]) {
  input.addEventListener("input", renderPreview);
}

els.previewSvg.addEventListener("click", () => {
  if (!state.activePreviewCode) return;
  const svg = qrSvg(activePreviewUrl(), currentDesign());
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  a.download = `vortap-${safeName(state.activePreviewCode.name, state.activePreviewCode.id)}.svg`;
  a.click();
});

els.previewPng.addEventListener("click", () => {
  if (!state.activePreviewCode) return;
  downloadPng(activePreviewUrl(), currentDesign(), `vortap-${safeName(state.activePreviewCode.name, state.activePreviewCode.id)}`);
});

async function load() {
  try {
    const payload = await api("/api/codes");
    state.codes = payload.codes;
    state.activePreviewCode = state.codes[0] || null;
  } catch (error) {
    els.error.textContent = error.message;
  }
  render();
}

load();
