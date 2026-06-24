# 素材猎手 - Image Hunter

一个可直接加载的 Chrome Manifest V3 扩展原型：扫描当前网页图片，按格式、尺寸筛选，并支持单图/批量下载。

## 当前功能

- 扫描当前网页中的图片资源：`img`、`srcset`、`picture/source`、CSS `background-image`、`og:image`、图片链接、内联 SVG。
- 显示图片数量、缩略图、尺寸、格式、素材标签。
- 支持格式筛选：All / JPG / PNG / WEBP / SVG / GIF / AVIF / OTHER。
- 支持 Min size 滑杆过滤小图标。
- 支持单图下载、勾选批量下载、下载当前筛选结果。
- 免费额度原型：每天 20 张，单批最多 10 张；超限弹出会员弹窗。
- 会员弹窗原型：3 天本地试用，正式版需接支付与账号系统。
- 自动命名下载文件：`ImageHunter/域名/序号_尺寸_类型_来源.格式`。

## 安装测试

1. 打开 Chrome。
2. 进入 `chrome://extensions/`。
3. 打开右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择本项目文件夹：`image-hunter-extension`。
6. 打开任意普通网页，点击浏览器右上角扩展图标测试。

## 文件结构

```text
image-hunter-extension/
├── manifest.json
├── background.js
├── popup.html
├── popup.css
├── popup.js
├── assets/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── docs/
│   ├── product-roadmap.md
│   └── payment-integration.md
└── webstore/
    ├── description.md
    └── privacy-policy.md
```

## 域名规划

当前版本已切换到独立产品子域名：`img.playbox.dpdns.org`。

- 官网 / 落地页：`https://img.playbox.dpdns.org`
- 隐私政策：`https://img.playbox.dpdns.org/privacy`
- 支持页：`https://img.playbox.dpdns.org/support`
- 后端接口：`https://img.playbox.dpdns.org/api`
- 支付成功回调页：`https://img.playbox.dpdns.org/payment/success`
- 支付取消回调页：`https://img.playbox.dpdns.org/payment/cancel`

## 生产版下一步

1. 接入真实账号系统：Supabase / Firebase / 自建后端。
2. 接入支付：Stripe / Paddle / LemonSqueezy / ExtensionPay。
3. 后端校验会员状态，不要只信任本地 `chrome.storage`。
4. 增加 ZIP 打包下载、尺寸自动分组、游戏渠道尺寸识别。
5. 准备 Chrome Web Store 上架素材、隐私政策、支持邮箱。
