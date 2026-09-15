import type {
  GitHubFile,
  GitHubRepository,
  GitHubUser,
  GitHubWriteResult
} from "../types";
import { getAuthState, saveAuthState } from "../storage/settings";

const API_BASE = "https://api.github.com";
const DEVICE_CODE_ENDPOINT = "https://github.com/login/device/code";
const ACCESS_TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";

// Replace this public identifier with the client ID of the registered Solve2Git GitHub App.
export const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID?.trim() ?? "";

export function assertGitHubConfigured(): void {
  if (!GITHUB_CLIENT_ID || GITHUB_CLIENT_ID === "replace_with_public_github_app_client_id") {
    throw new Error("Solve2Git was built without VITE_GITHUB_CLIENT_ID. Configure a GitHub App client ID and rebuild the extension.");
  }
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = await getAuthState();
  if (!auth.accessToken) throw new GitHubApiError("Connect GitHub before using this feature.", 401, false);
  if (auth.expiresAt && Date.now() >= Date.parse(auth.expiresAt)) {
    await saveAuthState({ status: "error", error: "GitHub authorization expired. Reconnect GitHub to continue." });
    throw new GitHubApiError("GitHub authorization expired. Reconnect GitHub to continue.", 401, false);
  }
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  if (auth.accessToken) headers.set("Authorization", `Bearer ${auth.accessToken}`);

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.text();
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    if (response.status === 401) {
      await saveAuthState({ status: "error", error: "GitHub authorization expired." });
    }
    throw new GitHubApiError(body || `GitHub request failed (${response.status})`, response.status, retryable);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface DeviceAuthorization {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface DeviceTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
  interval?: number;
}

export async function requestDeviceAuthorization(): Promise<DeviceAuthorization> {
  assertGitHubConfigured();
  const response = await fetch(DEVICE_CODE_ENDPOINT, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: GITHUB_CLIENT_ID })
  });
  if (!response.ok) throw new GitHubApiError("Unable to start GitHub authorization.", response.status, false);
  return (await response.json()) as DeviceAuthorization;
}

export async function pollDeviceAuthorization(deviceCode: string): Promise<DeviceTokenResponse> {
  assertGitHubConfigured();
  const response = await fetch(ACCESS_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: GITHUB_CLIENT_ID, device_code: deviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code" })
  });
  return (await response.json()) as DeviceTokenResponse;
}

export class GitHubClient {
  async getAuthenticatedUser(): Promise<GitHubUser> {
    const user = await request<{ login: string; name?: string; avatar_url?: string }>("/user");
    return { login: user.login, name: user.name, avatarUrl: user.avatar_url };
  }

  async listRepositories(): Promise<GitHubRepository[]> {
    const repositories: Array<Record<string, unknown>> = [];
    for (let page = 1; page <= 10; page += 1) {
      const batch = await request<Array<Record<string, unknown>>>(`/user/repos?per_page=100&sort=updated&page=${page}`);
      repositories.push(...batch);
      if (batch.length < 100) break;
    }
    return repositories.map((repo) => ({
      id: String(repo.id),
      owner: (repo.owner as { login: string }).login,
      name: repo.name as string,
      fullName: repo.full_name as string,
      private: Boolean(repo.private),
      defaultBranch: (repo.default_branch as string) || "main",
      permissions: repo.permissions as GitHubRepository["permissions"]
    }));
  }

  async listBranches(owner: string, repo: string): Promise<string[]> {
    const branches: Array<{ name: string }> = [];
    for (let page = 1; page <= 10; page += 1) {
      const batch = await request<Array<{ name: string }>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100&page=${page}`);
      branches.push(...batch);
      if (batch.length < 100) break;
    }
    return branches.map((branch) => branch.name);
  }

  async validateRepository(owner: string, repo: string, branch: string): Promise<void> {
    const repository = await request<{ permissions?: { push?: boolean } }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
    if (repository.permissions?.push === false) throw new GitHubApiError("You do not have write access to the selected repository.", 403, false);
    const branches = await this.listBranches(owner, repo);
    if (!branches.includes(branch)) throw new GitHubApiError(`Branch not found: ${branch}`, 404, false);
  }

  async getFile(owner: string, repo: string, path: string, branch: string): Promise<GitHubFile | null> {
    try {
      return await request<GitHubFile>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`);
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return null;
      throw error;
    }
  }

  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string,
    sha?: string
  ): Promise<GitHubWriteResult> {
    return request<GitHubWriteResult>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, content: btoa(unescape(encodeURIComponent(content))), branch, ...(sha ? { sha } : {}) })
    });
  }
}
