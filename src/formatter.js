import { normalizeSeverity } from './severity.js';
import { buildFindingMarker } from './dedupe.js';

export const REVIEW_MARKER = '<!-- ai-pr-reviewer -->';
export const SUMMARY_MARKER = '<!-- ai-pr-reviewer:summary -->';

export function buildReviewBody({
  review,
  validFindings,
  skippedFindings,
  commitId,
  model,
  reasoningEffort,
  reviewEvent,
  policyText,
}) {
  const counts = countBySeverity(validFindings);
  const total = validFindings.length;
  const countText = ['P0', 'P1', 'P2', 'P3']
    .filter((severity) => counts[severity])
    .map((severity) => `${severity}: ${counts[severity]}`)
    .join(', ') || '0';

  const skippedText = skippedFindings?.length
    ? `\n\n<details>\n<summary>已跳过/未重复发布 ${skippedFindings.length} 条模型输出</summary>\n\n${skippedFindings
        .slice(0, 10)
        .map((item) => `- ${item.finding?.path || 'unknown'}:${item.finding?.line || '?'} — ${item.reason}`)
        .join('\n')}\n\n</details>`
    : '';

  return `${REVIEW_MARKER}
${SUMMARY_MARKER}
## 🤖 AI PR Review

${review.summary}

**Reviewed commit:** \`${shortSha(commitId)}\`  
**Model:** \`${model}\`  
${reasoningEffort ? `**Reasoning effort:** \`${reasoningEffort}\`  \n` : ''}
**Review event:** \`${reviewEvent || 'COMMENT'}\`  
${policyText ? `**Policy:** ${policyText}  \n` : ''}**Inline findings:** ${total} (${countText})${skippedText}

> 自动审查只基于本次 PR diff 和仓库规则；请结合人工判断决定是否采纳。`;
}

export function buildCommentBody(finding) {
  const severity = normalizeSeverity(finding.severity);
  const title = finding.title || 'Review suggestion';
  const body = finding.body || '';
  const suggestion = String(finding.suggestion || '').trim();

  const parts = [
    buildFindingMarker(finding),
    `${badge(severity)} **${escapeMarkdown(title)}**`,
    '',
    body,
  ];

  if (suggestion) {
    parts.push('', '```suggestion', suggestion, '```');
  }

  return parts.join('\n');
}

export function normalizeSummaryMode(value) {
  const mode = String(value || 'review').trim().toLowerCase();
  if (['review', 'comment', 'both', 'none'].includes(mode)) return mode;
  return 'review';
}

export function shouldCreateReviewSummary(mode) {
  const normalized = normalizeSummaryMode(mode);
  return normalized === 'review' || normalized === 'both';
}

export function shouldUpsertIssueSummary(mode) {
  const normalized = normalizeSummaryMode(mode);
  return normalized === 'comment' || normalized === 'both';
}

export function toGitHubReviewComments(findings) {
  return findings.map((finding) => {
    const comment = {
      path: finding.path,
      line: Number(finding.line),
      side: finding.side || 'RIGHT',
      body: buildCommentBody(finding),
    };

    if (finding.start_line != null && Number(finding.start_line) !== Number(finding.line)) {
      comment.start_line = Number(finding.start_line);
      comment.start_side = finding.side || 'RIGHT';
    }

    return comment;
  });
}

function badge(severity) {
  return {
    P0: '🟥 `P0`',
    P1: '🟧 `P1`',
    P2: '🟨 `P2`',
    P3: '🟦 `P3`',
  }[severity] || '🟦 `P3`';
}

function countBySeverity(findings) {
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const finding of findings) counts[normalizeSeverity(finding.severity)] += 1;
  return counts;
}

function shortSha(value) {
  return value ? String(value).slice(0, 10) : 'unknown';
}

function escapeMarkdown(value) {
  return String(value).replace(/[<>]/g, '');
}
