const COMMENT_MARKER_PREFIX = '<!-- ai-pr-reviewer:finding ';

export function buildFindingFingerprint(finding) {
  const parts = [
    normalize(finding.severity),
    normalize(finding.path),
    normalize(finding.side || 'RIGHT'),
    String(Number(finding.start_line || 0)),
    String(Number(finding.line || 0)),
    normalize(finding.title),
  ];
  return hashString(parts.join('|'));
}

export function buildFindingMarker(finding) {
  return `${COMMENT_MARKER_PREFIX}${buildFindingFingerprint(finding)} -->`;
}

export function extractFindingFingerprintsFromComments(comments = []) {
  const fingerprints = new Set();
  const pattern = /<!--\s*ai-pr-reviewer:finding\s+([a-z0-9]+)\s*-->/gi;

  for (const comment of comments) {
    const body = String(comment?.body || '');
    let match;
    while ((match = pattern.exec(body))) {
      fingerprints.add(match[1]);
    }
  }

  return fingerprints;
}

export function filterDuplicateFindings(findings, existingFingerprints) {
  const fresh = [];
  const duplicates = [];

  for (const finding of findings) {
    const fingerprint = buildFindingFingerprint(finding);
    if (existingFingerprints.has(fingerprint)) {
      duplicates.push({ finding, fingerprint, reason: 'duplicate existing ai-pr-reviewer comment' });
    } else {
      fresh.push({ ...finding, fingerprint });
    }
  }

  return { fresh, duplicates };
}

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function hashString(value) {
  // FNV-1a 32-bit, stable enough for comment de-duplication markers.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
