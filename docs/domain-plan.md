# img.playbox.dpdns.org 部署规划

## 当前方案：独立产品子域名

本项目使用 `img.playbox.dpdns.org` 作为素材猎手 Image Hunter 的独立官网与接口域名。

| 用途 | 地址 |
|---|---|
| 产品官网 | `https://img.playbox.dpdns.org` |
| 隐私政策 | `https://img.playbox.dpdns.org/privacy` |
| 用户支持 | `https://img.playbox.dpdns.org/support` |
| 会员接口 | `https://img.playbox.dpdns.org/api` |
| 支付成功页 | `https://img.playbox.dpdns.org/payment/success` |
| 支付取消页 | `https://img.playbox.dpdns.org/payment/cancel` |

## Cloudflare DNS 建议

在 `playbox.dpdns.org` 的 DNS 区域中增加：

| 类型 | 名称 | 目标 | 代理状态 | TTL |
|---|---|---|---|---|
| CNAME | `img` | Vercel 提示的 CNAME 目标 | 仅 DNS / 灰云 | 自动 |

如果 Vercel 给出专属 `*.vercel-dns-xxx.com` 目标，以 Vercel 控制台显示为准。

## Vercel 配置

1. 在 Vercel 新建项目，导入 GitHub 仓库：`wangmiao033/img.playbox.dpdns.org`。
2. Framework Preset 选择 Other。
3. Build Command 留空。
4. Output Directory 留空或使用默认。
5. 在 Settings → Domains 添加 `img.playbox.dpdns.org`。
6. 回 Cloudflare 添加 Vercel 要求的 DNS 记录。

## Chrome Web Store 可填写 URL

- Homepage URL：`https://img.playbox.dpdns.org`
- Privacy Policy URL：`https://img.playbox.dpdns.org/privacy`
- Support URL：`https://img.playbox.dpdns.org/support`
