# 记账（本地 PWA）

预收预算 + 当日记账 + 总结。纯前端、无后端，数据只存在设备本地（IndexedDB）。
可作为 PWA「添加到主屏幕」在手机上离线使用。

- `apps/web` — React + Vite + TS，移动优先，Dexie 本地存储，vite-plugin-pwa
- 领域逻辑（余额引擎 / 预算滚动 / 覆盖周期 / 超支 / 统计）为纯函数，含单元测试

## 本地开发

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 领域纯函数单测
npm run typecheck
npm run build      # 产物在 apps/web/dist
```

## 数据

- 全部数据存本机 IndexedDB，无账号、打开即用。
- 「卡片」页 → 数据备份 → **导出/导入** JSON。这是唯一的备份与换机迁移方式，请定期导出。

## 部署到 GitHub Pages（免费 HTTPS）

已内置 `.github/workflows/deploy.yml`，推送到 `main` 即自动构建并发布。

1. 在 GitHub 新建仓库（例如 `bookkeeping`）。
2. 本地推送：
   ```bash
   git init && git add -A && git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<用户名>/bookkeeping.git
   git push -u origin main
   ```
3. 仓库 Settings → Pages → Build and deployment → Source 选 **GitHub Actions**。
4. 等 Actions 跑完，访问 `https://<用户名>.github.io/bookkeeping/`。

> 构建时用仓库名作为子路径（`BASE_PATH=/<repo>/`），由 Actions 自动注入；路由用 HashRouter，子路径下刷新不会 404。

## 装到 iPhone

用 Safari 打开上面的 Pages 网址 → 分享 → **添加到主屏幕**。之后有独立图标、全屏、离线可用，数据只在手机里。
