const MESSAGE_DOWNLOAD_MANY = "IH_DOWNLOAD_MANY";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== MESSAGE_DOWNLOAD_MANY) return false;

  (async () => {
    try {
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
