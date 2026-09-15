export type Difficulty = "Easy" | "Medium" | "Hard";

export type SubmissionStatus = "Accepted" | "Rejected";

export interface LeetCodeSubmission {
  submissionId: string;
  problemNumber: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
  language: string;
  code: string;
  status: SubmissionStatus;
  timestamp: string;
  runtime?: string;
  memory?: string;
  runtimePercentile?: number;
  memoryPercentile?: number;
}

export interface GitHubUser {
  login: string;
  name?: string;
  avatarUrl?: string;
}

export interface GitHubRepository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  permissions?: {
    push?: boolean;
    admin?: boolean;
  };
}

export interface GitHubFile {
  path: string;
  sha: string;
  content?: string;
  type: "file" | "dir";
}

export interface GitHubWriteResult {
  content?: GitHubFile;
  commit: { sha: string };
}

export interface ExtensionSettings {
  githubOwner: string;
  githubRepo: string;
  githubRepoId?: string;
  githubBranch: string;
  autoSync: boolean;
  notifications: {
    success: boolean;
    errors: boolean;
  };
}

export interface SyncedSubmission {
  submissionId: string;
  problemNumber: number;
  language: string;
  githubPath: string;
  githubCommitSha?: string;
  syncedAt: string;
  title?: string;
}

export interface SyncError {
  message: string;
  occurredAt: string;
}

export interface SyncJob {
  submission: LeetCodeSubmission;
  githubPath: string;
  attempts: number;
  queuedAt: string;
  lastError?: string;
}

export interface SyncState {
  syncedSubmissions: Record<string, SyncedSubmission>;
  recentSyncs: SyncedSubmission[];
  pendingJobs: Record<string, SyncJob>;
  lastError?: SyncError;
  activeSubmissionId?: string;
}

export interface AuthState {
  accessToken?: string;
  expiresAt?: string;
  deviceCode?: string;
  userCode?: string;
  verificationUri?: string;
  pollingIntervalSeconds?: number;
  deviceExpiresAt?: string;
  status: "disconnected" | "connecting" | "connected" | "error";
  error?: string;
}

export type RuntimeMessage =
  | { type: "SUBMISSION_ACCEPTED"; submission: LeetCodeSubmission }
  | { type: "CONTENT_ERROR"; error: string }
  | { type: "SYNC_STARTED"; submissionId: string }
  | { type: "SYNC_SUCCEEDED"; synced: SyncedSubmission }
  | { type: "SYNC_FAILED"; submissionId?: string; error: string }
  | { type: "CONTENT_HEALTH"; healthy: boolean; error?: string }
  | { type: "GET_STATUS" }
  | { type: "AUTH_START" }
  | { type: "AUTH_STATUS" }
  | { type: "SAVE_SETTINGS"; settings: ExtensionSettings }
  | { type: "LIST_REPOSITORIES" }
  | { type: "LIST_BRANCHES"; owner: string; repo: string }
  | { type: "GET_SETUP_DATA" }
  | { type: "RETRY_PENDING_SYNCS" }
  | { type: "REVALIDATE_GITHUB" }
  | { type: "DISCONNECT_GITHUB" };

export interface ExtensionStatus {
  settings: ExtensionSettings;
  sync: SyncState;
  auth: AuthState;
  githubUser?: GitHubUser;
}
