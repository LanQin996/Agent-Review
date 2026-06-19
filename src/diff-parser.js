export function parsePatch(patch = '') {
  const hunks = [];
  const rightLines = new Set();
  const leftLines = new Set();
  const addedLines = new Set();
  const deletedLines = new Set();
  const contextRightLines = new Set();
  const contextLeftLines = new Set();

  let current = null;
  let oldLine = 0;
  let newLine = 0;

  for (const rawLine of String(patch || '').split('\n')) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(rawLine);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[3]);
      current = {
        oldStart: oldLine,
        oldCount: Number(header[2] || '1'),
        newStart: newLine,
        newCount: Number(header[4] || '1'),
        heading: header[5]?.trim() || '',
        lines: [],
      };
      hunks.push(current);
      continue;
    }

    if (!current) continue;

    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      current.lines.push({ type: 'add', oldLine: null, newLine, text: rawLine.slice(1), raw: rawLine });
      rightLines.add(newLine);
      addedLines.add(newLine);
      newLine += 1;
    } else if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
      current.lines.push({ type: 'del', oldLine, newLine: null, text: rawLine.slice(1), raw: rawLine });
      leftLines.add(oldLine);
      deletedLines.add(oldLine);
      oldLine += 1;
    } else if (rawLine.startsWith(' ')) {
      const text = rawLine.slice(1);
      current.lines.push({ type: 'context', oldLine, newLine, text, raw: rawLine });
      rightLines.add(newLine);
      leftLines.add(oldLine);
      contextRightLines.add(newLine);
      contextLeftLines.add(oldLine);
      oldLine += 1;
      newLine += 1;
    } else if (rawLine.startsWith('\\')) {
      current.lines.push({ type: 'meta', oldLine: null, newLine: null, text: rawLine, raw: rawLine });
    }
  }

  return {
    hunks,
    rightLines,
    leftLines,
    addedLines,
    deletedLines,
    contextRightLines,
    contextLeftLines,
  };
}

export function annotatePatch(patch = '') {
  const parsed = parsePatch(patch);
  const output = [];

  for (const hunk of parsed.hunks) {
    output.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@ ${hunk.heading}`.trimEnd());
    output.push('old_line | new_line | diff');
    for (const line of hunk.lines) {
      const oldDisplay = line.oldLine == null ? '-' : String(line.oldLine);
      const newDisplay = line.newLine == null ? '-' : String(line.newLine);
      output.push(`${oldDisplay.padStart(8)} | ${newDisplay.padStart(8)} | ${line.raw}`);
    }
  }

  return output.join('\n');
}

export function buildFileIndex(files) {
  const index = new Map();
  for (const file of files) {
    const parsed = parsePatch(file.patch || '');
    index.set(file.filename, { file, ...parsed });
  }
  return index;
}

export function validateFindingLocation(finding, fileIndex) {
  const path = String(finding.path || '').trim();
  const line = Number(finding.line);
  const side = String(finding.side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
  const startLine = finding.start_line == null ? null : Number(finding.start_line);

  const indexed = fileIndex.get(path);
  if (!indexed) {
    return { ok: false, reason: `path is not in changed files: ${path}` };
  }
  if (!Number.isInteger(line) || line <= 0) {
    return { ok: false, reason: `invalid line: ${finding.line}` };
  }

  const allowed = side === 'LEFT' ? indexed.leftLines : indexed.rightLines;
  if (!allowed.has(line)) {
    return { ok: false, reason: `${path}:${line} is not commentable on ${side} side of the diff` };
  }

  if (startLine != null) {
    if (!Number.isInteger(startLine) || startLine <= 0 || startLine > line) {
      return { ok: false, reason: `invalid start_line: ${finding.start_line}` };
    }
    if (!allowed.has(startLine)) {
      return { ok: false, reason: `${path}:${startLine} start_line is not commentable on ${side} side of the diff` };
    }
  }

  return { ok: true, path, line, side, startLine };
}

export function serializeChangedFilesForPrompt(files, options = {}) {
  const maxFiles = options.maxFiles || 80;
  const maxPatchBytes = options.maxPatchBytes || 180_000;
  const selected = [];
  let usedBytes = 0;

  for (const file of files.slice(0, maxFiles)) {
    if (!file.patch) continue;
    const annotated = annotatePatch(file.patch);
    const block = [
      `## ${file.filename}`,
      `status: ${file.status}; additions: ${file.additions}; deletions: ${file.deletions}; changes: ${file.changes}`,
      file.previous_filename ? `previous_filename: ${file.previous_filename}` : '',
      '```diff',
      annotated,
      '```',
    ].filter(Boolean).join('\n');

    const blockBytes = Buffer.byteLength(block, 'utf8');
    if (usedBytes + blockBytes > maxPatchBytes) {
      selected.push(`\n[Diff truncated before ${file.filename}; maxPatchBytes=${maxPatchBytes}]`);
      break;
    }
    selected.push(block);
    usedBytes += blockBytes;
  }

  if (files.length > maxFiles) {
    selected.push(`\n[Only first ${maxFiles} changed files were included out of ${files.length}.]`);
  }

  return selected.join('\n\n');
}
