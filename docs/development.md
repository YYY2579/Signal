# 开发与发布

本文面向希望本地开发、构建、测试或验证发布包的贡献者。

## 环境要求

- Node.js 22，与 CI 使用的主版本一致
- npm，使用仓库中的 `package-lock.json`
- Rust stable，以及 `rustfmt`、`clippy`
- [Tauri 2 对应平台的系统依赖](https://tauri.app/start/prerequisites/)

CI 在 Ubuntu 上额外安装 WebKitGTK、OpenSSL、AppIndicator 和 librsvg 开发包。正式发布矩阵包含 Windows x64、macOS Intel、macOS Apple Silicon 和 Linux x64。

## 启动开发环境

```bash
npm ci
npm run tauri -- dev
```

这会先启动 Vite，再打开 Tauri 桌面窗口。只运行 `npm run dev` 得到的是前端开发服务器，不能验证 Rust 命令、SQLite、系统凭据、原文打开或真实来源同步。

## 检查与测试

提交前从仓库根目录运行：

```bash
npm run lint
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-targets
```

`npm run lint` 当前执行 TypeScript `tsc --noEmit`，不是 ESLint。Rust 测试使用本地 fixture 和临时数据库，AI 协议测试不会调用付费云服务。来源接口是否仍可访问需要在桌面应用中手动刷新验证。

## 构建本机安装包

```bash
npm run tauri -- build
```

Tauri 会先运行 `npm run build`，再为当前主机生成可用的 bundle。跨平台发布由 GitHub Actions 的目标矩阵完成，不应假设一台开发机能直接生成所有平台安装包。

## CI

`.github/workflows/ci.yml` 在提交到 `main` 或针对 `main` 的 Pull Request 上执行：

1. Ubuntu：前端类型检查、Rust 格式检查、Clippy 和 Rust 测试。
2. macOS Intel：构建 `x86_64-apple-darwin`，不上传产物。
3. macOS Apple Silicon：构建 `aarch64-apple-darwin`，不上传产物。
4. Windows：构建 `x86_64-pc-windows-msvc`，不上传产物。
5. Linux：构建 `x86_64-unknown-linux-gnu`，不上传产物。

CI 的 build-verify 只证明构建完成，不等同于签名、安装和端到端来源/AI 验证。

## 发布流程

发布者应同时更新 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 的版本，并更新 `CHANGELOG.md`。确认工作区检查通过后，创建与版本一致的 `v*` 标签并推送：

```bash
git tag -a v0.1.0 -m "Signal v0.1.0"
git push origin v0.1.0
```

`.github/workflows/release.yml` 会验证标签与三个项目版本一致，为四个平台构建安装包，统一资产名称，生成 `SHA256SUMS`，并在所有构建成功后发布 GitHub Release。任一平台失败时不会发布半成品版本。

当前工作流没有代码签名或公证步骤。发布前至少应在每个平台完成安装、首次启动、默认来源同步、本地搜索、文章打开和设置持久化测试。使用真实 AI 服务的验证需要维护者自行提供凭据，凭据不得写入仓库或 CI 日志。

## 发布下载与验证

用户下载时应：

1. 只使用本仓库的 [GitHub Releases](https://github.com/YYY2579/Signal/releases)。
2. 确认标签、发布说明和安装包版本一致。
3. 选择 Windows x64、macOS Intel、macOS Apple Silicon 或 Linux x64 资产。
4. 下载同一版本的 `SHA256SUMS`，在安装前核对 SHA-256。当前项目没有平台代码签名或公证；校验和只能证明文件与该 Release 中的清单一致。若这不符合所需信任级别，应从已审查的源码自行构建。
5. 首次启动后检查默认来源是否产生真实文章，再按[配置指南](configuration.md)测试自己的 AI Provider。协议单元测试不能替代真实端点验证。

## 贡献约定

- 功能变更使用分支和 Pull Request，不直接依赖本地生成物。
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)。
- 不提交 API Key、Cookie、本地数据库、应用数据目录内容、日志或构建产物。
- 修改来源适配时，为真实响应结构添加脱敏 fixture 测试；不要把账号数据或认证头写入 fixture。
- 修改 AI 协议时，至少覆盖 URL、鉴权头、请求体和响应解析，并保持真实网络调用由用户显式触发。
