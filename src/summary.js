import { SUMMARY_MARKER } from './formatter.js';

export async function upsertSummaryComment(github, prNumber, body) {
  const comments = await github.listIssueComments(prNumber);
  const existing = comments
    .filter((comment) => String(comment?.body || '').includes(SUMMARY_MARKER))
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0];

  if (existing?.id) {
    return github.updateIssueComment(existing.id, body);
  }

  return github.createIssueComment(prNumber, body);
}
