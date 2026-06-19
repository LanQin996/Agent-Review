import { requestJsonWithRetry } from './http.js';

export class GitHubClient {
  constructor({ token, owner, repo, apiUrl = 'https://api.github.com', timeoutMs = 30_000, retries = 2 }) {
    if (!token) throw new Error('GITHUB_TOKEN is required');
    if (!owner || !repo) throw new Error('GitHub owner/repo is required');
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
    this.retries = retries;
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

  async listReviewComments(prNumber) {
    const comments = [];
    for (let page = 1; page <= 20; page += 1) {
      const batch = await this.request(`/repos/${this.owner}/${this.repo}/pulls/${prNumber}/comments?per_page=100&page=${page}`);
      comments.push(...batch);
      if (batch.length < 100) break;
    }
    return comments;
  }

  async createReview(prNumber, payload) {
    return this.request(`/repos/${this.owner}/${this.repo}/pulls/${prNumber}/reviews`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async listIssueComments(prNumber) {
    const comments = [];
    for (let page = 1; page <= 20; page += 1) {
      const batch = await this.request(`/repos/${this.owner}/${this.repo}/issues/${prNumber}/comments?per_page=100&page=${page}`);
      comments.push(...batch);
      if (batch.length < 100) break;
    }
    return comments;
  }

  async createIssueComment(prNumber, body) {
    return this.request(`/repos/${this.owner}/${this.repo}/issues/${prNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  async updateIssueComment(commentId, body) {
    return this.request(`/repos/${this.owner}/${this.repo}/issues/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    });
  }

  async request(path, init = {}) {
    try {
      return await requestJsonWithRetry(`${this.apiUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'ai-pr-reviewer',
          ...(init.headers || {}),
        },
      }, {
        timeoutMs: this.timeoutMs,
        retries: this.retries,
        retryUnsafe: false,
      });
    } catch (error) {
      throw new Error(`GitHub API request failed: ${error.message}`);
    }
  }
}
