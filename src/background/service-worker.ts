import type { ExtensionStatus, RuntimeMessage } from "../types";
import {
  clearAuthState,
  DEFAULT_SETTINGS,
  getAuthState,
  getSettings,
  getSyncState,
  saveAuthState,
  saveSettings,
  saveSyncState
} from "../storage/settings";
import { GitHubClient, pollDeviceAuthorization, requestDeviceAuthorization } from "./github";
import { SyncService } from "./sync";

const syncService = new SyncService();
const github = new GitHubClient();
const AUTH_ALARM = "solve2git-auth-poll";

async function scheduleAuthPoll(seconds: number): Promise<void> {
  // Chrome may clamp alarms below its current minimum delay; never poll more often than requested.
  await chrome.alarms.create(AUTH_ALARM, { delayInMinutes: Math.max(seconds, 30) / 60 });
}

async function getStatus(): Promise<ExtensionStatus> {
  const [settings, sync, auth] = await Promise.all([getSettings(), getSyncState(), getAuthState()]);
  let githubUser: ExtensionStatus["githubUser"];
  if (auth.status === "connected") {
    try {
      githubUser = await github.getAuthenticatedUser();
    } catch {
      return { settings, sync, auth: await getAuthState() };
    }
  }
  return { settings, sync, auth, githubUser };
}

async function startAuthentication(): Promise<void> {
  const device = await requestDeviceAuthorization();
  const expiresAt = new Date(Date.now() + device.expires_in * 1000).toISOString();
  await saveAuthState({
    status: "connecting",
    deviceCode: device.device_code,
    userCode: device.user_code,
    verificationUri: device.verification_uri,
    pollingIntervalSeconds: device.interval,
    deviceExpiresAt: expiresAt
  });
  await scheduleAuthPoll(Math.max(device.interval, 5));
}

async function pollAuthentication(): Promise<void> {
  const auth = await getAuthState();
  if (auth.status !== "connecting" || !auth.deviceCode) return;
  if (auth.deviceExpiresAt && Date.now() >= Date.parse(auth.deviceExpiresAt)) {
    await saveAuthState({ status: "error", error: "GitHub authorization expired. Please try again." });
    return;
  }
  const response = await pollDeviceAuthorization(auth.deviceCode);
  if (response.access_token) {
    await saveAuthState({
      status: "connected",
      accessToken: response.access_token,
      expiresAt: response.expires_in ? new Date(Date.now() + response.expires_in * 1000).toISOString() : undefined
    });
    try {
      await github.getAuthenticatedUser();
      await chrome.alarms.clear(AUTH_ALARM);
    } catch {
      await chrome.alarms.clear(AUTH_ALARM);
    }
  } else if (response.error === "authorization_pending") {
    await scheduleAuthPoll(Math.max(auth.pollingIntervalSeconds ?? 5, 5));
  } else if (response.error === "slow_down") {
    await scheduleAuthPoll(Math.max((auth.pollingIntervalSeconds ?? 5) + 5, 5));
  } else {
    await saveAuthState({ status: "error", error: response.error_description ?? "GitHub authorization failed." });
  }
}

function notify(title: string, message: string): void {
  void chrome.notifications.create({ type: "basic", title, message, iconUrl: "icons/logo-128.png" });
}

async function handleMessage(message: RuntimeMessage): Promise<unknown> {
  switch (message.type) {
    case "SUBMISSION_ACCEPTED": {
      try {
        const result = await syncService.sync(message.submission);
        if (result) {
          const settings = await getSettings();
          if (settings.notifications.success) notify("Solve2Git synced", `#${result.problemNumber} ${result.title ?? "LeetCode solution"}`);
        }
        return result;
      } catch (error) {
        const settings = await getSettings();
        if (settings.notifications.errors) notify("Solve2Git sync failed", error instanceof Error ? error.message : "Unable to upload solution.");
        throw error;
      }
    }
    case "CONTENT_ERROR": {
      const current = await getSyncState();
      await saveSyncState({
        ...current,
        activeSubmissionId: undefined,
        lastError: { message: message.error, occurredAt: new Date().toISOString() }
      });
      return undefined;
    }
    case "CONTENT_HEALTH":
      if (message.healthy) return undefined;
      await saveSyncState({ ...(await getSyncState()), lastError: { message: message.error ?? "LeetCode detector is unavailable.", occurredAt: new Date().toISOString() } });
      return undefined;
    case "GET_STATUS":
    case "AUTH_STATUS":
    case "GET_SETUP_DATA":
      return getStatus();
    case "AUTH_START":
      await startAuthentication();
      return getStatus();
    case "REVALIDATE_GITHUB":
      await github.getAuthenticatedUser();
      return getStatus();
    case "SAVE_SETTINGS":
      if (!message.settings.githubOwner || !message.settings.githubRepo || !message.settings.githubBranch) {
        throw new Error("Select a GitHub repository and branch before saving.");
      }
      if ((await getAuthState()).status !== "connected") throw new Error("Connect GitHub before saving repository settings.");
      await github.validateRepository(message.settings.githubOwner, message.settings.githubRepo, message.settings.githubBranch);
      await saveSettings(message.settings);
      return getStatus();
    case "LIST_REPOSITORIES":
      return github.listRepositories();
    case "LIST_BRANCHES":
      return github.listBranches(message.owner, message.repo);
    case "DISCONNECT_GITHUB":
      await chrome.alarms.clear(AUTH_ALARM);
      await clearAuthState();
      await saveSettings(DEFAULT_SETTINGS);
      return getStatus();
    case "RETRY_PENDING_SYNCS":
      await syncService.retryPending();
      return getStatus();
    default:
      return undefined;
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  handleMessage(message)
    .then((response) => sendResponse({ ok: true, data: response }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unexpected error." }));
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTH_ALARM) void pollAuthentication();
});
