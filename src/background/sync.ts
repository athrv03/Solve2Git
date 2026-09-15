import type { ExtensionSettings, LeetCodeSubmission, SyncJob, SyncState, SyncedSubmission } from "../types";
import { getSettings, getSyncState, saveSyncState } from "../storage/settings";
import { GitHubApiError, GitHubClient } from "./github";
import { solutionPath } from "../shared/paths";

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function commitMessage(submission: LeetCodeSubmission): string {
  return `Archive LeetCode #${submission.problemNumber} - ${submission.title} (${submission.submissionId})`;
}

function validateConfiguration(settings: ExtensionSettings): void {
  if (!settings.githubOwner || !settings.githubRepo || !settings.githubBranch) throw new Error("Complete GitHub repository settings before syncing.");
}

function updateRecentSyncs(state: SyncState, synced: SyncedSubmission): SyncState {
  const { [synced.submissionId]: _completed, ...pendingJobs } = state.pendingJobs;
  return { ...state, pendingJobs, syncedSubmissions: { ...state.syncedSubmissions, [synced.submissionId]: synced }, recentSyncs: [synced, ...state.recentSyncs.filter((entry) => entry.submissionId !== synced.submissionId)].slice(0, 10), activeSubmissionId: undefined, lastError: undefined };
}

export class SyncService {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly github = new GitHubClient()) {}

  sync(submission: LeetCodeSubmission): Promise<SyncedSubmission | undefined> {
    return this.enqueue(() => this.performSync(submission, false));
  }

  retryPending(): Promise<SyncedSubmission[]> {
    return this.enqueue(async () => {
      const results: SyncedSubmission[] = [];
      for (const job of Object.values((await getSyncState()).pendingJobs)) {
        const synced = await this.performSync(job.submission, true);
        if (synced) results.push(synced);
      }
      return results;
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.queue.then(operation);
    this.queue = queued.catch(() => undefined);
    return queued;
  }

  private async performSync(submission: LeetCodeSubmission, force: boolean): Promise<SyncedSubmission | undefined> {
    if (submission.status !== "Accepted" || !submission.submissionId || !submission.code) return undefined;
    const path = solutionPath(submission);
    let state = await getSyncState();
    if (state.syncedSubmissions[submission.submissionId]) return state.syncedSubmissions[submission.submissionId];
    const previousJob = state.pendingJobs[submission.submissionId];
    const job: SyncJob = previousJob ?? { submission, githubPath: path, attempts: 0, queuedAt: new Date().toISOString() };
    await saveSyncState({ ...state, pendingJobs: { ...state.pendingJobs, [submission.submissionId]: job } });

    const settings = await getSettings();
    if (!force && !settings.autoSync) return undefined;
    validateConfiguration(settings);
    state = await getSyncState();
    await saveSyncState({ ...state, activeSubmissionId: submission.submissionId, lastError: undefined });
    try {
      const synced = await this.writeWithRetry(settings, submission, job.githubPath);
      await saveSyncState(updateRecentSyncs(await getSyncState(), synced));
      return synced;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sync submission.";
      const latest = await getSyncState();
      const latestJob = latest.pendingJobs[submission.submissionId] ?? job;
      await saveSyncState({ ...latest, activeSubmissionId: undefined, lastError: { message, occurredAt: new Date().toISOString() }, pendingJobs: { ...latest.pendingJobs, [submission.submissionId]: { ...latestJob, attempts: latestJob.attempts + 1, lastError: message } } });
      throw error;
    }
  }

  private async writeWithRetry(settings: ExtensionSettings, submission: LeetCodeSubmission, path: string): Promise<SyncedSubmission> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const existing = await this.github.getFile(settings.githubOwner, settings.githubRepo, path, settings.githubBranch);
        const result = await this.github.createOrUpdateFile(settings.githubOwner, settings.githubRepo, path, submission.code, commitMessage(submission), settings.githubBranch, existing?.sha);
        return { submissionId: submission.submissionId, problemNumber: submission.problemNumber, language: submission.language, githubPath: path, githubCommitSha: result.commit.sha, syncedAt: new Date().toISOString(), title: submission.title };
      } catch (error) {
        lastError = error;
        if (!(error instanceof GitHubApiError) || !error.retryable || attempt === 2) break;
        await sleep(250 * 2 ** attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("GitHub sync failed after three attempts.");
  }
}
