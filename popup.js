const MESSAGE_DOWNLOAD_MANY = "IH_DOWNLOAD_MANY";
const CONFIG = window.IMAGE_HUNTER_CONFIG || {
  supportUrl: "https://img.playbox.dpdns.org/support",
  apiBaseUrl: "https://img.playbox.dpdns.org/api"
};
const FREE_DAILY_LIMIT = 20;
const FREE_BATCH_LIMIT = 10;
const FORMATS = ["ALL", "JPG", "PNG", "WEBP", "SVG", "GIF", "AVIF", "OTHER"];
const state = {
  assets: [],
  filter: "ALL",
  minSize: 10,
  selected: new Set(),
  usage: { date: today(), count: 0 },
  trialUntil: 0,
  pending: null,
  pageHost: "page",
  scanning: false
};
const $ = {};

document.addEventListener("DOMContentLoaded", async () => {
  cache();
  bind();
  await loadState();
  renderUsage();
  await scan();
});

function cache() {
  ["pageStatus", "refreshBtn", "formatTabs", "minSize", "minSizeValue", "grid", "selectVisibleBtn", "downloadSelectedBtn", "downloadVisibleBtn", "usageBar", "paywall", "closePaywallBtn", "startTrialBtn", "restoreBtn", "supportLink", "toast"].forEach(id => $[id] = document.getElementById(id));
}

function bind() {
  if ($.supportLink) $.supportLink.href = CONFIG.supportUrl;
  $.refreshBtn.onclick = scan;
  $.minSize.oninput = () => {
    state.minSize = Number($.minSize.value) || 0;
    $.minSizeValue.textContent = state.minSize + "px";
    saveState();
    renderAll();
  };
  $.selectVisibleBtn.onclick = selectVisible;
  $.downloadSelectedBtn.onclick = () => download(state.assets.filter(a => state.selected.has(a.id)));
  $.downloadVisibleBtn.onclick = () => download(visible());
  $.closePaywallBtn.onclick = () => hidePaywall();
  $.paywall.onclick = e => { if (e.target === $.paywall) hidePaywall(); };
  $.startTrialBtn.onclick = async () => {
    state.trialUntil = Date.now() + 3 * 864e5;
    await saveState();
    hidePaywall();
    renderUsage();
    toast("已开启本地 3 天试用。正式版接入支付后替换此逻辑。");
    if (state.pending) {
      const a = state.pending;
      state.pending = null;
      download(a, { bypass: true });
    }
  };
  $.restoreBtn.onclick = () => toast("恢复购买接口已预留，正式版对接 " + CONFIG.apiBaseUrl + " 校验订单。");
  document.querySelectorAll('input[name="plan"]').forEach(i => i.onchange = () => {
    document.querySelectorAll(".plan").forEach(p => p.classList.remove("active"));
    i.closest(".plan").classList.add("active");
  });
}

async function loadState() {
  const s = await chrome.storage.local.get(["ihUsage", "ihTrialUntil", "ihMinSize"]);
  state.usage = s.ihUsage && s.ihUsage.date === today() ? s.ihUsage : { date: today(), count: 0 };
  state.trialUntil = Number(s.ihTrialUntil || 0);
  state.minSize = Number(s.ihMinSize || 10);
  $.minSize.value = state.minSize;
  $.minSizeValue.textContent = state.minSize + "px";
}

function saveState() {
  return chrome.storage.local.set({ ihUsage: state.usage, ihTrialUntil: state.trialUntil, ihMinSize: state.minSize });
}

async function scan() {
  if (state.scanning) return;
  state.scanning = true;
  state.selected.clear();
  state.assets = [];
  status("正在扫描当前网页…");
  $.grid.innerHTML = '<div class="empty-state"><h3>扫描中…</h3><p>正在读取当前网页图片、背景图和 SVG。</p></div>';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:\/\//.test(tab.url || "")) throw new Error("Chrome 系统页、扩展页或本地文件页不能扫描。请打开普通网页后再试。");
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scanPage });
    const res = r && r.result ? r.result : { assets: [] };
    state.pageHost = res.pageHost || "page";
    state.assets = dedupe((res.assets || []).map((a, i) => ({
      ...a,
      id: a.id || hash(a.url + i),
      format: norm(a.format || fmt(a.url)),
      tag: tag(a.width, a.height),
      pageHost: state.pageHost
    })));
    status(`${state.assets.length} images · ${state.pageHost}`);
    renderAll();
  } catch (e) {
    status("扫描失败");
    $.grid.innerHTML = `<div class="empty-state"><h3>不能扫描这个页面</h3><p>${esc(e.message || String(e))}</p></div>`;
  } finally {
    state.scanning = false;
  }
}

function renderAll() { renderTabs(); renderUsage(); renderGrid(); buttons(); }

function renderTabs() {
  const c = { ALL: state.assets.length };
  state.assets.forEach(a => c[a.format] = (c[a.format] || 0) + 1);
  $.formatTabs.innerHTML = "";
  FORMATS.forEach(f => {
    if (f !== "ALL" && !c[f]) return;
    const b = document.createElement("button");
    b.className = "tab" + (state.filter === f ? " active" : "");
    b.textContent = (f === "ALL" ? "All" : f) + ` (${c[f] || 0})`;
    b.onclick = () => { state.filter = f; renderAll(); };
    $.formatTabs.appendChild(b);
  });
}

function renderGrid() {
  const v = visible();
  $.grid.innerHTML = "";
  if (!v.length) {
    const isWechat = /(^|\.)mp\.weixin\.qq\.com$/.test(state.pageHost);
    $.grid.innerHTML = isWechat
      ? '<div class="empty-state"><h3>没有匹配图片</h3><p>这篇微信文章当前可见内容可能是纯文字，或图片还没懒加载。先向下滚到有图片的位置，再点右上角刷新。</p></div>'
      : '<div class="empty-state"><h3>没有匹配图片</h3><p>调低 Min size，或切换 All / JPG / PNG 试试。</p></div>';
    return;
  }
  v.forEach(a => {
    const card = document.createElement("article");
    card.className = "card" + (state.selected.has(a.id) ? " selected" : "");
    const img = document.createElement("img");
    img.src = a.url;
    img.alt = `${a.width || "?"} × ${a.height || "?"}`;
    img.loading = "lazy";
    img.onerror = () => { img.remove(); card.style.background = "linear-gradient(135deg,#cbd5e1,#94a3b8)"; };
    const ck = document.createElement("button");
    ck.className = "check";
    ck.textContent = state.selected.has(a.id) ? "✓" : "";
    ck.onclick = e => { e.stopPropagation(); toggle(a.id); };
    const dl = document.createElement("button");
    dl.className = "download-one";
    dl.textContent = "⇩";
    dl.onclick = e => { e.stopPropagation(); download([a]); };
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<div><strong>${a.width && a.height ? `${a.width} × ${a.height}` : "unknown"}</strong><span class="tag">${a.tag}</span></div><span class="badge">${a.format}</span>`;
    card.onclick = () => toggle(a.id);
    card.append(img, ck, dl, meta);
    $.grid.appendChild(card);
  });
}

function renderUsage() {
  const trial = state.trialUntil > Date.now();
  if (trial) {
    const h = Math.max(1, Math.ceil((state.trialUntil - Date.now()) / 36e5));
    $.usageBar.innerHTML = `<div class="usage-chip"><span>试用中 · 约 ${h} 小时后结束</span><button id="upgradeInlineBtn">升级</button></div>`;
  } else {
    const left = Math.max(0, FREE_DAILY_LIMIT - state.usage.count);
    $.usageBar.innerHTML = `<div class="usage-chip"><span>免费额度：今日剩余 ${left}/${FREE_DAILY_LIMIT} 张</span><button id="upgradeInlineBtn">解锁</button></div>`;
  }
  const b = document.getElementById("upgradeInlineBtn");
  if (b) b.onclick = showPaywall;
}

function buttons() {
  const v = visible(), n = state.selected.size;
  $.selectVisibleBtn.disabled = !v.length;
  $.downloadSelectedBtn.disabled = !n;
  $.downloadSelectedBtn.textContent = n ? `下载选中 ${n}` : "下载选中";
  $.downloadVisibleBtn.disabled = !v.length;
}

function visible() {
  return state.assets.filter(a => (state.filter === "ALL" || a.format === state.filter) && (!a.width || !a.height || Math.min(a.width, a.height) >= state.minSize));
}

function toggle(id) { state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id); renderGrid(); buttons(); }
function selectVisible() { const v = visible(), all = v.every(a => state.selected.has(a.id)); v.forEach(a => all ? state.selected.delete(a.id) : state.selected.add(a.id)); renderGrid(); buttons(); }

async function download(assets, opt = {}) {
  if (!assets.length) return toast("没有可下载的图片。");
  if (!opt.bypass && !(await allow(assets))) { state.pending = assets; return showPaywall(); }
  try {
    const r = await chrome.runtime.sendMessage({ type: MESSAGE_DOWNLOAD_MANY, assets, folder: "ImageHunter" });
    if (!r || !r.ok) throw new Error(r && r.error ? r.error : "下载失败");
    if (!trial() && !opt.bypass) { state.usage.count += r.downloaded; await saveState(); }
    renderUsage();
    toast(`已提交下载 ${r.downloaded} 张${r.failed ? `，失败 ${r.failed} 张` : ""}。`);
  } catch (e) { toast(e.message || String(e)); }
}

async function allow(a) {
  if (trial()) return true;
  if (a.length > FREE_BATCH_LIMIT) return false;
  if (state.usage.date !== today()) state.usage = { date: today(), count: 0 };
  return state.usage.count + a.length <= FREE_DAILY_LIMIT;
}

function showPaywall() { $.paywall.classList.remove("hidden"); }
function hidePaywall() { $.paywall.classList.add("hidden"); }
function status(t) { $.pageStatus.textContent = t; }
function trial() { return state.trialUntil > Date.now(); }
function today() { return new Date().toISOString().slice(0, 10); }
let tt;
function toast(t) { clearTimeout(tt); $.toast.textContent = t; $.toast.classList.remove("hidden"); tt = setTimeout(() => $.toast.classList.add("hidden"), 3300); }
function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function norm(f) { f = String(f || "OTHER").toUpperCase(); if (f === "JPEG") return "JPG"; return ["JPG", "PNG", "WEBP", "SVG", "GIF", "AVIF"].includes(f) ? f : "OTHER"; }
function fmt(u) { const s = String(u || ""); const d = s.match(/^data:image\/([^;,]+)/i); if (d) return d[1]; try { const x = new URL(s); const wx = x.searchParams.get("wx_fmt") || x.searchParams.get("tp"); if (wx) return wx.replace("image/", ""); } catch {} const m = s.split("?")[0].split("#")[0].match(/\.([a-z0-9]{2,5})$/i); return m ? m[1] : "OTHER"; }
function tag(w, h) { w = +w || 0; h = +h || 0; if (!w || !h) return "asset"; const r = w / h; if (Math.abs(r - 1) < .08 && w >= 128) return "icon"; if (r >= 1.65 && w >= 900) return "banner"; if (r <= .62 && h >= 900) return "splash"; if (r >= 1.25) return "landscape"; if (r <= .82) return "portrait"; return "asset"; }
function hash(s) { let h = 2166136261; String(s).split("").forEach(ch => { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }); return "ih_" + (h >>> 0).toString(36); }
function dedupe(a) { const s = new Set(); return a.filter(x => x.url && !s.has(x.url) && s.add(x.url)); }

function scanPage() {
  const pageHost = location.hostname.replace(/^www\./, "") || "page";
  const out = [];
  const imageAttrNames = ["src", "currentSrc", "href", "data-src", "data-original", "data-lazy", "data-url", "data-image", "data-bg", "data-backsrc", "data-croporisrc", "data-actualsrc", "data-imgurl", "data-img-src", "data-cover"];

  const localFormat = (value) => {
    const s = String(value || "");
    const data = s.match(/^data:image\/([^;,]+)/i);
    if (data) return data[1].toLowerCase();
    try {
      const u = new URL(s, document.baseURI);
      const wxFmt = u.searchParams.get("wx_fmt") || u.searchParams.get("tp");
      if (wxFmt) return wxFmt.replace("image/", "").toLowerCase();
    } catch {}
    const ext = s.split("?")[0].split("#")[0].match(/\.([a-z0-9]{2,5})$/i);
    return ext ? ext[1].toLowerCase() : "OTHER";
  };

  const abs = (u) => {
    u = String(u || "").trim();
    if (!u) return null;
    if (u.startsWith("//")) u = location.protocol + u;
    if (/^data:image\//i.test(u)) return u;
    if (/^blob:/i.test(u)) return null;
    try {
      const x = new URL(u, document.baseURI).href;
      return /^https?:\/\//i.test(x) ? x : null;
    } catch { return null; }
  };

  const looksLikeImage = (url) => {
    const s = String(url || "");
    return /^data:image\//i.test(s) || /\.(jpg|jpeg|png|webp|gif|svg|avif|bmp|ico)(\?|#|$)/i.test(s) || /mmbiz\.qpic\.cn/i.test(s) || /wx_fmt=(jpg|jpeg|png|webp|gif|bmp)/i.test(s);
  };

  const srcset = (s) => String(s || "").split(",").map(p => p.trim().split(/\s+/)[0]).filter(Boolean);

  const add = (url, source, el) => {
    url = abs(url);
    if (!url || (!looksLikeImage(url) && source !== "img" && source !== "css" && source !== "meta")) return;
    const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : {};
    const width = Math.round(Number(el && (el.naturalWidth || el.getAttribute && (el.getAttribute("data-w") || el.getAttribute("width")))) || r.width || 0);
    const height = Math.round(Number(el && (el.naturalHeight || el.getAttribute && (el.getAttribute("data-h") || el.getAttribute("height")))) || r.height || 0);
    out.push({ url, source, width, height, format: localFormat(url) });
  };

  document.querySelectorAll("img").forEach(img => {
    add(img.currentSrc || img.src, "img", img);
    srcset(img.getAttribute("srcset")).forEach(u => add(u, "srcset", img));
    imageAttrNames.forEach(k => add(img.getAttribute(k), "lazy", img));
  });

  document.querySelectorAll("source").forEach(s => srcset(s.getAttribute("srcset")).forEach(u => add(u, "source", s)));
  document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"],meta[itemprop="image"]').forEach(m => add(m.content, "meta", m));

  document.querySelectorAll("a[href]").forEach(a => add(a.getAttribute("href"), "link", a));

  document.querySelectorAll("svg").forEach((svg, index) => {
    try {
      const text = new XMLSerializer().serializeToString(svg);
      if (text.length < 120000) out.push({ url: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text), source: "svg", width: Math.round(svg.getBoundingClientRect().width || 0), height: Math.round(svg.getBoundingClientRect().height || 0), format: "svg" });
    } catch {}
  });

  Array.from(document.querySelectorAll("body,body *")).slice(0, 3000).forEach(el => {
    imageAttrNames.forEach(k => add(el.getAttribute && el.getAttribute(k), "attr", el));
    const styleText = (el.getAttribute && el.getAttribute("style")) || "";
    styleText.replace(/url\((?:"([^"]+)"|'([^']+)'|([^\)]+))\)/g, (_, a, b, c) => add(a || b || c, "style", el));
    try {
      const st = getComputedStyle(el);
      [st.backgroundImage, st.maskImage, st.webkitMaskImage].join(",").replace(/url\((?:"([^"]+)"|'([^']+)'|([^\)]+))\)/g, (_, a, b, c) => add(a || b || c, "css", el));
    } catch {}
  });

  const html = document.documentElement.innerHTML;
  const urlMatches = html.match(/https?:\/\/[^"'\s<>]+?(?:\.(?:jpg|jpeg|png|webp|gif|svg|avif|bmp|ico)[^"'\s<>]*)/ig) || [];
  urlMatches.slice(0, 300).forEach(u => add(u, "html", null));
  const wxMatches = html.match(/https?:\/\/mmbiz\.qpic\.cn\/[^"'\s<>]+/ig) || [];
  wxMatches.slice(0, 300).forEach(u => add(u, "wechat", null));

  return { pageHost, assets: out.slice(0, 800) };
}
