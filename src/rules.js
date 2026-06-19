import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_MAX_RULE_BYTES = 60_000;

export function loadRuleFiles(ruleFiles, cwd = process.cwd(), maxBytes = DEFAULT_MAX_RULE_BYTES) {
  const loaded = [];
  let remaining = maxBytes;

  for (const ruleFile of ruleFiles) {
    if (remaining <= 0) break;
    const absolutePath = resolve(cwd, ruleFile);
    if (!existsSync(absolutePath)) continue;

    const raw = readFileSync(absolutePath, 'utf8');
    const text = raw.length > remaining ? `${raw.slice(0, remaining)}\n\n[truncated]` : raw;
    remaining -= text.length;
    loaded.push({ path: ruleFile, text });
  }

  return loaded;
}

export function formatRulesForPrompt(rules) {
  if (!rules.length) {
    return 'No repository-specific review rule files were found.';
  }

  return rules
    .map((rule) => `### ${rule.path}\n\n${rule.text}`)
    .join('\n\n---\n\n');
}
