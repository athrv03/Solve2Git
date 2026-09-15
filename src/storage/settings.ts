import type { AuthState, ExtensionSettings, SyncState } from "../types";

export const DEFAULT_SETTINGS: ExtensionSettings = {
  githubOwner: "",
  githubRepo: "",
  githubBranch: "main",
  autoSync: true,
  notifications: { success: true, errors: true }
};

export const DEFAULT_SYNC_STATE: SyncState = {
  syncedSubmissions: {},
  recentSyncs: [],
  pendingJobs: {}
};

export const DEFAULT_AUTH_STATE: AuthState = { status: "disconnected" };

const KEYS = {
  settings: "settings",
  syncState: "syncState",
  authState: "authState"
} as const;

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(stored[KEYS.settings] as Partial<ExtensionSettings> | undefined) };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [KEYS.settings]: settings });
}

export async function getSyncState(): Promise<SyncState> {
  const stored = await chrome.storage.local.get(KEYS.syncState);
  const value = stored[KEYS.syncState] as Partial<SyncState> | undefined;
  return {
    ...DEFAULT_SYNC_STATE,
    ...value,
    syncedSubmissions: { ...DEFAULT_SYNC_STATE.syncedSubmissions, ...(value?.syncedSubmissions ?? {}) },
    recentSyncs: value?.recentSyncs ?? [],
    pendingJobs: { ...DEFAULT_SYNC_STATE.pendingJobs, ...(value?.pendingJobs ?? {}) }
  };
}

export async function saveSyncState(syncState: SyncState): Promise<void> {
  await chrome.storage.local.set({ [KEYS.syncState]: syncState });
}

export async function getAuthState(): Promise<AuthState> {
  const stored = await chrome.storage.local.get(KEYS.authState);
  return { ...DEFAULT_AUTH_STATE, ...(stored[KEYS.authState] as Partial<AuthState> | undefined) };
}

export async function saveAuthState(authState: AuthState): Promise<void> {
  await chrome.storage.local.set({ [KEYS.authState]: authState });
}

export async function clearAuthState(): Promise<void> {
  await chrome.storage.local.remove(KEYS.authState);
}
