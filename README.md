# ai-pr-reviewer

一个完全自定义的 GitHub PR 自动审查 CLI：

- 用自己的 `OPENAI_API_KEY` / 模型 / prompt 规则。
- 在 GitHub PR Review 里发布 summary。
- 在具体 diff 行发布 inline comments。
- 支持 GitHub 原生 `suggestion` 一键应用代码块。
- 适合先作为 npm CLI 使用，后续再包装为 GitHub Action。

## 快速开始

### 1. 配置 Secret

在仓库设置中添加：

```text
OPENAI_API_KEY=sk-...
```

可选添加 Repository Variables：

```text
OPENAI_MODEL=gpt-5.5
OPENAI_BASE_URL=https://api.example.com/v1
```

如果你不是用官方 OpenAI，而是第三方 / 自建 OpenAI-compatible 服务，重点配置 `OPENAI_BASE_URL`。工具会请求：

```text
${OPENAI_BASE_URL}/responses
```

所以 base URL 通常需要带 `/v1`，例如 `https://api.example.com/v1`。

### 2. 添加 workflow

本仓库已包含示例：

```text
.github/workflows/ai-pr-review.yml
```

核心配置：

```yaml
permissions:
  contents: read
  pull-requests: write
```

然后在 PR 事件中执行：

```bash
node ./bin/ai-pr-reviewer.js --post
```

发布到 npm 后可以改成：

```bash
npx ai-pr-reviewer --post
```

## 本地 dry-run

```bash
GITHUB_TOKEN=ghp_xxx \
OPENAI_API_KEY=sk_xxx \
OPENAI_BASE_URL=https://api.example.com/v1 \
GITHUB_REPOSITORY=owner/repo \
PR_NUMBER=123 \
node ./bin/ai-pr-reviewer.js --dry-run
```

Windows PowerShell：

```powershell
$env:GITHUB_TOKEN="ghp_xxx"
$env:OPENAI_API_KEY="sk_xxx"
$env:OPENAI_BASE_URL="https://api.example.com/v1"
$env:GITHUB_REPOSITORY="owner/repo"
$env:PR_NUMBER="123"
node ./bin/ai-pr-reviewer.js --dry-run
```

## 自定义审查规则

默认读取：

```text
.github/ai-review.md
AGENTS.md
```

也可以通过环境变量或参数指定：

```bash
REVIEW_RULES=.github/ai-review.md,docs/review-policy.md node ./bin/ai-pr-reviewer.js --post
```

或：

```bash
node ./bin/ai-pr-reviewer.js --post --rules .github/ai-review.md,docs/review-policy.md
```

## 常用配置

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `OPENAI_MODEL` | `gpt-5.5` | OpenAI 模型 |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | 兼容 OpenAI API 的 base URL，通常需要带 `/v1` |
| `REVIEW_RULES` | `.github/ai-review.md,AGENTS.md` | 审查规则文件 |
| `REVIEW_SEVERITY_THRESHOLD` | `P3` | 最低发布级别 |
| `REVIEW_EVENT` | `AUTO` | `AUTO` / `COMMENT` / `REQUEST_CHANGES` / `APPROVE` |
| `REQUEST_CHANGES_ON` | `P1` | `AUTO` 模式下，出现该级别及以上问题时 Request changes |
| `APPROVE_WHEN_CLEAN` | `false` | `AUTO` 模式下无 finding 时是否自动 Approve |
| `FAIL_ON` | 空 | 例如 `P1`，出现 P1/P0 时 CI 失败 |
| `MAX_FILES` | `80` | 最多送审文件数 |
| `MAX_PATCH_BYTES` | `180000` | 最多送审 diff 字节数 |
| `MAX_COMMENTS` | `30` | 最多 inline 评论数 |

## GitHub 评论效果

每条 finding 会被转换为 GitHub review comment：

````md
🟨 `P2` **标题**

问题说明和修复建议。

```suggestion
replacement code
```
````

只要模型返回了 `suggestion`，GitHub 就会渲染成可一键应用的 Suggested change。


## 内置审批策略

工具内置了一套偏保守的 PR 审批提示词和门禁策略，核心目标是：**只阻断真实、高影响、和本次 diff 直接相关的问题**。

默认配置：

```text
REVIEW_EVENT=AUTO
REQUEST_CHANGES_ON=P1
APPROVE_WHEN_CLEAN=false
```

`AUTO` 模式下：

```text
P0/P1  -> GitHub Review: REQUEST_CHANGES
P2/P3  -> GitHub Review: COMMENT
无问题 -> GitHub Review: COMMENT
```

如果你希望无问题时自动批准，可以设置：

```yaml
APPROVE_WHEN_CLEAN: 'true'
```

不建议默认自动批准，因为二进制文件、超大 diff、模型遗漏等情况仍需要人工兜底。

内置 prompt 会要求模型拒绝泛泛建议：

- 代码风格、命名偏好、轻微重构建议不能标 P0/P1。
- 低置信、不确定、无法给出影响和修复方向的问题不要评论。
- 只有安全、数据破坏、权限绕过、主流程崩溃等明确高风险问题才升级为 P0/P1。

你还可以在 `.github/ai-review.md` 里叠加仓库自己的审查规则。


## 多 commit / 追加提交行为

workflow 监听了：

```yaml
pull_request:
  types: [opened, synchronize, reopened]
```

所以一个 PR 有多个 commit 时，每次新增 commit / force push 都会重新审查 **当前 PR head 相对 base 的完整 diff**，不是只审最后一个 commit。

为避免追加 commit 后重复刷相同评论，工具现在会：

1. 读取当前 PR 已有 review comments。
2. 查找隐藏 marker：`<!-- ai-pr-reviewer:finding ... -->`。
3. 对新的 finding 生成稳定 fingerprint。
4. 已经发过的 finding 不重复发布，只在 summary 的折叠区标记为跳过。

workflow 也加了 concurrency：

```yaml
concurrency:
  group: ai-pr-review-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

这样连续 push 多个 commit 时，会取消同一 PR 上正在跑的旧审查，尽量只保留最新一次。

注意：如果同一问题因为代码移动导致行号变化，fingerprint 可能变化，仍可能重新评论；这是为了避免错过被移动到新位置后仍存在的问题。

## 设计说明

执行流程：

```text
GitHub Action
  -> ai-pr-reviewer CLI
  -> GitHub API 获取 PR diff
  -> 读取 .github/ai-review.md / AGENTS.md
  -> OpenAI Responses API 输出结构化 JSON
  -> 校验 path + line 是否属于 diff
  -> GitHub Review API 发 summary + inline comments
```

为了避免模型幻觉行号，工具会校验：

- `path` 必须存在于 changed files。
- `line` 必须是 diff 中可评论的 `RIGHT` 或 `LEFT` 行。
- 无法定位的 finding 会跳过，并在 summary 的 details 中列出。

## CLI

```bash
ai-pr-reviewer --post
ai-pr-reviewer --dry-run --repo owner/name --pr 123
```

参数：

```text
--post                         发布 GitHub review
--dry-run                      只输出 JSON，不发布
--repo owner/name              仓库，默认 GITHUB_REPOSITORY
--pr 123                       PR 编号，默认 PR_NUMBER
--model model                  模型，默认 OPENAI_MODEL 或 gpt-5.5
--openai-base-url url          OpenAI-compatible API base URL
--rules file1,file2            规则文件
--max-files n                  最多审查文件数
--max-patch-bytes n            最多 diff 字节数
--max-comments n               最多 inline comments
--fail-on P1                   出现指定级别及以上问题时退出非 0
--review-event AUTO            GitHub review event
--request-changes-on P1        AUTO 模式下 P1/P0 Request changes
--approve-when-clean true      AUTO 模式下无 finding 时 Approve
--severity-threshold P2        只发布指定级别及以上问题
```

