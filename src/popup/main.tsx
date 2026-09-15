import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ExtensionStatus } from "../types";
import { emptyStatus, sendMessage } from "../ui/api";
import "../ui/styles.css";

function Popup() {
  const [status, setStatus] = useState<ExtensionStatus>(emptyStatus());
  const [error, setError] = useState("");

  const refresh = async () => {
    try { setStatus(await sendMessage<ExtensionStatus>({ type: "GET_STATUS" })); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load status."); }
  };
  useEffect(() => { void refresh(); }, []);

  const connected = status.auth.status === "connected";
  const pendingCount = Object.keys(status.sync.pendingJobs).length;
  const retry = async () => {
    try { setStatus(await sendMessage<ExtensionStatus>({ type: "RETRY_PENDING_SYNCS" })); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to retry pending syncs."); }
  };
  return <main className="app">
    <header className="brand"><div className="brand-mark">S</div><div><h1>Solve2Git</h1><p className="muted">LeetCode → GitHub</p></div></header>
    <section className="card">
      <div className="row"><h2>GitHub</h2><span className={`status ${connected ? "success" : "muted"}`}><span className={`dot ${connected ? "good" : ""}`} />{connected ? `Connected as ${status.githubUser?.login ?? "GitHub user"}` : "Not connected"}</span></div>
      {!connected && <div className="actions"><button onClick={() => chrome.runtime.openOptionsPage()}>Open setup</button></div>}
      {connected && <p className="muted">{status.settings.githubOwner}/{status.settings.githubRepo} · {status.settings.githubBranch}</p>}
    </section>
    <section className="card">
      <div className="row"><h2>Automatic sync</h2><span className={status.settings.autoSync ? "success" : "muted"}>{status.settings.autoSync ? "Enabled" : "Disabled"}</span></div>
      {status.sync.activeSubmissionId && <p className="muted">Syncing submission {status.sync.activeSubmissionId}…</p>}
      {status.sync.lastError && <p className="error">{status.sync.lastError.message}</p>}
      {pendingCount > 0 && <div className="actions"><span className="muted">{pendingCount} pending</span><button className="secondary" onClick={() => void retry()}>Retry</button></div>}
    </section>
    <section className="card"><h2>Recent syncs</h2>
      {status.sync.recentSyncs.length === 0 ? <p className="muted">No solutions synced yet.</p> : <div className="sync-list">{status.sync.recentSyncs.slice(0, 5).map((item) => <div className="sync-item" key={item.submissionId}><span>#{item.problemNumber} {item.title ?? "Solution"}</span><span className="success">✓</span></div>)}</div>}
    </section>
    {error && <p className="error">{error}</p>}
    <div className="actions"><button className="secondary" onClick={() => chrome.runtime.openOptionsPage()}>Settings</button>{connected && <button className="secondary" onClick={() => void refresh()}>Refresh</button>}</div>
  </main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Popup /></StrictMode>);
