# Signal

多社区热门文章聚合桌面应用 —— 聚合 Hacker News、V2EX、掘金、知乎的热门内容，统一信息流展示，支持离线阅读。

## 功能

- 📰 多源聚合：Hacker News / V2EX / 掘金 / 知乎 热门文章统一展示
- 🔄 可配置抓取：每个数据源独立开关与刷新频率
- 📖 离线阅读：文章正文缓存，断网可看
- 🔍 全文搜索：SQLite FTS5 搜索标题/摘要/正文
- 🏷 关键词过滤：黑名单 + 白名单
- 🔐 可选登录：cookie 注入获取更全内容（掘金/知乎）
- 💻 跨平台：Windows + macOS (Intel)

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri 2 |
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS |
| 状态管理 | Zustand |
| 后端 | Rust（reqwest / tokio / sqlx） |
| 数据存储 | SQLite（FTS5 全文搜索） |

## 开发

### 前置依赖

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) stable
- Tauri 2 系统依赖：见 https://tauri.app/start/prerequisites/

### 启动开发

```bash
npm install
npm run tauri dev
```

### 构建生产包

```bash
npm run tauri build
```

### 代码检查

```bash
npm run lint          # 前端 tsc 类型检查
cd src-tauri && cargo clippy --all-targets -- -D warnings
cd src-tauri && cargo fmt --all -- --check
```

## CI/CD

- **CI**（`.github/workflows/ci.yml`）：PR / push 到 main 时跑 lint + test + 双平台构建验证
- **Release**（`.github/workflows/release.yml`）：push `v*` tag 时自动构建 Windows + macOS Intel 安装包，发布到 GitHub Releases（草稿）

### 发版流程

```bash
# 1. 更新版本号（src-tauri/tauri.conf.json + package.json）
# 2. 更新 CHANGELOG.md
# 3. 提交并打 tag
git tag v0.1.0
git push origin v0.1.0
# 4. CI 自动构建 → GitHub Releases 草稿 → 手动 Publish
```

## 协作规范

- **提交**：[Conventional Commits](https://www.conventionalcommits.org/)（`feat(scope): subject`）
- **分支**：`main` 受保护，功能在 `feat/*` 分支开发，PR + Squash merge
- **审核**：所有变更经 PR + CI 通过后合并

## 平台说明

- **macOS Intel**：未签名，首次启动右键 → 打开
- **Windows**：未签名，SmartScreen 警告选"仍要运行"
