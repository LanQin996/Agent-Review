import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_PATTERNS = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'dist/**',
  'build/**',
  'coverage/**',
  'generated/**',
  '**/*.min.js',
  '**/*.map',
  '**/*.snap',
];

export function loadIgnorePatterns(ignoreFiles = [], cwd = process.cwd()) {
  const patterns = [...DEFAULT_PATTERNS];

  for (const ignoreFile of ignoreFiles) {
    const absolutePath = resolve(cwd, ignoreFile);
    if (!existsSync(absolutePath)) continue;
    const text = readFileSync(absolutePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      patterns.push(trimmed);
    }
  }

  return patterns;
}

export function filterIgnoredFiles(files, patterns) {
  const included = [];
  const ignored = [];

  for (const file of files) {
    const matched = patterns.find((pattern) => matchesPattern(file.filename, pattern));
    if (matched) ignored.push({ file, pattern: matched });
    else included.push(file);
  }

  return { included, ignored };
}


export function summarizeIgnoredFiles(ignoredFiles) {
  return ignoredFiles.map(({ file, pattern }) => ({
    filename: file.filename,
    status: file.status,
    pattern,
  }));
}

export function matchesPattern(path, pattern) {
  const normalizedPath = normalizePath(path);
  const normalizedPattern = normalizePath(pattern);
  if (!normalizedPattern) return false;

  if (normalizedPattern.endsWith('/**')) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }

  if (!normalizedPattern.includes('*')) {
    return normalizedPath === normalizedPattern || normalizedPath.endsWith(`/${normalizedPattern}`);
  }

  if (normalizedPattern.startsWith('**/')) {
    const withoutGlobstar = normalizedPattern.slice(3);
    return matchesPattern(normalizedPath, withoutGlobstar) || globToRegExp(normalizedPattern).test(normalizedPath);
  }

  return globToRegExp(normalizedPattern).test(normalizedPath);
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function globToRegExp(pattern) {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === '*' && next === '*') {
      source += '.*';
      index += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`^${source}$`);
}

function escapeRegExp(char) {
  return char.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}
