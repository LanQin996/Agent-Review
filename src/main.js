import { readFileSync } from 'node:fs';
import { parseArgs, printHelp } from './cli.js';
import { GitHubClient } from './github.js';
import { OpenAIReviewClient } from './openai-review.js';
import { serializeChangedFilesForPrompt, buildFileIndex, validateFindingLocation } from './diff-parser.js';
import { loadRuleFiles, formatRulesForPrompt } from './rules.js';
import { loadIgnorePatterns, filterIgnoredFiles, summarizeIgnoredFiles } from './ignore.js';
import { buildReviewBody, toGitHubReviewComments, normalizeSummaryMode, shouldCreateReviewSummary, shouldUpsertIssueSummary, REVIEW_MARKER, SUMMARY_MARKER } from './formatter.js';
import { resolveReviewEvent, resolveNoDiffReviewEvent, describeReviewPolicy } from './approval.js';
import { extractFindingFingerprintsFromComments, filterDuplicateFindings } from './dedupe.js';
import { upsertSummaryComment } from './summary.js';
import { isAtOrAboveSeverity, normalizeSeverity, sortBySeverityThenPath } from './severity.js';

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv, env);

  if (args.help) {
    printHelp();
    return;
  }

  if (args.version) {
    console.log(readPackageVersion());
    return;
  }

  validateRequiredArgs(args);

  const github = new GitHubClient({
    token: args.githubToken,
    owner: args.owner,
    repo: args.repo,
    apiUrl: args.githubApiUrl,
    timeoutMs: args.githubTimeoutMs,
    retries: args.githubRetries,
  });

  console.error(`[ai-pr-reviewer] Loading PR #${args.prNumber} from ${args.owner}/${args.repo}...`);
  const pr = await github.getPullRequest(args.prNumber);
  const files = await github.listPullRequestFiles(args.prNumber);
  const commitId = args.commitId || pr?.head?.sha;
  const summaryMode = normalizeSummaryMode(args.summaryMode);
  const ignorePatterns = loadIgnorePatterns(args.ignoreFiles);
  const { included: includedFiles, ignored: ignoredFilesRaw } = filterIgnoredFiles(files, ignorePatterns);
  const ignoredFiles = summarizeIgnoredFiles(ignoredFilesRaw);

  if (!commitId) throw new Error('Could not determine PR head commit SHA');

  const reviewableFiles = includedFiles.filter((file) => file.patch);
  const diffText = serializeChangedFilesForPrompt(reviewableFiles, {
    maxFiles: args.maxFiles,
    maxPatchBytes: args.maxPatchBytes,
  });

  if (!diffText.trim()) {
    const body = `${REVIEW_MARKER}\n${SUMMARY_MARKER}\n## 🤖 AI PR Review\n\n本次 PR 没有可审查的文本 diff。\n\n**Reviewed commit:** \`${commitId.slice(0, 10)}\``;
    const noDiffEvent = resolveNoDiffReviewEvent({
      configuredEvent: args.reviewEvent,
      approveWhenClean: args.approveWhenClean,
    });
    if (args.dryRun) {
      console.log(JSON.stringify({ body, comments: [], review_event: noDiffEvent, summary_mode: summaryMode, ignored_files: ignoredFiles }, null, 2));
      return;
    }
    if (shouldUpsertIssueSummary(summaryMode)) {
      await upsertSummaryComment(github, args.prNumber, body);
    }
    if (shouldCreateReviewSummary(summaryMode) || noDiffEvent !== 'COMMENT') {
      await github.createReview(args.prNumber, { commit_id: commitId, body, event: noDiffEvent, comments: [] });
    }
    return;
  }

  const rules = loadRuleFiles(args.ruleFiles);
  const rulesText = formatRulesForPrompt(rules);

  console.error(`[ai-pr-reviewer] Reviewing ${reviewableFiles.length}/${files.length} changed files with ${args.model} (${args.openaiApiMode}); ignored=${ignoredFiles.length}...`);
  const openai = new OpenAIReviewClient({
    apiKey: args.openaiApiKey,
    baseUrl: args.openaiBaseUrl,
    model: args.model,
    apiMode: args.openaiApiMode,
    timeoutMs: args.openaiTimeoutMs,
    retries: args.openaiRetries,
  });

  const review = await openai.review({
    repo: { owner: args.owner, name: args.repo },
    pr,
    rulesText,
    diffText,
  });

  const { validFindings, skippedFindings } = prepareFindings(review.findings, reviewableFiles, args);
  const existingComments = args.dryRun ? [] : await github.listReviewComments(args.prNumber);
  const existingFingerprints = extractFindingFingerprintsFromComments(existingComments);
  const { fresh: freshFindings, duplicates: duplicateFindings } = filterDuplicateFindings(validFindings, existingFingerprints);
  const skippedWithDuplicates = [...skippedFindings, ...duplicateFindings];
  const comments = toGitHubReviewComments(freshFindings);
  const reviewEvent = resolveReviewEvent({
    configuredEvent: args.reviewEvent,
    validFindings,
    requestChangesOn: args.requestChangesOn,
    approveWhenClean: args.approveWhenClean,
  });
  const policyText = describeReviewPolicy({
    configuredEvent: args.reviewEvent,
    requestChangesOn: args.requestChangesOn,
    approveWhenClean: args.approveWhenClean,
  });
  const body = buildReviewBody({ review, validFindings: freshFindings, skippedFindings: skippedWithDuplicates, commitId, model: args.model, reviewEvent, policyText });

  if (args.dryRun) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      repository: `${args.owner}/${args.repo}`,
      pull_request: args.prNumber,
      commit_id: commitId,
      body,
      review_event: reviewEvent,
      summary_mode: summaryMode,
      ignored_files: ignoredFiles,
      comments,
      raw_review: review,
      duplicate_findings: duplicateFindings,
      skipped_findings: skippedWithDuplicates,
    }, null, 2));
  } else {
    if (shouldUpsertIssueSummary(summaryMode)) {
      console.error('[ai-pr-reviewer] Upserting summary issue comment...');
      await upsertSummaryComment(github, args.prNumber, body);
    }

    const createReviewSummary = shouldCreateReviewSummary(summaryMode);
    const shouldPostReview = comments.length > 0 || createReviewSummary || reviewEvent !== 'COMMENT';
    if (shouldPostReview) {
      const reviewBody = createReviewSummary || reviewEvent !== 'COMMENT' ? body : '';
      console.error(`[ai-pr-reviewer] Posting review with ${comments.length} inline comments...`);
      await github.createReview(args.prNumber, {
        commit_id: commitId,
        body: reviewBody,
        event: reviewEvent,
        comments,
      });
      console.error('[ai-pr-reviewer] Review posted.');
    } else {
      console.error('[ai-pr-reviewer] No review posted; summary mode does not require a review and there are no inline comments.');
    }
  }

  if (args.failOn && validFindings.some((finding) => isAtOrAboveSeverity(finding.severity, args.failOn))) {
    console.error(`[ai-pr-reviewer] Failing because at least one finding is at or above ${args.failOn}.`);
    process.exitCode = 1;
  }
}

export function prepareFindings(findings, files, args) {
  const fileIndex = buildFileIndex(files);
  const validFindings = [];
  const skippedFindings = [];
  const seen = new Set();

  for (const rawFinding of findings || []) {
    const finding = {
      ...rawFinding,
      severity: normalizeSeverity(rawFinding.severity),
      side: String(rawFinding.side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT',
      line: Number(rawFinding.line),
      start_line: rawFinding.start_line == null ? null : Number(rawFinding.start_line),
    };

    if (!isAtOrAboveSeverity(finding.severity, args.severityThreshold)) {
      skippedFindings.push({ finding, reason: `severity below threshold ${args.severityThreshold}` });
      continue;
    }

    const validation = validateFindingLocation(finding, fileIndex);
    if (!validation.ok) {
      skippedFindings.push({ finding, reason: validation.reason });
      continue;
    }

    const dedupeKey = `${finding.path}:${finding.side}:${finding.start_line || ''}:${finding.line}:${finding.title}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    validFindings.push({
      ...finding,
      path: validation.path,
      line: validation.line,
      start_line: validation.startLine,
      side: validation.side,
    });
  }

  validFindings.sort(sortBySeverityThenPath);
  return {
    validFindings: validFindings.slice(0, args.maxComments),
    skippedFindings,
  };
}

function validateRequiredArgs(args) {
  const missing = [];
  if (!args.owner || !args.repo) missing.push('GITHUB_REPOSITORY or --repo owner/name');
  if (!args.prNumber) missing.push('PR_NUMBER or --pr');
  if (!args.githubToken) missing.push('GITHUB_TOKEN');
  if (!args.openaiApiKey) missing.push('OPENAI_API_KEY');

  if (missing.length) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
}

function readPackageVersion() {
  try {
    const url = new URL('../package.json', import.meta.url);
    return JSON.parse(readFileSync(url, 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}
