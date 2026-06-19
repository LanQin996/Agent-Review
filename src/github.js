export class GitHubClient {
  constructor({ token, owner, repo, apiUrl = 'https://api.github.com' }) {
    if (!token) throw new Error('GITHUB_TOKEN is required');
    if (!owner || !repo) throw new Error('GitHub owner/repo is required');
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.apiUrl = apiUrl.replace(/\/$/, '');
  }

  async getPullRequest(prNumber) {
    return this.request(`/repos/${this.owner}/${this.repo}/pulls/${prNumber}`);
  }

  async listPullRequestFiles(prNumber) {
    const files = [];
    for (let page = 1; page <= 20; page += 1) {
      const batch = await this.request(`/repos/${this.owner}/${this.repo}/pulls/${prNumber}/files?per_page=100&page=${page}`);
      files.push(...batch);
      if (batch.length < 100) break;
    }
    return files;
  }

  async createReview(prNumber, payload) {
    return this.request(`/repos/${this.owner}/${this.repo}/pulls/${prNumber}/reviews`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async createIssueComment(prNumber, body) {
    return this.request(`/repos/${this.owner}/${this.repo}/issues/${prNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  async request(path, init = {}) {
    const response = await fetch(`${this.apiUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ai-pr-reviewer',
        ...(init.headers || {}),
      },
    });

    const text = await response.text();
    const data = text ? safeJson(text) : null;
    if (!response.ok) {
      const message = data?.message || text || response.statusText;
      throw new Error(`GitHub API ${response.status} ${response.statusText}: ${message}`);
    }
    return data;
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
