const MESSAGE_DOWNLOAD_MANY = "IH_DOWNLOAD_MANY";
const REMOTE_CONFIG_URL = "https://img.playbox.dpdns.org/config.json";
const FORMATS = ["ALL", "JPG", "PNG", "WEBP", "SVG", "GIF", "AVIF", "OTHER"];
const FILTER_MODES = [
  { id: "all", label: "全部", tip: "展示所有识别到的图片。" },
  { id: "content", label: "正文图", tip: "优先展示文章正文/当前游戏相关图片，过滤右侧推荐和小图标。" },
  { id: "big", label: "大图", tip: "优先展示大尺寸素材图。" },
  { id: "icon", label: "图标", tip: "展示方形图标、头像、Logo 类素材。" }
];
const DEFAULT_CONFIG = {
  version: "local",
  ui: {
    minSizeDefault: 10,
    sortBy: "area_desc",
    maxDisplayImages: 800,
    emptyTips: {
      default: "没有匹配图片。先刷新网页，再点插件右上角刷新；也可以调低 Min size。",
      wechat: "微信文章图片通常懒加载。先滚到图片位置，再点插件右上角刷新。",
      ali213: "如果只想下载本游戏图片，点「正文图」或「大图」，再点下载当前筛选。"
    }
  },
  generic: {
    maxNodes: 3600,
    maxHtmlMatches: 700,
    attributes: ["src", "currentSrc", "href", "data-src", "data-original", "data-lazy", "data-url", "data-image", "data-img", "data-bg", "data-background", "data-actualsrc", "data-cover", "data-croporisrc", "data-img-src", "data-original-src"],
    imageUrlKeywords: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif", "mmbiz.qpic.cn", "wx_fmt=", "imageMogr2"]
  },
  sites: {}
};
const state = { assets: [], filter: "ALL", mode: "all", minSize: 10, selected: new Set(), pageHost: "page", scanning: false, config: DEFAULT_CONFIG, siteRule: null };
const $ = {};

document.addEventListener("DOMContentLoaded", async () => {
  cache();
  injectQuickFilterStyles();
  createQuickFilters();
  bind();
  state.config = await loadRemoteConfig();
  state.minSize = Number(state.config?.ui?.minSizeDefault || 10);
  if ($.minSize) $.minSize.value = state.minSize;
  if ($.minSizeValue) $.minSizeValue.textContent = state.minSize + "px";
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

function injectQuickFilterStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .quick-filter-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:10px}
    .quick-filter-btn{border:0;border-radius:999px;padding:7px 6px;background:#c7ced9;color:#4f5c6d;font-size:12px;font-weight:700;white-space:nowrap}
    .quick-filter-btn.active{background:#e8f1ff;color:#1677ff;box-shadow:0 0 0 1px rgba(22,119,255,.14) inset}
    .mode-note{margin-top:7px;color:#64748b;font-size:11px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  `;
  document.head.appendChild(style);
}

function createQuickFilters() {
  const panel = document.querySelector(".filter-panel");
  if (!panel || document.getElementById("quickFilterRow")) return;
  const row = document.createElement("div");
  row.id = "quickFilterRow";
  row.className = "quick-filter-row";
  FILTER_MODES.forEach(mode => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quick-filter-btn";
    btn.dataset.mode = mode.id;
    btn.textContent = mode.label;
    btn.onclick = () => {
      state.mode = mode.id;
      if (mode.id === "big" && state.minSize < 180) setMinSize(180);
      renderAll();
      toast(mode.tip);
    };
    row.appendChild(btn);
  });
  const note = document.createElement("div");
  note.id = "modeNote";
  note.className = "mode-note";
  panel.appendChild(row);
  panel.appendChild(note);
}

function setMinSize(value) {
  state.minSize = value;
  if ($.minSize) $.minSize.value = value;
  if ($.minSizeValue) $.minSizeValue.textContent = value + "px";
}

async function loadRemoteConfig() {
  try {
    const res = await fetch(REMOTE_CONFIG_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("config http " + res.status);
    const remote = await res.json();
    return mergeConfig(DEFAULT_CONFIG, remote);
  } catch (error) {
    console.warn("Image Hunter config fallback", error);
    return DEFAULT_CONFIG;
  }
}

function mergeConfig(base, remote) {
  return {
    ...base,
    ...remote,
    ui: { ...(base.ui || {}), ...((remote && remote.ui) || {}) },
    generic: { ...(base.generic || {}), ...((remote && remote.generic) || {}) },
    sites: { ...(base.sites || {}), ...((remote && remote.sites) || {}) }
  };
}

async function scan() {
  if (state.scanning) return;
  state.scanning = true;
  state.assets = [];
  state.selected.clear();
  renderLoading();
  status("正在扫描当前网页…");
  try {
    state.config = await loadRemoteConfig();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error("没有找到当前标签页");
    if (!/^https?:\/\//i.test(tab.url || "")) throw new Error("Chrome 系统页、扩展页或本地文件页不能扫描。请打开普通网页后再试。");
    const hostFromTab = getHost(tab.url);
    state.siteRule = getSiteRule(hostFromTab, state.config);
    applySiteDefaults();

    let result = null;
    try {
      const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: scanImagesInPage, args: [state.config, hostFromTab] });
      result = injection && injection.result;
    } catch (e) {
      console.warn("inject scan failed", e);
    }
    if (!result || !Array.isArray(result.assets) || result.assets.length === 0) {
      result = await scanHtmlByFetch(tab.url, hostFromTab, state.config);
    }
    state.pageHost = result.pageHost || hostFromTab || "page";
    state.siteRule = getSiteRule(state.pageHost, state.config);
    state.assets = normalizeAssets(result.assets || [], state.pageHost);
    sortAssets();
    status(`${state.assets.length} images · ${state.pageHost}`);
    renderAll();
  } catch (e) {
    status("扫描失败");
    renderError(e && e.message ? e.message : String(e));
  } finally {
    state.scanning = false;
  }
}

function applySiteDefaults() {
  const next = Number(state.siteRule?.minSizeDefault || state.config?.ui?.minSizeDefault || 10);
  if (Number.isFinite(next) && next !== state.minSize) setMinSize(next);
}

async function scanHtmlByFetch(url, host, config) {
  try {
    const res = await fetch(url, { credentials: "include" });
    const html = await res.text();
    const assets = [];
    const seen = new Set();
    const rule = getSiteRule(host, config);
    const genericAttrs = config?.generic?.attributes || DEFAULT_CONFIG.generic.attributes;
    const attrs = unique([...(genericAttrs || []), ...((rule && rule.extraAttributes) || [])]);
    const add = raw => {
      const u = absolutize(raw, url);
      if (!u || seen.has(u) || !looksImage(u, config, rule)) return;
      seen.add(u);
      assets.push({ url: u, source: "html", width: 0, height: 0, format: inferFormat(u), context: "html", score: 1 });
    };
    const attrRe = new RegExp(`(?:${attrs.map(escapeRegex).join("|")})\\s*=\\s*["']([^"']+)["']`, "ig");
    let m;
    while ((m = attrRe.exec(html))) add(m[1]);
    const max = Number(config?.generic?.maxHtmlMatches || 700);
    const urlRe = /https?:\/\/[^"'\s<>]+?(?:\.(?:jpg|jpeg|png|webp|gif|svg|avif|bmp|ico)[^"'\s<>]*)/ig;
    let n = 0;
    while ((m = urlRe.exec(html)) && n++ < max) add(m[0]);
    const wxRe = /https?:\/\/mmbiz\.qpic\.cn\/[^"'\s<>]+/ig;
    n = 0;
    while ((m = wxRe.exec(html)) && n++ < max) add(m[0]);
    return { pageHost: host, assets };
  } catch (e) {
    return { pageHost: host, assets: [] };
  }
}

function scanImagesInPage(config, hostFromTab) {
  const pageHost = location.hostname.replace(/^www\./, "") || hostFromTab || "page";
  const assets = [];
  const seen = new Set();
  const defaultAttrs = ["src", "currentSrc", "href", "data-src", "data-original", "data-lazy", "data-url", "data-image", "data-img", "data-bg", "data-background", "data-actualsrc", "data-cover", "data-croporisrc", "data-img-src", "data-original-src"];
  const rule = findRule(pageHost, config);
  const attrs = uniqueLocal([...(config?.generic?.attributes || defaultAttrs), ...((rule && rule.extraAttributes) || [])]);
  const maxNodes = Number(config?.generic?.maxNodes || 3600);
  const selectors = rule && Array.isArray(rule.selectors) ? rule.selectors : ["img"];
  const contentHints = (rule && rule.contentHints) || ["article", "content", "main", "detail", "text", "body", "post", "entry", "rich_media_content", "js_content"];
  const excludeHints = (rule && rule.excludeHints) || ["side", "right", "rank", "hot", "recommend", "footer", "header", "nav", "menu", "search", "login", "app", "ad", "广告"];

  function findRule(host, cfg) {
    const rules = (cfg && cfg.sites) || {};
    const keys = Object.keys(rules);
    return rules[host] || keys.map(k => host === k || host.endsWith("." + k) ? rules[k] : null).find(Boolean) || null;
  }
  function uniqueLocal(arr) { return Array.from(new Set((arr || []).filter(Boolean))); }
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
    if (/^data:image\//i.test(s) || /\.(jpg|jpeg|png|webp|gif|svg|avif|bmp|ico)(\?|#|$)/i.test(s) || /mmbiz\.qpic\.cn/i.test(s) || /wx_fmt=/i.test(s) || /imageMogr2/i.test(s)) return true;
    const keywords = [ ...((config?.generic?.imageUrlKeywords) || []), ...((rule && rule.imageUrlKeywords) || []) ];
    return keywords.some(k => k && s.toLowerCase().includes(String(k).toLowerCase()));
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
  function contextOf(el) {
    let node = el;
    let score = 0;
    let ctx = "page";
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 8) {
      const label = `${node.tagName || ""} ${node.id || ""} ${node.className || ""}`.toLowerCase();
      if (excludeHints.some(k => label.includes(String(k).toLowerCase()))) {
        ctx = "side";
        score -= 4;
      }
      if (contentHints.some(k => label.includes(String(k).toLowerCase()))) {
        ctx = "content";
        score += 6;
      }
      if (["ARTICLE", "MAIN"].includes(node.tagName)) {
        ctx = "content";
        score += 6;
      }
      node = node.parentElement;
      depth += 1;
    }
    return { context: ctx, score };
  }
  function add(raw, source, el) {
    const url = abs(raw);
    if (!url || !isImg(url) || seen.has(url)) return;
    seen.add(url);
    const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    const width = Math.round(Number((el && (el.naturalWidth || el.getAttribute && (el.getAttribute("data-w") || el.getAttribute("width")))) || (rect && rect.width) || 0));
    const height = Math.round(Number((el && (el.naturalHeight || el.getAttribute && (el.getAttribute("data-h") || el.getAttribute("height")))) || (rect && rect.height) || 0));
    const ctx = contextOf(el);
    const area = width * height;
    const score = ctx.score + (area >= 120000 ? 4 : area >= 40000 ? 2 : 0) + (source === "selector" ? 2 : 0);
    assets.push({ url, source, width, height, format: fmt(url), context: ctx.context, score });
  }
  function srcset(v) { return String(v || "").split(",").map(p => p.trim().split(/\s+/)[0]).filter(Boolean); }

  selectors.forEach(sel => { try { document.querySelectorAll(sel).forEach(img => add(img.currentSrc || img.src || img.getAttribute("src"), "selector", img)); } catch {} });
  document.querySelectorAll("img").forEach(img => {
    add(img.currentSrc || img.src, "img", img);
    attrs.forEach(a => add(img.getAttribute && img.getAttribute(a), "attr", img));
    srcset(img.getAttribute && img.getAttribute("srcset")).forEach(u => add(u, "srcset", img));
    Array.from(img.attributes || []).forEach(a => /^data-/i.test(a.name) && add(a.value, "data", img));
  });
  document.querySelectorAll("source").forEach(s => srcset(s.getAttribute("srcset")).forEach(u => add(u, "source", s)));
  document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"],meta[itemprop="image"]').forEach(m => add(m.getAttribute("content"), "meta", null));
  document.querySelectorAll("a[href]").forEach(a => add(a.getAttribute("href"), "link", a));
  Array.from(document.querySelectorAll("body, body *")).slice(0, maxNodes).forEach(el => {
    attrs.forEach(a => add(el.getAttribute && el.getAttribute(a), "attr", el));
    const styleText = (el.getAttribute && el.getAttribute("style")) || "";
    styleText.replace(/url\((?:"([^"]+)"|'([^']+)'|([^\)]+))\)/g, (_, a, b, c) => add(a || b || c, "style", el));
    try {
      const st = getComputedStyle(el);
      [st.backgroundImage, st.maskImage, st.webkitMaskImage, st.borderImageSource].join(",").replace(/url\((?:"([^"]+)"|'([^']+)'|([^\)]+))\)/g, (_, a, b, c) => add(a || b || c, "css", el));
    } catch {}
  });
  const html = document.documentElement.innerHTML;
  const max = Number(config?.generic?.maxHtmlMatches || 700);
  (html.match(/https?:\/\/[^"'\s<>]+?(?:\.(?:jpg|jpeg|png|webp|gif|svg|avif|bmp|ico)[^"'\s<>]*)/ig) || []).slice(0, max).forEach(u => add(u, "html", null));
  (html.match(/https?:\/\/mmbiz\.qpic\.cn\/[^"'\s<>]+/ig) || []).slice(0, max).forEach(u => add(u, "wechat", null));
  return { pageHost, pageUrl: location.href, assets: assets.slice(0, Number(config?.ui?.maxDisplayImages || 800)) };
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
    tag: classify(Number(a.width || 0), Number(a.height || 0)),
    context: a.context || "page",
    score: Number(a.score || 0)
  })));
}

function sortAssets() {
  const mode = state.siteRule?.sortBy || state.config?.ui?.sortBy || "area_desc";
  if (mode === "area_desc") state.assets.sort((a, b) => (b.score - a.score) || (((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))));
}

function renderAll() { renderTabs(); renderUsage(); renderGrid(); buttons(); renderQuickFilters(); }
function renderLoading() { $.grid.innerHTML = '<div class="empty-state"><h3>扫描中…</h3><p>正在读取当前网页图片和云端规则。</p></div>'; }
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
function renderQuickFilters() {
  document.querySelectorAll(".quick-filter-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.mode === state.mode));
  const note = document.getElementById("modeNote");
  if (note) note.textContent = FILTER_MODES.find(m => m.id === state.mode)?.tip || "";
}
function renderUsage() {
  const version = state.config?.version || "local";
  const siteTip = state.siteRule?.tips || "配置热更已开启。改 config.json 后，点右上角刷新即可生效。";
  $.usageBar.innerHTML = `<div class="usage-chip"><span>配置：${escapeHtml(version)}</span><button id="upgradeInlineBtn">帮助</button></div>`;
  const b = document.getElementById("upgradeInlineBtn");
  if (b) b.onclick = () => toast(siteTip);
}
function renderGrid() {
  const list = visible();
  $.grid.innerHTML = "";
  if (!list.length) {
    const tip = getEmptyTip();
    $.grid.innerHTML = `<div class="empty-state"><h3>没有匹配图片</h3><p>${escapeHtml(tip)}</p></div>`;
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
    meta.innerHTML = `<div><strong>${a.width && a.height ? `${a.width} × ${a.height}` : "unknown"}</strong><span class="tag">${a.context === "content" ? "正文" : a.tag}</span></div><span class="badge">${a.format}</span>`;
    card.onclick = () => toggle(a.id);
    card.append(img, ck, dl, meta);
    $.grid.appendChild(card);
  });
}
function getEmptyTip() {
  const tips = state.config?.ui?.emptyTips || {};
  if (/mp\.weixin\.qq\.com$/.test(state.pageHost)) return tips.wechat || tips.default || "没有匹配图片";
  if (/ali213\.net$/.test(state.pageHost)) return tips.ali213 || tips.default || "没有匹配图片";
  return tips.default || "没有匹配图片";
}
function visible() {
  return state.assets.filter(a => {
    const area = (a.width || 0) * (a.height || 0);
    const passesFormat = state.filter === "ALL" || a.format === state.filter;
    const passesSize = !a.width || !a.height || Math.min(a.width, a.height) >= state.minSize;
    const passesMode = state.mode === "all"
      || (state.mode === "content" && (a.context === "content" || a.score >= 5) && !isSmallIcon(a))
      || (state.mode === "big" && (area >= 80000 || a.width >= 500 || a.height >= 500) && !isSmallIcon(a))
      || (state.mode === "icon" && isIconLike(a));
    return passesFormat && passesSize && passesMode;
  });
}
function isSmallIcon(a) { const area = (a.width || 0) * (a.height || 0); const ratio = a.width && a.height ? a.width / a.height : 1; return area > 0 && area <= 45000 && Math.abs(ratio - 1) < 0.25; }
function isIconLike(a) { const ratio = a.width && a.height ? a.width / a.height : 1; return a.tag === "icon" || (a.width >= 64 && a.height >= 64 && Math.abs(ratio - 1) < 0.18 && Math.max(a.width, a.height) <= 600); }
function buttons() { const v = visible(), n = state.selected.size; $.selectVisibleBtn.disabled = !v.length; $.downloadVisibleBtn.disabled = !v.length; $.downloadSelectedBtn.disabled = !n; $.downloadSelectedBtn.textContent = n ? `下载选中 ${n}` : "下载选中"; }
function toggle(id) { state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id); renderGrid(); buttons(); }
function selectVisible() { const v = visible(); const all = v.every(a => state.selected.has(a.id)); v.forEach(a => all ? state.selected.delete(a.id) : state.selected.add(a.id)); renderGrid(); buttons(); }
async function download(assets) { if (!assets.length) return toast("没有可下载的图片"); const r = await chrome.runtime.sendMessage({ type: MESSAGE_DOWNLOAD_MANY, assets, folder: "ImageHunter" }); toast(r && r.ok ? `已提交下载 ${r.downloaded} 张` : "下载失败"); }
function getSiteRule(host, config) { const rules = config?.sites || {}; const keys = Object.keys(rules); return rules[host] || keys.map(k => host === k || host.endsWith("." + k) ? rules[k] : null).find(Boolean) || null; }
function status(t) { $.pageStatus.textContent = t; }
function getHost(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "page"; } }
function absolutize(raw, base) { let v = String(raw || "").trim(); if (!v) return null; if (v.startsWith("//")) v = "https:" + v; try { return new URL(v, base).href; } catch { return null; } }
function looksImage(u, config, rule) { const s = String(u || ""); if (/^data:image\//i.test(s) || /\.(jpg|jpeg|png|webp|gif|svg|avif|bmp|ico)(\?|#|$)/i.test(s) || /mmbiz\.qpic\.cn/i.test(s) || /wx_fmt=/i.test(s) || /imageMogr2/i.test(s)) return true; const keywords = [...((config?.generic?.imageUrlKeywords) || []), ...((rule?.imageUrlKeywords) || [])]; return keywords.some(k => k && s.toLowerCase().includes(String(k).toLowerCase())); }
function inferFormat(u) { const s = String(u || ""); const d = s.match(/^data:image\/([^;,]+)/i); if (d) return d[1]; try { const x = new URL(s); const wx = x.searchParams.get("wx_fmt") || x.searchParams.get("tp"); if (wx) return wx.replace("image/", ""); } catch {} const m = s.split("?")[0].split("#")[0].match(/\.([a-z0-9]{2,5})$/i); return m ? m[1] : "OTHER"; }
function norm(f) { f = String(f || "OTHER").toUpperCase(); if (f === "JPEG") return "JPG"; return ["JPG", "PNG", "WEBP", "SVG", "GIF", "AVIF"].includes(f) ? f : "OTHER"; }
function classify(w, h) { if (!w || !h) return "asset"; const r = w / h; if (Math.abs(r - 1) < .08 && w >= 128) return "icon"; if (r >= 1.65 && w >= 900) return "banner"; if (r <= .62 && h >= 900) return "splash"; if (r >= 1.25) return "landscape"; if (r <= .82) return "portrait"; return "asset"; }
function hash(s) { let h = 2166136261; String(s).split("").forEach(ch => { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }); return "ih_" + (h >>> 0).toString(36); }
function dedupe(arr) { const seen = new Set(); return arr.filter(a => a.url && !seen.has(a.url) && seen.add(a.url)); }
function unique(arr) { return Array.from(new Set((arr || []).filter(Boolean))); }
function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function escapeHtml(t) { return String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
let toastTimer; function toast(t) { clearTimeout(toastTimer); $.toast.textContent = t; $.toast.classList.remove("hidden"); toastTimer = setTimeout(() => $.toast.classList.add("hidden"), 2800); }