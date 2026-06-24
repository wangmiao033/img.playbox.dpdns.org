# 部署到 playbox.dpdns.org

## 1. 上传静态站点

把 `site/` 目录上传到服务器：

```bash
sudo mkdir -p /var/www/image-hunter
sudo rsync -av site/ /var/www/image-hunter/
```

## 2. 配置 Nginx

复制 `deploy/nginx-image-hunter.conf` 到 Nginx 配置目录并重载：

```bash
sudo cp deploy/nginx-image-hunter.conf /etc/nginx/conf.d/image-hunter.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 3. HTTPS

生产环境建议配置 HTTPS。示例：

```bash
sudo certbot --nginx -d playbox.dpdns.org
```

## 4. Chrome Web Store URL

- 官网：`https://playbox.dpdns.org/image-hunter`
- 隐私政策：`https://playbox.dpdns.org/image-hunter/privacy`
- 支持页：`https://playbox.dpdns.org/image-hunter/support`
