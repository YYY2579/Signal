# Signal

Signal 是一个本地优先的个人 AI 信息情报桌面应用。它把技术社区、项目趋势和官方博客聚合到同一工作区，并提供全文搜索、稍后阅读、知识库、笔记、AI 搜索和文章洞察。

当前版本为 `0.1.1`。发布工作流为 Windows x64、macOS Intel、macOS Apple Silicon 和 Linux x64 生成安装包与 SHA-256 校验文件；如果 [GitHub Releases](https://github.com/YYY2579/Signal/releases) 暂无可用版本，请按下文从源码运行。

## 快速上手

### 方式一：安装发布包

1. 打开 [GitHub Releases](https://github.com/YYY2579/Signal/releases)，进入一个已发布版本。
2. 下载与系统匹配的 Windows x64、macOS Intel、macOS Apple Silicon 或 Linux x64 安装包。
3. 完成安装并启动 Signal。当前安装包没有代码签名：macOS 可能需要在 Finder 中右键应用并选择“打开”；Windows 可能显示 SmartScreen 提示。
4. 首次启动会在本机创建数据文件，并立即同步默认启用的数据源。同步需要网络，所需时间和结果取决于各上游服务。

项目随每个版本发布 `SHA256SUMS`，但当前没有代码签名。下载时应确认地址属于本仓库的 Releases 页面、版本标签与发布说明一致，并校验文件摘要；不要从第三方镜像获取安装包。完整说明见[发布下载与验证](docs/development.md#发布下载与验证)。

### 方式二：从源码启动

先安装 Node.js 22、rustup 和 [Tauri 2 系统依赖](https://tauri.app/start/prerequisites/)。仓库中的 `rust-toolchain.toml` 会自动选择 Rust 1.97.1，然后运行：

```bash
npm ci
npm run tauri -- dev
```

Vite 的浏览器预览不能调用 Tauri 后端；数据同步、本地数据库、系统凭据和 AI 连接需要在桌面窗口中验证。

## 第一次使用

1. 等待左侧数据源完成首轮同步，或点击顶部刷新按钮手动刷新所有已启用来源。
2. 在“设置 > 数据源”中启停同步、调整订阅状态或修改刷新间隔。GitHub、知乎、CSDN、力扣等常用技术来源默认保留；Reddit 因匿名访问可能返回 HTTP 403，默认关闭。
3. 点击文章进入阅读区。正文能否离线阅读取决于来源是否提供可抓取正文；无法获取时可打开原文。
4. 使用搜索框进行本地全文搜索。收藏、稍后阅读、知识库和笔记都保存在本机。
5. AI 是可选能力。在“设置 > AI”中选择协议、填写服务地址和模型，云模型还需保存 API Key，再执行“测试连接”。Ollama 默认连接本机服务且无需 API Key。
6. 生成文章洞察前，Signal 会显示待发送的数据并要求确认。默认生成结果保留为草稿，接受后才进入已完成状态。

## 已实现能力

- 九个已注册来源：Hacker News、GitHub Trending、V2EX、掘金、知乎热榜、CSDN 热榜、力扣讨论、Reddit `r/programming`、Rust 官方博客
- 首页、热门趋势、我的订阅、AI 摘要、稍后阅读和收藏知识库工作区
- SQLite FTS5 本地全文搜索、关键词黑白名单、已读状态、收藏、稍后阅读、知识库和笔记
- 按需正文缓存、热度快照和基于本地数据的文章分析视图
- OpenAI Chat Completions 兼容协议、Anthropic Messages、Gemini `generateContent`、Ollama 原生 `/api/chat`
- AI 搜索，以及三句话总结、核心观点、影响分析、相关技术和延伸阅读

各来源并不保证完整正文，AI 也不会在未配置模型时自动工作。精确默认值和限制见[能力参考](docs/reference.md)。

## 文档

- [配置指南](docs/configuration.md)：数据源、刷新、来源 Cookie、关键词和 AI Provider
- [能力参考](docs/reference.md)：支持来源、协议、默认值和已知限制
- [隐私与本地数据](docs/privacy.md)：本地保存内容、网络请求和凭据边界
- [开发与发布](docs/development.md)：开发、构建、测试、发布和安装包验证

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri 2 |
| 前端 | React 19、TypeScript、Vite、Tailwind CSS |
| 状态管理 | Zustand |
| 后端 | Rust、reqwest、Tokio、sqlx |
| 本地存储 | SQLite、FTS5、Tauri Store、系统凭据存储 |

## 项目状态

自动化测试覆盖本地业务逻辑、数据源响应解析和四类 AI 协议的请求/响应格式，但不会使用真实云 API Key 发起付费模型调用，也不会要求开发机正在运行 Ollama。每位用户仍应使用“测试连接”和一次实际生成验证自己的服务地址、模型权限及兼容性。

贡献前请先运行[开发与测试命令](docs/development.md#检查与测试)。提交信息使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式。

Signal 以 [MIT License](LICENSE) 开源。
