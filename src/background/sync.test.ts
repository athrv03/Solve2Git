import { beforeEach, describe, expect, it } from "vitest";
import type { GitHubFile, GitHubWriteResult, LeetCodeSubmission } from "../types";
import { commitMessage, SyncService } from "./sync";
import { DEFAULT_SETTINGS } from "../storage/settings";

const submission: LeetCodeSubmission = {
  submissionId: "123",
  problemNumber: 1,
  slug: "two-sum",
  title: "Two Sum",
  difficulty: "Easy",
  language: "python",
  code: "class Solution: pass",
  status: "Accepted",
  timestamp: new Date().toISOString()
};

describe("sync behavior", () => {
  const storage = new Map<string, unknown>();

  beforeEach(() => {
    storage.clear();
    storage.set("settings", {
      ...DEFAULT_SETTINGS,
      githubOwner: "octocat",
      githubRepo: "leetcode-solutions",
      githubBranch: "main"
    });
    storage.set("syncState", { syncedSubmissions: {}, recentSyncs: [] });
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: {
          get: async (key: string) => ({ [key]: storage.get(key) }),
          set: async (value: Record<string, unknown>) => Object.entries(value).forEach(([key, item]) => storage.set(key, item)),
          remove: async (key: string) => storage.delete(key)
        }
      }
    };
  });

  it("generates an archival commit message", () => {
    expect(commitMessage(submission)).toBe("Archive LeetCode #1 - Two Sum (123)");
  });

  it("can be constructed with a GitHub client seam", () => {
    const file: GitHubFile | null = null;
    const result: GitHubWriteResult = { commit: { sha: "commit" } };
    const client = {
      getFile: async () => file,
      createOrUpdateFile: async () => result
    };
    expect(new SyncService(client as never)).toBeInstanceOf(SyncService);
    expect(DEFAULT_SETTINGS.githubBranch).toBe("main");
  });

  it("creates a file and records the returned commit", async () => {
    const calls: string[] = [];
    const client = {
      getFile: async () => null,
      createOrUpdateFile: async (...args: unknown[]) => {
        calls.push(String(args[4]));
        return { commit: { sha: "commit-1" } };
      }
    };
    const result = await new SyncService(client as never).sync(submission);
    expect(result?.githubPath).toBe("problems/0001-two-sum/python/123.py");
    expect(result?.githubCommitSha).toBe("commit-1");
    expect(calls).toEqual(["Archive LeetCode #1 - Two Sum (123)"]);
  });

  it("does not write a submission already in the local index", async () => {
    storage.set("syncState", {
      syncedSubmissions: { "123": { submissionId: "123", problemNumber: 1, language: "python", githubPath: "existing.py", syncedAt: "now" } },
      recentSyncs: []
    });
    let writes = 0;
    const client = {
      getFile: async () => null,
      createOrUpdateFile: async () => { writes += 1; return { commit: { sha: "never" } }; }
    };
    const result = await new SyncService(client as never).sync(submission);
    expect(result?.githubPath).toBe("existing.py");
    expect(writes).toBe(0);
  });

  it("keeps later accepted submissions as separate files", async () => {
    const paths: string[] = [];
    const client = { getFile: async () => null, createOrUpdateFile: async (...args: unknown[]) => { paths.push(String(args[2])); return { commit: { sha: "commit" } }; } };
    const service = new SyncService(client as never);
    await service.sync(submission);
    await service.sync({ ...submission, submissionId: "124", code: "class Solution: return 1" });
    expect(paths).toEqual(["problems/0001-two-sum/python/123.py", "problems/0001-two-sum/python/124.py"]);
  });

  it("persists a failed job for manual recovery", async () => {
    const client = { getFile: async () => { throw new Error("offline"); }, createOrUpdateFile: async () => ({ commit: { sha: "never" } }) };
    await expect(new SyncService(client as never).sync(submission)).rejects.toThrow("offline");
    const state = storage.get("syncState") as { pendingJobs: Record<string, { attempts: number }> };
    expect(state.pendingJobs["123"].attempts).toBe(1);
  });
});
