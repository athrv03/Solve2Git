import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ExtensionSettings, ExtensionStatus, GitHubRepository } from "../types";
import { emptyStatus, sendMessage } from "../ui/api";
import "../ui/styles.css";

function Options() {
  const [status, setStatus] = useState<ExtensionStatus>(emptyStatus());
  const [settings, setSettings] = useState<ExtensionSettings>(emptyStatus().settings);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const refresh = async () => {
    try {
      const next = await sendMessage<ExtensionStatus>({ type: "GET_SETUP_DATA" });
      setStatus(next); setSettings(next.settings); setError("");
      if (next.auth.status === "connected") {
        const repos = await sendMessage<GitHubRepository[]>({ type: "LIST_REPOSITORIES" });
        setRepositories(repos);
        const selected = repos.find((repo) => repo.id === next.settings.githubRepoId || (repo.owner === next.settings.githubOwner && repo.name === next.settings.githubRepo));
        if (selected) setBranches(await sendMessage<string[]>({ type: "LIST_BRANCHES", owner: selected.owner, repo: selected.name }));
      }
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load setup."); }
  };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (status.auth.status !== "connecting") return;
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [status.auth.status]);

  const connect = async () => {
    try {
      setError("");
      const next = await sendMessage<ExtensionStatus>({ type: "AUTH_START" });
      setStatus(next);
      setError("Finish authorization in the GitHub device page, then return here and refresh.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to connect GitHub."); }
  };

  const save = async () => {
    try { const next = await sendMessage<ExtensionStatus>({ type: "SAVE_SETTINGS", settings }); setStatus(next); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save settings."); }
  };

  const selectRepository = async (fullName: string) => {
    const repository = repositories.find((candidate) => candidate.fullName === fullName);
    if (!repository) return;
    const nextSettings = { ...settings, githubOwner: repository.owner, githubRepo: repository.name, githubRepoId: repository.id, githubBranch: repository.defaultBranch };
    setSettings(nextSettings);
    try { setBranches(await sendMessage<string[]>({ type: "LIST_BRANCHES", owner: repository.owner, repo: repository.name })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load branches."); }
  };

  const disconnect = async () => { const next = await sendMessage<ExtensionStatus>({ type: "DISCONNECT_GITHUB" }); setStatus(next); setSettings(next.settings); setRepositories([]); };
  const update = <K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));
  const connected = status.auth.status === "connected";
  const pendingCount = Object.keys(status.sync.pendingJobs).length;
  const retry = async () => {
    try { setStatus(await sendMessage<ExtensionStatus>({ type: "RETRY_PENDING_SYNCS" })); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to retry pending syncs."); }
  };

  return <main className="app wide">
    <header className="brand"><div className="brand-mark">S</div><div><h1>Solve2Git settings</h1><p className="muted">Back up genuine accepted LeetCode solutions.</p></div></header>
    <section className="card"><h2>GitHub connection</h2><div className="status"><span className={`dot ${connected ? "good" : "bad"}`} />{connected ? `Connected as ${status.githubUser?.login ?? "GitHub user"}` : "Not connected"}</div>
      {status.auth.status === "connecting" && <p className="hint">Open the GitHub device verification page, enter the displayed code, then refresh this page. Chrome checks authorization periodically.</p>}
      {status.auth.userCode && <p className="success">Device code: {status.auth.userCode} · <a href={status.auth.verificationUri} target="_blank" rel="noreferrer">Open GitHub verification</a></p>}
      <div className="actions"><button onClick={() => void connect()}>{connected ? "Reconnect GitHub" : "Connect GitHub"}</button>{connected && <button className="danger" onClick={() => void disconnect()}>Disconnect</button>}</div>
    </section>
    <section className="card stack"><h2>Repository</h2>
      {repositories.length > 0 ? <label>Repository<select value={`${settings.githubOwner}/${settings.githubRepo}`} onChange={(event) => void selectRepository(event.target.value)}><option value="">Select a repository</option>{repositories.filter((repo) => repo.permissions?.push !== false).map((repo) => <option key={repo.fullName} value={repo.fullName}>{repo.fullName}</option>)}</select></label> : <><label>Owner<input value={settings.githubOwner} onChange={(event) => update("githubOwner", event.target.value)} placeholder="username" /></label><label>Repository<input value={settings.githubRepo} onChange={(event) => update("githubRepo", event.target.value)} placeholder="leetcode-solutions" /></label></>}
      {branches.length > 0 ? <label>Branch<select value={settings.githubBranch} onChange={(event) => update("githubBranch", event.target.value)}>{branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select></label> : <label>Branch<input value={settings.githubBranch} onChange={(event) => update("githubBranch", event.target.value)} placeholder="main" /></label>}
      <p className="hint">Each accepted submission is preserved at problems/0001-two-sum/python/123456.py.</p>
    </section>
    <section className="card stack"><h2>Sync and notifications</h2>
      <label><span><input type="checkbox" checked={settings.autoSync} onChange={(event) => update("autoSync", event.target.checked)} /> Automatically sync accepted submissions</span></label>
      <label><span><input type="checkbox" checked={settings.notifications.success} onChange={(event) => update("notifications", { ...settings.notifications, success: event.target.checked })} /> Show successful sync notifications</span></label>
      <label><span><input type="checkbox" checked={settings.notifications.errors} onChange={(event) => update("notifications", { ...settings.notifications, errors: event.target.checked })} /> Show sync error notifications</span></label>
    </section>
    <section className="card"><div className="row"><h2>Recovery</h2><span className={pendingCount ? "muted" : "success"}>{pendingCount ? `${pendingCount} pending` : "No pending syncs"}</span></div>
      {status.sync.lastError && <p className="error">{status.sync.lastError.message}</p>}
      {pendingCount > 0 && <div className="actions"><button className="secondary" onClick={() => void retry()}>Retry pending syncs</button></div>}
      {status.sync.recentSyncs[0] && <p className="hint">Last sync: #{status.sync.recentSyncs[0].problemNumber} · {new Date(status.sync.recentSyncs[0].syncedAt).toLocaleString()}</p>}
    </section>
    <div className="actions"><button onClick={() => void save()}>Save settings</button>{saved && <span className="success">Saved</span>}</div>
    {error && <p className="error">{error}</p>}
    {repositories.length > 0 && <p className="muted">Loaded {repositories.length} repositories.</p>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Options /></StrictMode>);
