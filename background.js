const MESSAGE_DOWNLOAD_MANY = "IH_DOWNLOAD_MANY";
const FEEDBACK_URL = "https://img.playbox.dpdns.org/uninstall?version=0.2.8&source=extension";

setupSidePanel();
setExtensionIcon();
setupFeedbackUrl();
chrome.runtime.onInstalled.addListener(() => {
  setupSidePanel();
  setExtensionIcon();
  setupFeedbackUrl();
});
chrome.runtime.onStartup.addListener(() => {
  setupSidePanel();
  setExtensionIcon();
  setupFeedbackUrl();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== MESSAGE_DOWNLOAD_MANY) return false;

  (async () => {
    try {
      await setupSidePanel();
      await setExtensionIcon();
      setupFeedbackUrl();
      const assets = Array.isArray(message.assets) ? message.assets : [];
      const folder = sanitizePathSegment(message.folder || "ImageHunter");
      const results = [];
      const failures = [];

      for (let i = 0; i < assets.length; i += 1) {
        const asset = assets[i];
        if (!asset || !asset.url) continue;
        try {
          const filename = buildDownloadFilename(asset, i, folder);
          const downloadId = await chromeDownload({
            url: asset.url,
            filename,
            conflictAction: "uniquify",
            saveAs: false
          });
          results.push({ id: downloadId, filename });
          await sleep(80);
        } catch (error) {
          failures.push({ url: asset.url, reason: error && error.message ? error.message : String(error) });
        }
      }

      sendResponse({ ok: true, downloaded: results.length, failed: failures.length, failures });
    } catch (error) {
      sendResponse({ ok: false, error: error && error.message ? error.message : String(error) });
    }
  })();

  return true;
});

function setupFeedbackUrl() {
  try {
    chrome.runtime.setUninstallURL(FEEDBACK_URL);
  } catch (error) {
    console.warn("Image Hunter feedback URL setup skipped", error);
  }
}

async function setupSidePanel() {
  try {
    if (!chrome.sidePanel) return;
    await chrome.sidePanel.setOptions({ path: "popup.html", enabled: true });
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.warn("Image Hunter side panel setup skipped", error);
  }
}

async function setExtensionIcon() {
  try {
    if (!chrome.action || typeof OffscreenCanvas === "undefined") return;
    const imageData = {};
    [16, 32, 48, 128].forEach((size) => {
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext("2d");
      drawDownloadImageIcon(ctx, size);
      imageData[size] = ctx.getImageData(0, 0, size, size);
    });
    await chrome.action.setIcon({ imageData });
  } catch (error) {
    console.warn("Image Hunter icon update skipped", error);
  }
}

function drawDownloadImageIcon(ctx, s) {
  const r = (n) => Math.round(n * s);
  ctx.clearRect(0, 0, s, s);

  const bg = ctx.createLinearGradient(0, 0, s, s);
  bg.addColorStop(0, "#ff8a00");
  bg.addColorStop(1, "#ff2d00");
  roundRect(ctx, 0, 0, s, s, r(0.18));
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.28)";
  ctx.shadowBlur = r(0.06);
  ctx.shadowOffsetY = r(0.035);
  roundRect(ctx, r(0.10), r(0.10), r(0.80), r(0.72), r(0.12));
  ctx.fillStyle = "#fffaf3";
  ctx.fill();
  ctx.restore();

  roundRect(ctx, r(0.16), r(0.16), r(0.68), r(0.52), r(0.06));
  ctx.fillStyle = "#fff7ef";
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, r(0.16), r(0.16), r(0.68), r(0.52), r(0.06));
  ctx.clip();
  const mountain = ctx.createLinearGradient(0, r(0.28), 0, r(0.72));
  mountain.addColorStop(0, "#ff7a00");
  mountain.addColorStop(1, "#ff3d00");
  ctx.fillStyle = mountain;
  ctx.beginPath();
  ctx.moveTo(r(0.16), r(0.62));
  ctx.lineTo(r(0.36), r(0.42));
  ctx.quadraticCurveTo(r(0.40), r(0.38), r(0.44), r(0.43));
  ctx.lineTo(r(0.50), r(0.50));
  ctx.lineTo(r(0.65), r(0.31));
  ctx.quadraticCurveTo(r(0.70), r(0.25), r(0.75), r(0.32));
  ctx.lineTo(r(0.88), r(0.52));
  ctx.lineTo(r(0.88), r(0.72));
  ctx.lineTo(r(0.16), r(0.72));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffd200";
  ctx.beginPath();
  ctx.arc(r(0.34), r(0.30), r(0.075), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, r(0.035));
  ctx.lineCap = "round";
  const c = [
    [0.22, 0.24, 0.30, 0.24, 0.22, 0.32],
    [0.78, 0.24, 0.70, 0.24, 0.78, 0.32],
    [0.22, 0.62, 0.30, 0.62, 0.22, 0.54],
    [0.78, 0.62, 0.70, 0.62, 0.78, 0.54]
  ];
  c.forEach(([x1, y1, x2, y2, x3, y3]) => {
    ctx.beginPath();
    ctx.moveTo(r(x1), r(y1));
    ctx.lineTo(r(x2), r(y2));
    ctx.moveTo(r(x1), r(y1));
    ctx.lineTo(r(x3), r(y3));
    ctx.stroke();
  });

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.28)";
  ctx.shadowBlur = r(0.05);
  ctx.shadowOffsetY = r(0.025);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(r(0.50), r(0.73), r(0.21), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const arrow = ctx.createLinearGradient(0, r(0.55), 0, r(0.90));
  arrow.addColorStop(0, "#63e51a");
  arrow.addColorStop(1, "#20b600");
  ctx.fillStyle = arrow;
  ctx.beginPath();
  ctx.moveTo(r(0.46), r(0.60));
  ctx.quadraticCurveTo(r(0.46), r(0.56), r(0.50), r(0.56));
  ctx.quadraticCurveTo(r(0.54), r(0.56), r(0.54), r(0.60));
  ctx.lineTo(r(0.54), r(0.71));
  ctx.lineTo(r(0.62), r(0.71));
  ctx.quadraticCurveTo(r(0.66), r(0.71), r(0.63), r(0.75));
  ctx.lineTo(r(0.52), r(0.87));
  ctx.quadraticCurveTo(r(0.50), r(0.89), r(0.48), r(0.87));
  ctx.lineTo(r(0.37), r(0.75));
  ctx.quadraticCurveTo(r(0.34), r(0.71), r(0.38), r(0.71));
  ctx.lineTo(r(0.46), r(0.71));
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function chromeDownload(options) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (downloadId) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(downloadId);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildDownloadFilename(asset, index, folder) {
  const host = sanitizePathSegment(asset.pageHost || getHostFromUrl(asset.url) || "page");
  const width = Number(asset.width) || 0;
  const height = Number(asset.height) || 0;
  const size = width && height ? `${width}x${height}` : "unknown";
  const format = normalizeExtension(asset.format || inferFormat(asset.url));
  const role = classifyAsset(width, height);
  const serial = String(index + 1).padStart(3, "0");
  const source = sanitizePathSegment(asset.source || "image");
  return `${folder}/${host}/${serial}_${size}_${role}_${source}.${format}`;
}

function getHostFromUrl(url) {
  try {
    if (String(url).startsWith("data:")) return "inline";
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (error) {
    return "page";
  }
}

function sanitizePathSegment(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 80) || "asset";
}

function inferFormat(url) {
  const value = String(url || "");
  const dataMatch = value.match(/^data:image\/([^;,]+)/i);
  if (dataMatch) return dataMatch[1].toLowerCase();
  const clean = value.split("?")[0].split("#")[0].toLowerCase();
  const extMatch = clean.match(/\.([a-z0-9]{2,5})$/);
  return extMatch ? extMatch[1] : "jpg";
}

function normalizeExtension(format) {
  const f = String(format || "jpg").toLowerCase();
  if (f === "jpeg") return "jpg";
  if (["jpg", "png", "webp", "svg", "gif", "avif", "bmp", "ico"].includes(f)) return f;
  return "jpg";
}

function classifyAsset(width, height) {
  if (!width || !height) return "asset";
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.08 && width >= 128) return "icon";
  if (ratio >= 1.65 && width >= 900) return "banner";
  if (ratio <= 0.62 && height >= 900) return "splash";
  if (ratio >= 1.25) return "landscape";
  if (ratio <= 0.82) return "portrait";
  return "asset";
}