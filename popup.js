const MESSAGE_DOWNLOAD_MANY = "IH_DOWNLOAD_MANY";
const FORMATS = ["ALL", "JPG", "PNG", "WEBP", "SVG", "GIF", "AVIF", "OTHER"];
const state = { assets: [], filter: "ALL", minSize: 10, selected: new Set(), pageHost: "page", scanning: false };
const $ = {};

document.addEventListener("DOMContentLoaded", async () => {
  cache();
  bind();
  renderUsage();
  await scan();
});

function cache() {
  ["pageStatus", "refreshBtn", "formatTabs", "minSize", "minSizeValue", "grid", "selectVisibleBtn", "downloadSelectedBtn", "downloadVisibleBtn", "usageBar", "paywall", "closePaywallBtn", "startTrialBtn", "restoreBtn", "supportLink", "toast"].forEach(id => $[id] = document.getElementById(id));
}

function bind() {
  $.refreshBtn.onclick = scan;
  $.minSize.oninput = () => {
    state.minSize = Number($.minSize.value) || 0;
    $.minSizeValue.textContent = state.minSize + "px";
    renderAll();
  };
  $.selectVisibleBtn.onclick = selectVisible;
  $.downloadSelectedBtn.onclick = () => download(state.assets.filter(a => state.selected.has(a.id)));
  $.downloadVisibleBtn.onclick = () => download(visible());
  if ($.closePaywallBtn) $.closePaywallBtn.onclick = () => $.paywall.classList.add("hidden");
  if ($.startTrialBtn) $.startTrialBtn.onclick = () => toast("测试版已开放下载，无需开通会员。");
  if ($.restoreBtn) $.restoreBtn.onclick = () => toast("测试版暂无恢复购买功能。");
  if ($.supportLink) $.supportLink.href = "https://img.playbox.dpdns.org/support";
}

async function scan() {
  if (state.scanning) return;
  state.scanning = true;
  state.assets = [];
  state.selected.clear();
  renderLoading();
  status("正在扫描当前网页…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error("没有找到当前标签页");
    if (!/^https?:\/\//i.test(tab.url || "")) throw new Error("Chrome 系统页、扩展页或本地文件页不能扫描。请打开普通网页后再试。");
    const hostFromTab = getHost(tab.url);
    let result = null;
    try {
      const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: scanImagesInPage });
      result = injection && injection.result;
    } catch (e) {
      console.warn("inject scan failed", e);
    }
    if (!result || !Array.isArray(result.assets) || result.assets.length === 0) {
      result = await scanHtmlByFetch(tab.url, hostFromTab);
    }
    state.pageHost = result.pageHost || hostFromTab || "page";
    state.assets = normalizeAssets(result.assets || [], state.pageHost);
    status(`${state.assets.length} images · ${state.pageHost}`);
    renderAll();
  } catch (e) {
    status("扫描失败");
    renderError(e && e.message ? e.message : String(e));
  } finally {
    state.scanning = false;
  }
}

async function scanHtmlByFetch(url, host) {
  try {
    const res = await fetch(url, { credentials: "include" });
    const html = await res.text();
    const assets = [];
    const seen = new Set();
    const add = raw => {
      const u = absolutize(raw, url);
      if (!u || seen.has(u) || !looksImage(u)) return;
      seen.add(u);
      assets.push({ url: u, source: "html", width: 0, height: 0, format: inferFormat(u) });
    };
    const attrRe = /(?:src|href|data-src|data-original|data-lazy|data-url|data-img|data-bg|data-actualsrc|data-cover)\s*=\s*["']([^"']+)["']/ig;
    let m;
    while ((m = attrRe.exec(html))) add(m[1]);
    const urlRe = /https?:\/\/[^"'\s<>]+?(?:\.(?:jpg|jpeg|png|webp|gif|svg|avif|bmp|ico)[^"'\s<>]*)/ig;
    while ((m = urlRe.exec(html))) add(m[0]);
    const wxRe = /https?:\/\/mmbiz\.qpic\.cn\/[^"'\s<>]+/ig;
    while ((m = wxRe.exec(html))) add(m[0]);
    return { pageHost: host, assets };
  } catch (e) {
    return { pageHost: host, assets: [] };
  }
}

function scanImagesInPage() {
  const pageHost = location.hostname.replace(/^www\./, "") || "page";
  const pageUrl = location.href;
  const assets = [];
  const seen = new Set();
  const attrs = ["src", "currentSrc", "href", "data-src", "data-original", "data-lazy", "data-url", "data-image", "data-img", "data-bg", "data-background", "data-actualsrc", "data-cover", "data-croporisrc", "data-img-src"];
  function abs(raw) {
    let v = String(raw || "").trim();
    if (!v || v === "none") return null;
    if (v.startsWith("//")) v = location.protocol + v;
    if (/^data:image\//i.test(v)) return v;
    if (/^blob:/i.test(v)) return null;
    try {
      const u = new URL(v, document.baseURI || location.href).href;
      return /^https?:\/\//i.test(u) ? u : null;
    } catch { return null; }
  }
  function isImg(url) {
    const s = String(url || "");
    return /^data:image\//i.test(s) || /\.(jpg|jpeg|png|webp|gif|svg|avif|bmp|ico)(\?|#|$)/i.test(s) || /mmbiz\.qpic\.cn/i.test(s) || /wx_fmt=(jpg|jpeg|png|webp|gif|bmp)/i.test(s) || /imageMogr2/i.test(s);
  }
  function fmt(url) {
    const s = String(url || "");
    const d = s.match(/^data:image\/([^;,]+)/i);
    if (d) return d[1].toLowerCase();
    try {
      const u = new URL(s, location.href);
      const wx = u.searchParams.get("wx_fmt") || u.searchParams.get("tp");
      if (wx) return wx.replace("image/", "").toLowerCase();
    } catch {}
    const m = s.split("?")[0].split("#")[0].match(/\.([a-z0-9]{2,5})$/i);
    return m ? m[1].toLowerCase() : "OTHER";
  }
  function add(raw, source, el) {
    const url = abs(raw);
    if (!url || !isImg(url) || seen.has(url)) return;
    seen.add(url);
    const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    const width = Math.round(Number((el && (el.naturalWidth || el.getAttribute && (el.getAttribute("data-w") || el.getAttribute("width")))) || (rect && rect.width) || 0));
    const height = Math.round(Number((el && (el.naturalHeight || el.getAttribute && (el.getAttribute("data-h") || el.getAttribute("height")))) || (rect && rect.height) || 0));
    assets.push({ url, source, width, height, format: fmt(url) });
  }
  function srcset(v) {
    return String(v || "").split(",").map(p => p.trim().split(/\s+/)[0]).filter(Boolean);
  }
  document.querySelectorAll("img").forEach(img => {
    add(img.currentSrc || img.src, "img", img);
    attrs.forEach(a => add(img.getAttribute && img.getAttribute(a), "attr", img));
    srcset(img.getAttribute && img.getAttribute("srcset")).forEach(u => add(u, "srcset", img));
    Array.from(img.attributes || []).forEach(a => /^data-/i.test(a.name) && add(a.value, "data", img));
  });
  document.querySelectorAll("source").forEach(s => srcset(s.getAttribute("srcset")).forEach(u => add(u, "source", s)));
  document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"],meta[itemprop="image"]').forEach(m => add(m.getAttribute("content"), "meta", null));
  document.querySelectorAll("a[href]").forEach(a => add(a.getAttribute("href"), "link", a));
  Array.from(document.querySelectorAll("body, body *")).slice(0, 3000).forEach(el => {
    attrs.forEach(a => add(el.getAttribute && el.getAttribute(a), "attr", el));
    const styleText = (el.getAttribute && el.getAttribute("style")) || "";
    styleText.replace(/url\((?:"([^"]+)"|'([^']+)'|([^\)]+))\)/g, (_, a, b, c) => add(a || b || c, "style", el));
    try {
      const st = getComputedStyle(el);
      [st.backgroundImage, st.maskImage, st.webkitMaskImage, st.borderImageSource].join(",").replace(/url\((?:"([^"]+)"|'([^']+)'|([^\)]+))\)/g, (_, a, b, c) => add(a || b || c, "css", el));
    } catch {}
  });
  const html = document.documentElement.innerHTML;
  (html.match(/https?:\/\/[^"'\s<>]+?(?:\.(?:jpg|jpeg|png|webp|gif|svg|avif|bmp|ico)[^"'\s<>]*)/ig) || []).slice(0, 500).forEach(u => add(u, "html", null));
  (html.match(/https?:\/\/mmbiz\.qpic\.cn\/[^"'\s<>]+/ig) || []).slice(0, 500).forEach(u => add(u, "wechat", null));
  return { pageHost, pageUrl, assets: assets.slice(0, 800) };
}

function normalizeAssets(items, host) {
  return dedupe((items || []).map((a, i) => ({
    url: a.url,
    source: a.source || "image",
    width: Number(a.width || 0),
    height: Number(a.height || 0),
    pageHost: host,
    id: hash((a.url || "") + i),
    format: norm(a.format || inferFormat(a.url)),
    tag: classify(Number(a.width || 0), Number(a.height || 0))
  })));
}

function renderAll() { renderTabs(); renderUsage(); renderGrid(); buttons(); }
function renderLoading() { $.grid.innerHTML = '<div class="empty-state"><h3>扫描中…</h3><p>正在读取当前网页图片。</p></div>'; }
function renderError(msg) { $.grid.innerHTML = `<div class="empty-state"><h3>无法扫描</h3><p>${escapeHtml(msg)}</p></div>`; }
function renderTabs() {
  const count = { ALL: state.assets.length };
  state.assets.forEach(a => count[a.format] = (count[a.format] || 0) + 1);
  $.formatTabs.innerHTML = "";
  FORMATS.forEach(f => {
    if (f !== "ALL" && !count[f]) return;
    const b = document.createElement("button");
    b.className = "tab" + (state.filter === f ? " active" : "");
    b.textContent = `${f === "ALL" ? "All" : f} (${count[f] || 0})`;
    b.onclick = () => { state.filter = f; renderAll(); };
    $.formatTabs.appendChild(b);
  });
}
function renderUsage() {
  $.usageBar.innerHTML = '<div class="usage-chip"><span>测试版：批量下载功能开放</span><button id="upgradeInlineBtn">帮助</button></div>';
  const b = document.getElementById("upgradeInlineBtn");
  if (b) b.onclick = () => toast("如果显示 0，先刷新页面，再点插件右上角刷新。");
}
function renderGrid() {
  const list = visible();
  $.grid.innerHTML = "";
  if (!list.length) {
    $.grid.innerHTML = '<div class="empty-state"><h3>没有匹配图片</h3><p>先确认已安装最新版 0.2.3。再试：刷新网页、向下滚到图片位置、点击插件右上角刷新。</p></div>';
    return;
  }
  list.forEach(a => {
    const card = document.createElement("article");
    card.className = "card" + (state.selected.has(a.id) ? " selected" : "");
    const img = document.createElement("img");
    img.src = a.url;
    img.alt = `${a.width || "?"} × ${a.height || "?"}`;
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
function visible() { return state.assets.filter(a => (state.filter === "ALL" || a.format === state.filter) && (!a.width || !a.height || Math.min(a.width, a.height) >= state.minSize)); }
function buttons() { const v = visible(), n = state.selected.size; $.selectVisibleBtn.disabled = !v.length; $.downloadVisibleBtn.disabled = !v.length; $.downloadSelectedBtn.disabled = !n; $.downloadSelectedBtn.textContent = n ? `下载选中 ${n}` : "下载选中"; }
function toggle(id) { state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id); renderGrid(); buttons(); }
function selectVisible() { const v = visible(); const all = v.every(a => state.selected.has(a.id)); v.forEach(a => all ? state.selected.delete(a.id) : state.selected.add(a.id)); renderGrid(); buttons(); }
async function download(assets) { if (!assets.length) return toast("没有可下载的图片"); const r = await chrome.runtime.sendMessage({ type: MESSAGE_DOWNLOAD_MANY, assets, folder: "ImageHunter" }); toast(r && r.ok ? `已提交下载 ${r.downloaded} 张` : "下载失败"); }
function status(t) { $.pageStatus.textContent = t; }
function getHost(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "page"; } }
function absolutize(raw, base) { let v = String(raw || "").trim(); if (!v) return null; if (v.startsWith("//")) v = "https:" + v; try { return new URL(v, base).href; } catch { return null; } }
function looksImage(u) { return /^data:image\//i.test(u) || /\.(jpg|jpeg|png|webp|gif|svg|avif|bmp|ico)(\?|#|$)/i.test(u) || /mmbiz\.qpic\.cn/i.test(u) || /wx_fmt=/i.test(u) || /imageMogr2/i.test(u); }
function inferFormat(u) { const s = String(u || ""); const d = s.match(/^data:image\/([^;,]+)/i); if (d) return d[1]; try { const x = new URL(s); const wx = x.searchParams.get("wx_fmt") || x.searchParams.get("tp"); if (wx) return wx.replace("image/", ""); } catch {} const m = s.split("?")[0].split("#")[0].match(/\.([a-z0-9]{2,5})$/i); return m ? m[1] : "OTHER"; }
function norm(f) { f = String(f || "OTHER").toUpperCase(); if (f === "JPEG") return "JPG"; return ["JPG", "PNG", "WEBP", "SVG", "GIF", "AVIF"].includes(f) ? f : "OTHER"; }
function classify(w, h) { if (!w || !h) return "asset"; const r = w / h; if (Math.abs(r - 1) < .08 && w >= 128) return "icon"; if (r >= 1.65 && w >= 900) return "banner"; if (r <= .62 && h >= 900) return "splash"; if (r >= 1.25) return "landscape"; if (r <= .82) return "portrait"; return "asset"; }
function hash(s) { let h = 2166136261; String(s).split("").forEach(ch => { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }); return "ih_" + (h >>> 0).toString(36); }
function dedupe(arr) { const seen = new Set(); return arr.filter(a => a.url && !seen.has(a.url) && seen.add(a.url)); }
function escapeHtml(t) { return String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
let toastTimer; function toast(t) { clearTimeout(toastTimer); $.toast.textContent = t; $.toast.classList.remove("hidden"); toastTimer = setTimeout(() => $.toast.classList.add("hidden"), 2800); }
