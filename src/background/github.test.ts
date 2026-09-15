import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubApiError, GitHubClient } from "./github";

describe("GitHub client authorization", () => {
  const storage = new Map<string, unknown>();

  beforeEach(() => {
    storage.clear();
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: { local: {
        get: async (key: string) => ({ [key]: storage.get(key) }),
        set: async (value: Record<string, unknown>) => Object.entries(value).forEach(([key, item]) => storage.set(key, item)),
        remove: async (key: string) => storage.delete(key)
      } }
    };
  });

  it("requires a connected token before calling GitHub", async () => {
    await expect(new GitHubClient().getAuthenticatedUser()).rejects.toMatchObject({ status: 401 } satisfies Partial<GitHubApiError>);
  });

  it("marks an expired token as a reconnect error without a network call", async () => {
    storage.set("authState", { status: "connected", accessToken: "token", expiresAt: new Date(Date.now() - 1_000).toISOString() });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(new GitHubClient().getAuthenticatedUser()).rejects.toThrow("expired");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.get("authState")).toMatchObject({ status: "error" });
  });

  it("loads repositories across pages", async () => {
    storage.set("authState", { status: "connected", accessToken: "token" });
    const page = Array.from({ length: 100 }, (_, index) => ({ id: index, owner: { login: "octo" }, name: `repo-${index}`, full_name: `octo/repo-${index}`, private: false, default_branch: "main", permissions: { push: true } }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(page), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 101, owner: { login: "octo" }, name: "last", full_name: "octo/last", private: true, default_branch: "main", permissions: { push: true } }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const repositories = await new GitHubClient().listRepositories();
    expect(repositories).toHaveLength(101);
    expect(repositories.at(-1)).toMatchObject({ id: "101", fullName: "octo/last" });
  });
});
