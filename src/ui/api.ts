import type { ExtensionStatus, RuntimeMessage } from "../types";

export async function sendMessage<T>(message: RuntimeMessage): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as { ok: boolean; data?: T; error?: string };
  if (!response?.ok) throw new Error(response?.error ?? "Solve2Git request failed.");
  return response.data as T;
}

export function emptyStatus(): ExtensionStatus {
  return {
    settings: {
      githubOwner: "",
      githubRepo: "",
      githubBranch: "main",
      autoSync: true,
      notifications: { success: true, errors: true }
    },
    sync: { syncedSubmissions: {}, recentSyncs: [], pendingJobs: {} },
    auth: { status: "disconnected" }
  };
}
