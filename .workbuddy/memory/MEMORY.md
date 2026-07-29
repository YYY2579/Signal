# Signal 项目长期记忆

## 项目概要
- **Signal**：多社区热门文章聚合桌面应用（聚合 HN/V2EX/掘金/知乎热门）
- **仓库**：`git@github.com:YYY2579/Signal.git`，工作目录 `/Users/yyy/Desktop/Signal`
- **计划文件**：`/Users/yyy/.workbuddy/plans/blazing-beacon-babbage.md`

## 技术栈
- Tauri 2 + React 19 + TypeScript + Vite 7 + Tailwind 3 + Zustand
- Rust：reqwest / tokio / sqlx / scraper / chrono / async-trait
- **DB**：sqlx 直连 SQLite（不用 tauri-plugin-sql，前端通过 invoke 命令访问）
- 插件：tauri-plugin-opener + tauri-plugin-store

## 设计 tokens（固化，前端实现硬性规范）
- 配色：bg `#ffffff` / panel `#fafafa` / line `#f0f0f0` / ink `#111827` / muted `#6b7280` / faint `#9ca3af` / accent `#2563eb` / accent-soft `#eff6ff`
- 布局：顶栏 52px / 左栏 220px / 中栏 420px / 右栏自适应（正文 max-width 680px）/ 窗口 1200×800 最小 1024×640
- 圆角：卡片 8px / 按钮 6px
- 顶栏按钮：图标+小文字组合（非纯图标）；左栏右上角 + 按钮

## 协作规范
- **提交**：Conventional Commits（feat/fix/docs/chore/refactor/test/ci/perf）
- **分支**：main 受保护，feat/* 分支 + PR + Squash merge
- **CI**：ci.yml（lint+test+build-verify 双平台）+ release.yml（tag v* 触发，Windows + macOS Intel x86_64 出包到 Releases）

## 执行方式
- 6 批次，批次内多代理并发（最多 5 并行）
- 批次0 脚手架（串行）→ 批次1 Rust基础/Stores/CI/Docs → 批次2 四数据源+调度器 → 批次3 布局/文章/阅读器/设置 → 批次4 集成/过滤/登录 → 批次5 打磨+发版
- 每子任务独立 feat 分支 + PR + CI 验证

## 数据源要点
- HN：官方 API，外链不抓正文，Ask/Show HN 缓存 text
- V2EX：官方 API，注意 X-Rate-Limit-Remaining
- 掘金：recommend_all_feed 接口 + cursor 分页，content_api/v1/article/detail 取正文
- 知乎：iOS 头伪装（x-package-ytpe 拼写错误必须保留），detail_text 正则解析热度
