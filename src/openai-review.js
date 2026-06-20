import { BUILTIN_REVIEW_POLICY } from './review-policy.js';
import { requestJsonWithRetry } from './http.js';

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'findings'],
  properties: {
    summary: {
      type: 'string',
      description: 'Concise review summary in Chinese. Mention overall risk and main themes.',
    },
    findings: {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'path', 'line', 'start_line', 'side', 'title', 'body', 'suggestion'],
        properties: {
          severity: {
            type: 'string',
            enum: ['P0', 'P1', 'P2', 'P3'],
            description: 'P0 critical, P1 high, P2 medium, P3 low.',
          },
          path: {
            type: 'string',
            description: 'Repository-relative file path exactly as shown in the diff.',
          },
          line: {
            type: 'integer',
            description: 'Line number on selected side. Prefer new_line / RIGHT.',
          },
          start_line: {
            type: ['integer', 'null'],
            description: 'Optional start line for a range comment on the same side.',
          },
          side: {
            type: 'string',
            enum: ['RIGHT', 'LEFT'],
            description: 'RIGHT for new_line, LEFT for old_line.',
          },
          title: {
            type: 'string',
            description: 'Short imperative title, no trailing period.',
          },
          body: {
            type: 'string',
            description: 'Actionable explanation in Chinese. Include concrete impact and fix direction.',
          },
          suggestion: {
            type: 'string',
            description: 'Optional replacement code only, no markdown fences. Empty string if no exact suggestion.',
          },
        },
      },
    },
  },
};

export class OpenAIReviewClient {
  constructor({
    apiKey,
    baseUrl = 'https://api.openai.com/v1',
    model = 'gpt-5.5',
    apiMode = 'responses',
    reasoningEffort = '',
    reasoningSummary = '',
    timeoutMs = 120_000,
    retries = 2,
  }) {
    if (!apiKey) throw new Error('OPENAI_API_KEY is required');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
    this.apiMode = normalizeApiMode(apiMode);
    this.reasoningEffort = normalizeReasoningEffort(reasoningEffort);
    this.reasoningSummary = normalizeReasoningSummary(reasoningSummary);
    this.timeoutMs = timeoutMs;
    this.retries = retries;
  }

  async review({ repo, pr, rulesText, diffText }) {
    const system = buildSystemPrompt();
    const user = buildUserPrompt({ repo, pr, rulesText, diffText });

    if (this.apiMode === 'chat') {
      return this.reviewWithChatCompletions({ system, user });
    }

    const payload = {
      model: this.model,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: system }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: user }],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'github_pr_review',
          strict: true,
          schema: REVIEW_SCHEMA,
        },
      },
      max_output_tokens: 6000,
    };

    const reasoning = buildResponsesReasoningConfig({
      effort: this.reasoningEffort,
      summary: this.reasoningSummary,
    });
    if (reasoning) payload.reasoning = reasoning;

    const response = await this.request('/responses', payload);
    const text = extractResponseText(response);
    if (!text) {
      throw new Error('OpenAI response did not contain output text');
    }

    const parsed = parseJsonObject(text);
    return normalizeReview(parsed);
  }

  async reviewWithChatCompletions({ system, user }) {
    const payload = {
      model: this.model,
      messages: [
        { role: 'system', content: `${system}\n\n${CHAT_JSON_INSTRUCTIONS}\n\n你必须只输出一个 JSON 对象，不要使用 markdown 代码围栏。` },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    };

    if (this.reasoningEffort) {
      payload.reasoning_effort = this.reasoningEffort;
    }

    const response = await this.request('/chat/completions', payload);
    const text = response?.choices?.[0]?.message?.content || '';
    if (!text) {
      throw new Error('OpenAI chat completion did not contain message content');
    }
    return normalizeReview(parseJsonObject(text));
  }

  async request(path, payload) {
    try {
      return await requestJsonWithRetry(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }, {
        timeoutMs: this.timeoutMs,
        retries: this.retries,
        retryUnsafe: true,
      });
    } catch (error) {
      throw new Error(`OpenAI API request failed: ${error.message}`);
    }
  }
}

export function buildSystemPrompt() {
  return `你是一个严格但克制的 GitHub PR 代码审查机器人。你的目标是找出真实、可操作、和本次 diff 直接相关的问题。

${BUILTIN_REVIEW_POLICY}

审查原则：
- 只审查给出的 diff，不要假设未展示的代码行为。
- 优先发现正确性、安全性、数据丢失、并发、资源泄漏、兼容性、边界条件、测试缺口。
- 不要给泛泛风格建议，不要重复已有代码显然已经处理的问题。
- 每条 finding 必须能定位到 diff 中可评论的行。
- path 必须完全等于 diff 标题中的文件路径。
- line 必须使用表格里的 new_line 配合 side=RIGHT，或 old_line 配合 side=LEFT。优先使用 RIGHT。
- suggestion 只能放替换代码本身，不要包含 markdown 代码围栏；没有精确修复就填空字符串。
- 如果没有值得评论的问题，findings 返回空数组。

严重级别：
- P0：会导致严重安全事故、数据破坏、服务不可用，必须立刻阻断。
- P1：高风险 bug 或安全问题，通常应该阻断合并。
- P2：明确缺陷或维护风险，建议修复但不一定阻断。
- P3：轻微问题、可读性或小范围改进。

输出必须是符合 JSON schema 的中文 JSON，不要输出额外解释。`;
}

export function buildUserPrompt({ repo, pr, rulesText, diffText }) {
  return `请审查这个 GitHub Pull Request。

仓库：${repo.owner}/${repo.name}
PR：#${pr.number} ${pr.title || ''}
作者：${pr.user?.login || 'unknown'}
Base：${pr.base?.ref || 'unknown'}
Head：${pr.head?.ref || 'unknown'}

# 仓库审查规则
${rulesText}

# Diff
下面的 diff 已经标注 old_line / new_line。请只在这些可见行上评论。

${diffText}`;
}

const CHAT_JSON_INSTRUCTIONS = `chat/completions 兼容模式输出结构：
{
  "summary": "中文摘要",
  "findings": [
    {
      "severity": "P0|P1|P2|P3",
      "path": "diff 中的文件路径",
      "line": 123,
      "start_line": null,
      "side": "RIGHT|LEFT",
      "title": "简短标题",
      "body": "中文说明",
      "suggestion": "可选替换代码；没有则为空字符串"
    }
  ]
}`;

function extractResponseText(response) {
  if (typeof response.output_text === 'string') return response.output_text;

  const chunks = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') chunks.push(content.text);
      if (typeof content.output_text === 'string') chunks.push(content.output_text);
    }
  }
  return chunks.join('\n').trim();
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = /\{[\s\S]*\}/.exec(text);
    if (!match) throw new Error('OpenAI output was not valid JSON');
    return JSON.parse(match[0]);
  }
}

function normalizeReview(review) {
  return {
    summary: String(review?.summary || '').trim() || '未发现需要特别说明的问题。',
    findings: Array.isArray(review?.findings) ? review.findings.map(normalizeFinding) : [],
  };
}

function normalizeFinding(finding) {
  return {
    severity: String(finding.severity || 'P3').toUpperCase(),
    path: String(finding.path || '').trim(),
    line: Number(finding.line),
    start_line: finding.start_line == null ? null : Number(finding.start_line),
    side: String(finding.side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT',
    title: String(finding.title || '').trim(),
    body: String(finding.body || '').trim(),
    suggestion: String(finding.suggestion || '').trim(),
  };
}

function normalizeApiMode(value) {
  const mode = String(value || 'responses').trim().toLowerCase();
  if (['chat', 'chat_completions', 'chat-completions'].includes(mode)) return 'chat';
  return 'responses';
}

function normalizeReasoningEffort(value) {
  const effort = String(value || '').trim().toLowerCase().replace(/[_-]/g, '');
  if (!effort || ['off', 'false', 'disabled'].includes(effort)) return '';
  if (['xhigh', 'xlarge', 'extra'].includes(effort)) return 'xhigh';
  return effort;
}

function normalizeReasoningSummary(value) {
  const summary = String(value || '').trim().toLowerCase();
  if (!summary || ['none', 'off', 'false', 'disabled'].includes(summary)) return '';
  return summary;
}

function buildResponsesReasoningConfig({ effort, summary }) {
  const reasoning = {};
  if (effort) reasoning.effort = effort;
  if (summary) reasoning.summary = summary;
  return Object.keys(reasoning).length ? reasoning : null;
}


