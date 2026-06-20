# github-ai-pr-reviewer

[![npm version](https://img.shields.io/npm/v/github-ai-pr-reviewer?logo=npm&color=CB3837)](https://www.npmjs.com/package/github-ai-pr-reviewer)
[![npm downloads](https://img.shields.io/npm/dm/github-ai-pr-reviewer?logo=npm)](https://www.npmjs.com/package/github-ai-pr-reviewer)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-PR_Review-2088FF?logo=githubactions&logoColor=white)
![OpenAI Compatible](https://img.shields.io/badge/OpenAI-compatible-412991?logo=openai&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

自定义 AI PR 审查机器人。通过 GitHub Actions 拉取 PR diff，调用自己的 OpenAI-compatible API，在 GitHub Review 中发布 summary、具体行 inline comments 和 `suggestion` 一键修改建议。

npm 仓库：<https://www.npmjs.com/package/github-ai-pr-reviewer>

GitHub 仓库：<https://github.com/LanQin996/Agent-Review>

## 特性

- **行级 PR 审查** — 基于 GitHub Review API 在具体 diff 行下评论
- **一键修改建议** — 支持 GitHub 原生 `suggestion` 代码块
- **自定义模型/API** — 支持官方 `/responses`，也支持第三方常见 `/chat/completions`
- **模型推理强度** — 支持 `OPENAI_REASONING_EFFORT`，可配置 `minimal/low/medium/high/xhigh`
- **自定义审查规则** — 默认读取 `.github/ai-review.md` 和 `AGENTS.md`
- **审批门禁** — `P0/P1` 自动 `REQUEST_CHANGES`，`P2/P3` 只评论
- **多 commit 友好** — PR 追加 commit 后自动重审，并通过隐藏 marker 去重
- **忽略规则** — `.ai-reviewignore` 跳过 lockfile、构建产物、生成文件
- **Summary 模式** — 支持每次 Review、更新同一条 PR 评论、两者都发或不发
- **稳定性** — OpenAI/GitHub API timeout 与 transient retry

## 快速开始

### 1. 配置密钥

在 GitHub 仓库中添加 Secret：

```text
OPENAI_API_KEY=sk-...
```

如果使用第三方 OpenAI-compatible 服务，添加 Repository Variables：

```text
OPENAI_MODEL=your-model
OPENAI_API_MODE=chat
OPENAI_REASONING_EFFORT=xhigh
OPENAI_BASE_URL=https://api.example.com/v1
```

API mode 对应请求路径：

```text
responses -> ${OPENAI_BASE_URL}/responses
chat      -> ${OPENAI_BASE_URL}/chat/completions
```

第三方服务大多使用 `chat`，并且 `OPENAI_BASE_URL` 通常需要带 `/v1`。

如果模型支持 reasoning / thinking 强度，可以配置：

```text
OPENAI_REASONING_EFFORT=xhigh
OPENAI_REASONING_SUMMARY=auto
```

`OPENAI_REASONING_EFFORT` 会透传给模型接口。常见值包括 `minimal`、`low`、`medium`、`high`，部分 OpenAI-compatible 服务也支持 `xhigh` / `x-high`。留空则使用模型默认推理强度。

### 2. 添加 GitHub Actions

本仓库已包含示例：

```text
.github/workflows/ai-pr-review.yml
```

最小权限：

```yaml
permissions:
  contents: read
  pull-requests: write
```

当前仓库内直接运行：

```bash
node ./bin/ai-pr-reviewer.js --post
```

已发布到 npm，其他项目可直接使用：

```bash
npx github-ai-pr-reviewer@latest --post
```

### 3. 本地 dry-run

```bash
GITHUB_TOKEN=ghp_xxx \
OPENAI_API_KEY=sk_xxx \
OPENAI_API_MODE=chat \
OPENAI_BASE_URL=https://api.example.com/v1 \
GITHUB_REPOSITORY=owner/repo \
PR_NUMBER=123 \
node ./bin/ai-pr-reviewer.js --dry-run
```

PowerShell：

```powershell
$env:GITHUB_TOKEN="ghp_xxx"
$env:OPENAI_API_KEY="sk_xxx"
$env:OPENAI_API_MODE="chat"
$env:OPENAI_BASE_URL="https://api.example.com/v1"
$env:GITHUB_REPOSITORY="owner/repo"
$env:PR_NUMBER="123"
node ./bin/ai-pr-reviewer.js --dry-run
```

## 架构

```text
┌──────────────────────────────────────────────────────────┐
│                    GitHub Pull Request                   │
│ opened / synchronize / reopened                          │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│                    GitHub Actions                        │
│ checkout + node ./bin/ai-pr-reviewer.js --post           │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│                github-ai-pr-reviewer                     │
│ 1. 读取 PR diff / changed files                          │
│ 2. 应用 .ai-reviewignore                                 │
│ 3. 读取 .github/ai-review.md / AGENTS.md                 │
│ 4. 调用 OpenAI-compatible API                            │
│ 5. 校验 path + line 是否属于 diff                        │
│ 6. 去重历史 inline comments                              │
│ 7. 发布 GitHub Review / Summary Comment                  │
└──────────────────────────────────────────────────────────┘
```

## 能力

| 模块 | 功能 |
|------|------|
| GitHub | 拉取 PR、changed files、review comments、发布 Review 和 PR comment |
| OpenAI | 支持 `responses` / `chat` 两种 API mode，可配置 reasoning effort |
| Prompt | 内置审查策略 + 仓库自定义规则 |
| 行号校验 | 只允许评论真实存在于 diff 的 `RIGHT` / `LEFT` 行 |
| Suggestion | 自动渲染 GitHub 原生一键修改建议 |
| 审批 | `AUTO` 模式下按严重级别选择 `COMMENT` / `REQUEST_CHANGES` / `APPROVE` |
| 去重 | 使用 `<!-- ai-pr-reviewer:finding ... -->` 隐藏 marker 避免重复评论 |
| Summary | `review` / `comment` / `both` / `none` 四种发布模式 |
| 忽略 | `.ai-reviewignore` + 内置 lockfile/generated 文件过滤 |
| 稳定性 | timeout、retry、concurrency cancel-in-progress |

## 审查规则

默认读取：

```text
.github/ai-review.md
AGENTS.md
```

也可以覆盖：

```bash
REVIEW_RULES=.github/ai-review.md,docs/review-policy.md node ./bin/ai-pr-reviewer.js --post
```

内置策略偏保守：

- `P0/P1`：安全风险、数据破坏、权限绕过、主流程崩溃等阻断问题
- `P2`：明确缺陷或维护风险，建议修复但不一定阻断
- `P3`：轻微问题、小范围改进
- 风格、命名、低置信猜测不会升级为阻断项
- 无法说明触发条件、影响和修复方向的问题不评论

默认审批行为：

```text
P0/P1  -> REQUEST_CHANGES
P2/P3  -> COMMENT
无问题 -> COMMENT
```

如需无问题时自动批准：

```yaml
APPROVE_WHEN_CLEAN: 'true'
```

## 忽略文件

默认读取 `.ai-reviewignore`，并内置跳过：

```text
package-lock.json
npm-shrinkwrap.json
yarn.lock
pnpm-lock.yaml
bun.lockb
dist/**
build/**
coverage/**
generated/**
**/*.min.js
**/*.map
**/*.snap
```

指定更多 ignore 文件：

```bash
REVIEW_IGNORE=.ai-reviewignore,docs/review-ignore.txt node ./bin/ai-pr-reviewer.js --post
```

## 多 commit 说明

workflow 监听：

```yaml
pull_request:
  types: [opened, synchronize, reopened]
```

一个 PR 有多个 commit 时，每次新增 commit / force push 都会重新审查 **当前 PR head 相对 base 的完整 diff**，不是只审最后一个 commit。

为避免重复刷评论：

1. 工具读取当前 PR 已有 review comments
2. 查找 `<!-- ai-pr-reviewer:finding ... -->` 隐藏 marker
3. 对新 finding 生成 fingerprint
4. 已发布过的 finding 不重复发布

workflow 同时启用并发取消：

```yaml
concurrency:
  group: ai-pr-review-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

## Summary 模式

`SUMMARY_MODE` 控制总览信息发布位置：

```text
review  -> 每次创建 GitHub Review summary，默认值
comment -> 更新同一条 PR 普通评论，避免多次 push 后 summary 刷屏
both    -> review summary + upsert 普通评论
none    -> 不发 summary，只发 inline comments / 必要 request changes
```

如果希望 PR 页面更干净，推荐：

```yaml
SUMMARY_MODE: comment
```

`comment` / `both` 模式会通过 `<!-- ai-pr-reviewer:summary -->` 更新上一条 summary 评论。

## 配置

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `OPENAI_API_KEY` | 必填 | OpenAI-compatible API key |
| `OPENAI_MODEL` | `gpt-5.5` | 模型名 |
| `OPENAI_API_MODE` | `responses` | `responses` 或 `chat` |
| `OPENAI_REASONING_EFFORT` | 空 | 推理强度，例如 `minimal` / `low` / `medium` / `high` / `xhigh` |
| `OPENAI_REASONING_SUMMARY` | 空 | Responses API reasoning summary，例如 `auto` / `concise` / `detailed` |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | API base URL，通常带 `/v1` |
| `OPENAI_TIMEOUT_MS` | `120000` | OpenAI 请求超时 |
| `OPENAI_RETRIES` | `2` | OpenAI 临时失败重试次数 |
| `GITHUB_TOKEN` | 必填 | GitHub token，Actions 中用 `${{ github.token }}` |
| `GITHUB_REPOSITORY` | 自动 | `owner/repo` |
| `PR_NUMBER` | 自动 | PR 编号 |
| `REVIEW_RULES` | `.github/ai-review.md,AGENTS.md` | 审查规则文件 |
| `REVIEW_IGNORE` | `.ai-reviewignore` | 忽略规则文件 |
| `REVIEW_EVENT` | `AUTO` | `AUTO` / `COMMENT` / `REQUEST_CHANGES` / `APPROVE` |
| `REQUEST_CHANGES_ON` | `P1` | `AUTO` 模式下该级别及以上阻断 |
| `APPROVE_WHEN_CLEAN` | `false` | 无 finding 时是否自动 approve |
| `REVIEW_SEVERITY_THRESHOLD` | `P3` | 最低发布级别 |
| `SUMMARY_MODE` | `review` | `review` / `comment` / `both` / `none` |
| `FAIL_ON` | 空 | 例如 `P1`，出现 P1/P0 时 CI 失败 |
| `MAX_FILES` | `80` | 最多送审文件数 |
| `MAX_PATCH_BYTES` | `180000` | 最多送审 diff 字节数 |
| `MAX_COMMENTS` | `30` | 最多 inline 评论数 |
| `GITHUB_TIMEOUT_MS` | `30000` | GitHub API 请求超时 |
| `GITHUB_RETRIES` | `2` | GitHub API 重试次数 |

## CLI

```bash
github-ai-pr-reviewer --post
github-ai-pr-reviewer --dry-run --repo owner/name --pr 123
```

常用参数：

```text
--post                         发布 GitHub review
--dry-run                      只输出 JSON，不发布
--repo owner/name              仓库，默认 GITHUB_REPOSITORY
--pr 123                       PR 编号，默认 PR_NUMBER
--model model                  模型，默认 OPENAI_MODEL 或 gpt-5.5
--openai-api-mode responses    responses 或 chat
--reasoning-effort xhigh       模型推理强度，留空使用模型默认
--reasoning-summary auto       Responses API reasoning summary
--openai-base-url url          OpenAI-compatible API base URL
--openai-timeout-ms 120000     OpenAI 请求超时
--openai-retries 2             OpenAI 重试次数
--rules file1,file2            审查规则文件
--ignore file1,file2           ignore 文件，默认 .ai-reviewignore
--summary-mode review          review / comment / both / none
--review-event AUTO            GitHub review event
--request-changes-on P1        AUTO 模式下 P1/P0 Request changes
--approve-when-clean true      AUTO 模式下无 finding 时 Approve
--severity-threshold P2        只发布指定级别及以上问题
--max-files n                  最多审查文件数
--max-patch-bytes n            最多 diff 字节数
--max-comments n               最多 inline comments
--fail-on P1                   出现指定级别及以上问题时退出非 0
```

## 要求

- Node.js 20+
- GitHub Actions `pull-requests: write` 权限
- OpenAI-compatible API key
- 第三方 API 如果不支持 `/responses`，请设置 `OPENAI_API_MODE=chat`

## 发布到 npm

当前包名使用 `github-ai-pr-reviewer`。发布前建议先跑完整检查：

```bash
npm login
npm test
npm run check
npm pack --dry-run
npm publish --access public
```

其他项目接入时直接在 GitHub Actions 中调用：

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20

- run: npx github-ai-pr-reviewer --post
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    OPENAI_MODEL: ${{ vars.OPENAI_MODEL }}
    OPENAI_API_MODE: ${{ vars.OPENAI_API_MODE || 'chat' }}
    OPENAI_REASONING_EFFORT: ${{ vars.OPENAI_REASONING_EFFORT }}
    OPENAI_REASONING_SUMMARY: ${{ vars.OPENAI_REASONING_SUMMARY }}
    OPENAI_BASE_URL: ${{ vars.OPENAI_BASE_URL }}
    GITHUB_TOKEN: ${{ github.token }}
    GITHUB_REPOSITORY: ${{ github.repository }}
    PR_NUMBER: ${{ github.event.pull_request.number }}
    PR_HEAD_SHA: ${{ github.event.pull_request.head.sha }}
```

## License

MIT
