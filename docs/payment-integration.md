# 付费接入方案

当前版本的会员弹窗只是本地原型，不是真实扣费。

## 推荐方案

### 方案 A：ExtensionPay

适合 Chrome 扩展快速接订阅。优点是开发快，缺点是定制能力较弱。

需要改造：

- popup 中点击试用 / 购买时调用 ExtensionPay。
- 登录状态、会员状态由 ExtensionPay 返回。
- 本地只做缓存，不作为最终会员判断。

### 方案 B：Stripe + Supabase

适合做长期产品。优点是可控，缺点是开发量更大。

需要模块：

- Supabase Auth：邮箱 / Google 登录
- Stripe Checkout：月付、年付、买断
- Webhook：接收支付成功、订阅取消、退款
- Membership API：扩展查询会员状态
- chrome.storage.local：缓存用户 token 和会员状态

### 方案 C：Paddle / LemonSqueezy

适合面向海外用户，税务和支付处理更省心。逻辑与 Stripe 类似。

## 权限与安全

- 扩展端不要存储支付密钥。
- 会员状态必须由后端校验。
- 免费额度可以本地计数，但付费权限不能只靠本地字段。
- 隐私政策需要说明：账号、支付状态、网页 URL、图片 URL 是否被收集。


## 当前域名接口规划

- 会员状态查询：`https://playbox.dpdns.org/api/image-hunter/membership/status`
- 创建结账会话：`https://playbox.dpdns.org/api/image-hunter/billing/checkout`
- 恢复购买：`https://playbox.dpdns.org/api/image-hunter/billing/restore`
- Stripe Webhook：`https://playbox.dpdns.org/api/image-hunter/billing/webhook/stripe`
- 支付成功页：`https://playbox.dpdns.org/image-hunter/payment/success`
- 支付取消页：`https://playbox.dpdns.org/image-hunter/payment/cancel`
