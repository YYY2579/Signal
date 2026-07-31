# Changelog

本文件记录 Signal 项目的显著变更，格式参考 [Keep a Changelog](https://keepachangelog.com/)。

## [Unreleased]

## [0.1.1] - 2026-07-31

### Fixed

- 修复最终发布作业未向 GitHub CLI 指定仓库、导致四个平台安装包构建成功后无法创建 Release 的问题。

## [0.1.0] - 2026-07-31

### Added

- 新增 GitHub Trending、CSDN 热榜、力扣讨论、Reddit `r/programming` 和 Rust 官方博客来源，保留 Hacker News、V2EX、掘金和知乎热榜。
- 新增首页、热门趋势、我的订阅、AI 摘要、稍后阅读和收藏知识库工作区。
- 新增文章收藏、稍后阅读、知识库标记、笔记、阅读次数和热度快照持久化。
- 新增文章洞察、AI 搜索、人工审核和 AI 结果状态管理。
- 新增 OpenAI Chat Completions 兼容、Anthropic Messages、Gemini `generateContent` 和 Ollama 原生 Chat 协议。
- 新增按 Provider 隔离的系统凭据存储、AI 设置校验、连接测试和发送前确认。
- 新增数据源订阅、同步开关和刷新间隔设置，以及掘金/知乎可选 Cookie 配置。
- 新增面向用户和开发者的快速上手、配置、能力参考、隐私、构建与发布文档。

### Changed

- 默认数据源扩展为九个已注册来源；Reddit 因匿名访问可能返回 HTTP 403，默认关闭。
- 普通文章按最近 7 天且每来源最多 1000 条清理；收藏、稍后阅读和知识库文章不自动删除。
- AI 洞察默认进入人工审核草稿，接受前不视为已完成结果。
- 发布工作流生成 Windows x64、macOS Intel、macOS Apple Silicon 和 Linux x64 安装包，并附带 `SHA256SUMS` 后自动发布 GitHub Release。

### Fixed

- 适配掘金当前推荐流和正文详情响应结构。
- 修复知乎旧 API 链接到浏览器问题页的迁移与打开行为。
- 强化外部 URL 和 AI Base URL 校验，拒绝带凭据的 URL 和不安全的远程 HTTP 地址。

### Known limitations

- 安装包尚未进行平台代码签名或 macOS 公证；用户应使用随版本发布的 `SHA256SUMS` 校验下载文件。
- GitHub 使用匿名 Search API，Reddit 匿名请求可能被拒绝，第三方来源均受上游限流和接口变更影响。
- 知乎和力扣当前只提供摘要级阅读内容，Hacker News 普通外链不抓取正文。
- 自动化测试不使用真实云 API Key，也不要求本地 Ollama 在线；用户需要对自己的模型和端点执行连接与生成测试。
