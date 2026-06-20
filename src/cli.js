import { readFileSync } from 'node:fs';

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const args = {
    post: false,
    dryRun: false,
    failOn: env.FAIL_ON || '',
    maxFiles: parseInteger(env.MAX_FILES, 80),
    maxPatchBytes: parseInteger(env.MAX_PATCH_BYTES, 180_000),
    maxComments: parseInteger(env.MAX_COMMENTS, 30),
    model: env.OPENAI_MODEL || 'gpt-5.5',
    openaiApiMode: env.OPENAI_API_MODE || 'responses',
    reasoningEffort: normalizeReasoningEffort(env.OPENAI_REASONING_EFFORT || ''),
    reasoningSummary: normalizeReasoningSummary(env.OPENAI_REASONING_SUMMARY || ''),
    openaiTimeoutMs: parseInteger(env.OPENAI_TIMEOUT_MS, 120_000),
    openaiRetries: parseNonNegativeInteger(env.OPENAI_RETRIES, 2),
    githubTimeoutMs: parseInteger(env.GITHUB_TIMEOUT_MS, 30_000),
    githubRetries: parseNonNegativeInteger(env.GITHUB_RETRIES, 2),
    rules: env.REVIEW_RULES || '.github/ai-review.md,AGENTS.md',
    ignore: env.REVIEW_IGNORE || '.ai-reviewignore',
    summaryMode: env.SUMMARY_MODE || 'review',
    reviewEvent: env.REVIEW_EVENT || 'AUTO',
    requestChangesOn: env.REQUEST_CHANGES_ON || 'P1',
    approveWhenClean: parseBoolean(env.APPROVE_WHEN_CLEAN, false),
    severityThreshold: env.REVIEW_SEVERITY_THRESHOLD || 'P3',
    includeUntouchedContext: false,
    githubApiUrl: env.GITHUB_API_URL || 'https://api.github.com',
    openaiBaseUrl: env.OPENAI_BASE_URL || env.OPENAI_API_BASE || env.OPENAI_API_URL || 'https://api.openai.com/v1',
    openaiApiKey: env.OPENAI_API_KEY || '',
    githubToken: env.GITHUB_TOKEN || '',
    repository: env.GITHUB_REPOSITORY || '',
    prNumber: env.PR_NUMBER || env.GITHUB_PR_NUMBER || '',
    commitId: env.PR_HEAD_SHA || env.GITHUB_SHA || '',
    owner: '',
    repo: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--post') args.post = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--include-untouched-context') args.includeUntouchedContext = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--version' || arg === '-v') args.version = true;
    else if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
      const value = eq >= 0 ? arg.slice(eq + 1) : argv[++index];
      if (value === undefined) throw new Error(`Missing value for --${key}`);
      setOption(args, key, value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.post) args.dryRun = true;

  if (args.repository && !args.owner && !args.repo) {
    const [owner, repo] = args.repository.split('/');
    args.owner = owner || '';
    args.repo = repo || '';
  }

  if (!args.prNumber && env.GITHUB_EVENT_PATH) {
    const fromEvent = readPrNumberFromEvent(env.GITHUB_EVENT_PATH);
    if (fromEvent) args.prNumber = String(fromEvent);
  }

  if (!args.commitId && env.GITHUB_EVENT_PATH) {
    const fromEvent = readHeadShaFromEvent(env.GITHUB_EVENT_PATH);
    if (fromEvent) args.commitId = fromEvent;
  }

  args.prNumber = args.prNumber ? Number(args.prNumber) : 0;
  args.ruleFiles = splitCsv(args.rules);
  args.ignoreFiles = splitCsv(args.ignore);
  return args;
}

function setOption(args, key, value) {
  const normalized = key.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
  switch (normalized) {
    case 'repo':
      args.repository = value;
      break;
    case 'owner':
      args.owner = value;
      break;
    case 'repository':
      args.repository = value;
      break;
    case 'pr':
    case 'prNumber':
      args.prNumber = value;
      break;
    case 'model':
      args.model = value;
      break;
    case 'openaiApiMode':
      args.openaiApiMode = value;
      break;
    case 'reasoningEffort':
    case 'openaiReasoningEffort':
      args.reasoningEffort = normalizeReasoningEffort(value);
      break;
    case 'reasoningSummary':
    case 'openaiReasoningSummary':
      args.reasoningSummary = normalizeReasoningSummary(value);
      break;
    case 'openaiTimeoutMs':
    case 'githubTimeoutMs':
      args[normalized] = parseInteger(value, args[normalized]);
      break;
    case 'openaiRetries':
    case 'githubRetries':
      args[normalized] = parseNonNegativeInteger(value, args[normalized]);
      break;
    case 'rules':
      args.rules = value;
      break;
    case 'ignore':
      args.ignore = value;
      break;
    case 'summaryMode':
      args.summaryMode = value;
      break;
    case 'maxFiles':
    case 'maxPatchBytes':
    case 'maxComments':
      args[normalized] = parseInteger(value, args[normalized]);
      break;
    case 'failOn':
      args.failOn = value;
      break;
    case 'reviewEvent':
      args.reviewEvent = value;
      break;
    case 'requestChangesOn':
      args.requestChangesOn = value;
      break;
    case 'approveWhenClean':
      args.approveWhenClean = parseBoolean(value, args.approveWhenClean);
      break;
    case 'severityThreshold':
      args.severityThreshold = value;
      break;
    case 'openaiBaseUrl':
      args.openaiBaseUrl = value;
      break;
    case 'githubApiUrl':
      args.githubApiUrl = value;
      break;
    default:
      throw new Error(`Unknown option: --${key}`);
  }
}

function parseBoolean(value, fallback) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeReasoningEffort(value) {
  const effort = String(value || '').trim().toLowerCase().replace(/[_-]/g, '');
  if (!effort || ['none', 'off', 'false', 'disabled'].includes(effort)) return '';
  if (['xhigh', 'xlarge', 'extra'].includes(effort)) return 'xhigh';
  return effort;
}

function normalizeReasoningSummary(value) {
  return String(value || '').trim().toLowerCase();
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readPrNumberFromEvent(path) {
  try {
    const event = JSON.parse(readFile(path));
    return event?.pull_request?.number || event?.number || 0;
  } catch {
    return 0;
  }
}

function readHeadShaFromEvent(path) {
  try {
    const event = JSON.parse(readFile(path));
    return event?.pull_request?.head?.sha || '';
  } catch {
    return '';
  }
}

function readFile(path) {
  return readFileSync(path, 'utf8');
}

export function printHelp() {
  console.log(`github-ai-pr-reviewer

Usage:
  github-ai-pr-reviewer --post
  github-ai-pr-reviewer --dry-run --repo owner/name --pr 123

Options:
  --post                         Post GitHub PR review comments.
  --dry-run                      Print generated review JSON instead of posting.
  --repo owner/name              GitHub repository. Defaults to GITHUB_REPOSITORY.
  --pr 123                       Pull request number. Defaults to PR_NUMBER or event payload.
  --model model                  OpenAI model. Defaults to OPENAI_MODEL or gpt-5.5.
  --openai-api-mode responses    responses or chat. Defaults to OPENAI_API_MODE or responses.
  --reasoning-effort xhigh       Reasoning effort: none, minimal, low, medium, high, or xhigh.
  --reasoning-summary auto       Responses API reasoning summary: auto, concise, or detailed.
  --openai-timeout-ms 120000     OpenAI request timeout.
  --openai-retries 2             OpenAI retry count for transient failures.
  --openai-base-url url          OpenAI-compatible API base URL. Defaults to OPENAI_BASE_URL or https://api.openai.com/v1.
  --rules file1,file2            Rule files. Defaults to .github/ai-review.md,AGENTS.md.
  --ignore file1,file2           Ignore files. Defaults to .ai-reviewignore.
  --summary-mode review          review, comment, both, or none.
  --github-timeout-ms 30000      GitHub API request timeout.
  --github-retries 2             GitHub API retry count for safe requests.
  --max-files n                  Maximum changed files to include.
  --max-patch-bytes n            Maximum combined patch bytes sent to model.
  --max-comments n               Maximum inline comments to post.
  --fail-on P1                   Exit non-zero if findings at or above severity exist.
  --review-event AUTO|COMMENT|REQUEST_CHANGES|APPROVE
                                 GitHub review event. Defaults to AUTO.
  --request-changes-on P1        In AUTO mode, request changes at or above this severity. Defaults to P1.
  --approve-when-clean true      In AUTO mode, approve if no findings. Defaults to false.
  --severity-threshold P2        Lowest severity to post. Defaults to P3.
`);
}
