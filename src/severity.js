export const SEVERITY_RANK = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

export function normalizeSeverity(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return Object.hasOwn(SEVERITY_RANK, normalized) ? normalized : 'P3';
}

export function isAtOrAboveSeverity(severity, threshold) {
  const actual = SEVERITY_RANK[normalizeSeverity(severity)];
  const limit = SEVERITY_RANK[normalizeSeverity(threshold)];
  return actual <= limit;
}

export function sortBySeverityThenPath(a, b) {
  const rankDelta = SEVERITY_RANK[normalizeSeverity(a.severity)] - SEVERITY_RANK[normalizeSeverity(b.severity)];
  if (rankDelta !== 0) return rankDelta;
  const pathDelta = String(a.path || '').localeCompare(String(b.path || ''));
  if (pathDelta !== 0) return pathDelta;
  return Number(a.line || 0) - Number(b.line || 0);
}
