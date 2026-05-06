const OWNER_KEY = "vortap.ownerToken";
const VORTAP_CONFIG = window.VORTAP_CONFIG || {};
const IS_NATIVE_APP = ["capacitor:", "ionic:"].includes(location.protocol);
const CONFIG_API_URL = normalizeBaseUrl(VORTAP_CONFIG.apiUrl);
const API_BASE_URL = IS_NATIVE_APP && CONFIG_API_URL ? CONFIG_API_URL : location.origin;

const state = { codes: [], status: null, activePreviewCode: null };

const els = {
  form: document.querySelector("#create-form"),
  error: document.querySelector("#form-error"),
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
  const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}${path}`, {
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

function cacheBust(url) {
  return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

function safeName(value, fallback = "qr") {
  return (value || fallback).toLowerCase().replace(/[^a-z0-9]+/g, "-") || fallback;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function qrImg(code) {
  return `<img src="${cacheBust(code.qrSvgUrl)}" alt="QR code ${escapeHtml(code.name)}">`;
}

function inactiveQrPreview() {
  return `<svg viewBox="0 0 220 220" role="img" aria-label="Apercu QR"><rect width="220" height="220" rx="20" fill="#fff"/><g fill="#242424" opacity=".16"><rect x="30" y="30" width="54" height="54" rx="8"/><rect x="136" y="30" width="54" height="54" rx="8"/><rect x="30" y="136" width="54" height="54" rx="8"/><rect x="102" y="102" width="24" height="24" rx="5"/><rect x="140" y="104" width="44" height="18" rx="5"/><rect x="104" y="140" width="18" height="44" rx="5"/></g></svg>`;
}

function renderPreview() {
  const active = Boolean(state.activePreviewCode);
  els.previewQr.innerHTML = active ? qrImg(state.activePreviewCode) : inactiveQrPreview();
  els.previewStatus.textContent = active ? "Scannable" : "A creer";
  els.previewLink.textContent = active ? state.activePreviewCode.dynamicUrl : "Le QR serveur apparait apres creation";
  els.previewLink.href = active ? state.activePreviewCode.dynamicUrl : "#generator";
  els.previewSvg.disabled = !active;
  els.previewPng.disabled = !active;
}

function formatDate(value) {
  if (!value) return "jamais scanne";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function refreshStatus() {
  const publicBaseUrl = state.status?.publicBaseUrl || API_BASE_URL;
  els.baseUrl.value = publicBaseUrl;
  els.domainDiagnostic.textContent = `QR generes par le serveur: ${publicBaseUrl}`;
  els.baseWarning.textContent = publicBaseUrl.includes("127.0.0.1") || publicBaseUrl.includes("localhost")
    ? "Mode local: pour les clients, utilisez l'URL Render publique."
    : "";
}

function render() {
  els.codes.innerHTML = "";
  els.empty.hidden = state.codes.length > 0;
  els.totalCodes.textContent = state.codes.length;
  els.totalScans.textContent = state.codes.reduce((sum, code) => sum + code.scans, 0);
  refreshStatus();
  renderPreview();

  for (const code of state.codes) {
    const fragment = els.template.content.cloneNode(true);
    const card = fragment.querySelector(".card");
    const form = fragment.querySelector(".edit-form");
    fragment.querySelector(".qr-box").innerHTML = qrImg(code);
    fragment.querySelector(".card-title").textContent = code.name;
    fragment.querySelector(".short-link").textContent = code.dynamicUrl;
    fragment.querySelector(".short-link").href = code.dynamicUrl;
    fragment.querySelector(".scans").textContent = code.scans;
    fragment.querySelector(".updated").textContent = formatDate(code.lastScanAt);
    form.name.value = code.name;
    form.targetUrl.value = code.targetUrl;
    form.foreground.value = code.foreground || "#242424";
    form.background.value = code.background || "#ffffff";

    const filename = `vortap-${safeName(code.name, code.id)}`;
    const svgLink = fragment.querySelector(".download-svg");
    svgLink.href = code.qrSvgUrl;
    svgLink.download = `${filename}.svg`;
    fragment.querySelector(".download-png").addEventListener("click", () => downloadPng(code, filename));

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const { code: updated } = await api(`/api/codes/${code.id}`, { method: "PATCH", body: JSON.stringify(data) });
      state.codes = state.codes.map((item) => item.id === updated.id ? updated : item);
      if (state.activePreviewCode?.id === updated.id) state.activePreviewCode = updated;
      render();
    });

    fragment.querySelector(".delete").addEventListener("click", async () => {
      if (!confirm(`Supprimer "${code.name}" ?`)) return;
      await api(`/api/codes/${code.id}`, { method: "DELETE" });
      state.codes = state.codes.filter((item) => item.id !== code.id);
      if (state.activePreviewCode?.id === code.id) state.activePreviewCode = state.codes[0] || null;
      render();
    });

    els.codes.appendChild(card);
  }
}

async function downloadPng(code, filename) {
  const response = await fetch(cacheBust(code.qrSvgUrl));
  const svg = await response.text();
  const image = new Image();
  const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1200;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = code.background || "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(objectUrl);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${filename}.png`;
    a.click();
  };
  image.src = objectUrl;
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
  refreshStatus();
});

els.previewSvg.addEventListener("click", () => {
  if (!state.activePreviewCode) return;
  const a = document.createElement("a");
  a.href = state.activePreviewCode.qrSvgUrl;
  a.download = `vortap-${safeName(state.activePreviewCode.name, state.activePreviewCode.id)}.svg`;
  a.click();
});

els.previewPng.addEventListener("click", () => {
  if (!state.activePreviewCode) return;
  downloadPng(state.activePreviewCode, `vortap-${safeName(state.activePreviewCode.name, state.activePreviewCode.id)}`);
});

async function load() {
  try {
    const [status, payload] = await Promise.all([api("/api/status"), api("/api/codes")]);
    state.status = status;
    state.codes = payload.codes;
    state.activePreviewCode = state.codes[0] || null;
  } catch (error) {
    els.error.textContent = error.message;
  }
  render();
}

load();
