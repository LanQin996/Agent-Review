import { isAtOrAboveSeverity } from './severity.js';

export function resolveReviewEvent({ configuredEvent = 'AUTO', validFindings = [], requestChangesOn = 'P1', approveWhenClean = false } = {}) {
  const event = String(configuredEvent || 'AUTO').trim().toUpperCase();
  if (['COMMENT', 'REQUEST_CHANGES', 'APPROVE'].includes(event)) return event;

  const shouldRequestChanges = validFindings.some((finding) => isAtOrAboveSeverity(finding.severity, requestChangesOn));
  if (shouldRequestChanges) return 'REQUEST_CHANGES';
  if (validFindings.length === 0 && approveWhenClean) return 'APPROVE';
  return 'COMMENT';
}

export function resolveNoDiffReviewEvent({ configuredEvent = 'AUTO', approveWhenClean = false } = {}) {
  const event = String(configuredEvent || 'AUTO').trim().toUpperCase();
  if (['COMMENT', 'REQUEST_CHANGES', 'APPROVE'].includes(event)) return event;
  // 二进制/超大/不可解析 diff 不应被默认自动批准；除非调用方显式开启。
  return approveWhenClean ? 'APPROVE' : 'COMMENT';
}

export function describeReviewPolicy({ configuredEvent = 'AUTO', requestChangesOn = 'P1', approveWhenClean = false } = {}) {
  const event = String(configuredEvent || 'AUTO').trim().toUpperCase();
  if (['COMMENT', 'REQUEST_CHANGES', 'APPROVE'].includes(event)) {
    return `manual:${event}`;
  }
  return `AUTO: >=${requestChangesOn} => REQUEST_CHANGES; clean => ${approveWhenClean ? 'APPROVE' : 'COMMENT'}; otherwise COMMENT`;
}
