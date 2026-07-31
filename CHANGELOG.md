# Changelog

本文件记录 Signal 项目的显著变更，格式参考 [Keep a Changelog](https://keepachangelog.com/)。

## [Unreleased]

## [0.1.2] - 2026-07-31

### Added

- 新增可拖拽并持久化的标题列表/阅读区分隔线、明暗主题和中英文工作区导航。
- 新增最近三天 Top20 话题流，按真实文章匹配数量排序并显示关键词。
- 新增可验证、识别、调度和删除的用户 RSS/Atom 来源。
- 新增来源登录指引，掘金和知乎 Cookie 改用操作系统凭据存储并跨重启恢复。

### Changed

- AI 搜索先检索全库匹配文章，再合并近期内容并允许模型补充明确标注的稳定背景知识。
- AI 连接测试现在执行真实的最小结构化生成，避免模型查询成功但实际生成不可用。
- RSS、知乎、力扣和普通网页来源只在提取到真实正文时标记缓存；来源摘要改为有长度上限的抽取式摘要。

### Fixed

- 修复 CSDN/知乎未知时间、力扣旧帖长期残留及重复文章元数据不更新的问题。
- 修复摘要被当成正文缓存、正文缓存状态不准确和旧假缓存未迁移的问题。
- 修复关键词热力图数据不稳定和技术领域占比始终为空的问题。
- 修复文章详情缺少关闭入口、切换工作区或来源后旧详情仍显示的问题。
- 修复 OpenAI Compatible 中转返回空响应、HTML 错误页、SSE、Responses 风格内容或带说明 JSON 时只显示 `expected value at line 1 column 1` 的问题。

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
