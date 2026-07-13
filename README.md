# 记账（本地 PWA）

预收预算 + 当日记账 + 对账总结。纯前端、无后端，数据只存在设备本地（IndexedDB）。
可作为 PWA「添加到主屏幕」在手机上离线使用。

## 功能

- **卡片** — 自定义管理储蓄卡 / 消费卡 / 基金卡 / 银行卡，可设默认卡、排序，非银行卡也平等参与调账。
- **当日记账** — 选卡、收入/支出、分类、金额、备注；实际余额可手改并自动留痕（生成 adjust 流水，余额始终由流水派生、可追溯）。
- **预算 vs 实际** — 预算层按日期滚动计算，与实际层逐卡对比，超支标红；预算内可在储蓄卡间「调出/调入」（零和成对，删一条自动级联删除对手卡上配对的另一条）。
- **消费卡** — 本月剩余 = 消费预算 + 超额支出 − 已消费；只要已消费超过预算就单独显示「超支 = 已消费 − 预算」，超额充值不会把超支盖掉。
- **储蓄卡** — 单卡录入真实储蓄额 / 本月收入 / 超额支出（覆盖式，非累加），带时间戳修改流水；本月消费预算绑定到该卡，消费卡额度只读取这里，支持一键清除本月数据。
- **对账/统计** — 差额拆解为基金盈亏 + 收入差额 + 利息 − 消费超支 − 预充暂存；消费预充按月结转、逐月正超支；基金营收单列（当前值，不分时段）；含年同比、月环比。

## 技术

- `apps/web` — React + Vite + TS，移动优先，Dexie 本地存储，vite-plugin-pwa（`autoUpdate`）。
- 领域逻辑（余额引擎 / 预算滚动 / 覆盖周期 / 超支 / 消费预充结转 / 统计）为纯函数，含单元测试。
- 行为规格见 `openspec/specs/`（account-transfer、budget-planning、budget-actual-comparison、card-management、daily-bookkeeping、summary-reporting、sync-backend）。

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
