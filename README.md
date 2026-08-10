# 记账（本地 PWA）

预收预算 + 当日记账 + 对账总结。纯前端、无后端，数据只存在设备本地（IndexedDB）。
可作为 PWA「添加到主屏幕」在手机上离线使用。

## 功能

- **卡片** — 用户管理储蓄卡和基金卡；消费使用唯一的系统虚拟账户，不对应实际付款储蓄卡，也无需选择、命名或排序。
- **当日记账** — 直接记录全局消费流水，可选择日期、分类、金额和备注，并可回改或删除。
- **预算 vs 实际** — 预算层按日期滚动计算，与实际层逐卡对比，超支标红；预算内可在储蓄卡间「调出/调入」（零和成对，删一条自动级联删除对手卡上配对的另一条）。
- **虚拟消费账户** — 当月额度 = 所有储蓄卡在该月填写的消费预算之和；本月剩余 = 当月额度 + 当月超额充值 − 当月已消费；超支 = max(已消费 − 当月额度, 0)，超额充值不会掩盖超支，也不会读取上个月额度。
- **统计** — 「消费·分类统计」每个分类可点击展开，列出该分类下每一笔明细（日期、备注、金额）。
- **储蓄卡** — 单卡录入真实储蓄额 / 本月收入 / 超额充值（覆盖式，非累加）及该卡对全局消费预算的贡献；多张卡贡献相加，预充结转只在全局计算一次后按贡献比例分配。
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
