import type { Difficulty, LeetCodeSubmission, RuntimeMessage } from "../types";
import { BrowserLeetCodeClient, extractProblemFromUrl, extractSubmissionIdFromUrl, normalizeSubmission } from "../background/leetcode";

let lastSubmissionId = "";
let lastDetectionError = "";
let scanTimer: number | undefined;
let scanInFlight = false;
let lastRoute = location.href;
const leetCode = new BrowserLeetCodeClient();

function textFrom(selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const text = element?.textContent?.trim();
    if (text) return text;
  }
  return undefined;
}

function parseStatus(): string | undefined {
  return textFrom(["[data-e2e-locator='submission-result']", "[data-e2e-locator='submission-result-status']", "[role='status']"])
    ?? (document.body.innerText.match(/\bAccepted\b/i)?.[0]);
}

function parseProblemNumber(): number | undefined {
  const value = textFrom(["[data-cy='question-title']", "h1"]);
  const match = value?.match(/^(\d+)\./);
  return match ? Number(match[1]) : undefined;
}

function parseEditorCode(): string | undefined {
  const renderedCode = [...document.querySelectorAll("code")]
    .map((element) => element.textContent ?? "")
    .filter((value) => value.trim().length > 0)
    .reverse()
    .find((value: string) => value.includes("class Solution") || value.includes("def ") || value.includes("function "));
  if (renderedCode) {
    const withoutLineNumbers = renderedCode
      .split(/\r?\n/)
      .map((line: string) => line.replace(/^\s*\d+(?=\s|[A-Za-z_#]|$)/, ""))
      .join("\n")
      .trim();
    if (withoutLineNumbers) return withoutLineNumbers;
  }

  const editor = document.querySelector(".monaco-editor .view-lines, [class*='view-lines']");
  if (editor) {
    const lines = [...editor.querySelectorAll(".view-line")].map((line) => line.textContent ?? "");
    const code = (lines.length > 0 ? lines.join("\n") : editor.textContent ?? "").trim();
    if (code) return code;
  }
  return textFrom(["textarea", "pre code", "pre"]);
}

function parseLanguage(): string {
  const knownLanguage = [...document.querySelectorAll("button")]
    .map((button) => button.textContent?.trim() ?? "")
    .find((value) => /^(Python3?|C\+\+|JavaScript|TypeScript|Java|Go|Rust|C#|C|Kotlin|Swift|Ruby|PHP|Scala)$/i.test(value));
  return knownLanguage ?? textFrom(["[data-mode-id]", "button[aria-label*='language' i]"]) ?? "unknown";
}

function parseSubmissionFromDom(problemMetadata?: { number: number; slug: string; title: string; difficulty: Difficulty }): LeetCodeSubmission | undefined {
  const statusText = parseStatus();
  if (!statusText || !/accepted/i.test(statusText)) return undefined;

  const submissionId = textFrom(["[data-submission-id]"])
    ?? document.querySelector("[data-submission-id]")?.getAttribute("data-submission-id")
    ?? extractSubmissionIdFromUrl();
  const code = parseEditorCode();
  const problem = problemMetadata ?? extractProblemFromUrl();
  if (!submissionId || !code || !problem) return undefined;

  const title = problemMetadata?.title
    ?? textFrom(["[data-cy='question-title']", "h1"])?.replace(/^\d+\.\s*/, "")
    ?? problem.slug;
  const language = parseLanguage();
  const difficultyText = textFrom(["[diff]", "[class*='difficulty' i]"]) ?? "Easy";
  const difficulty: Difficulty = problemMetadata?.difficulty
    ?? (/hard/i.test(difficultyText) ? "Hard" : /medium/i.test(difficultyText) ? "Medium" : "Easy");
  const normalized = normalizeSubmission({
    submissionId,
    problemNumber: problemMetadata?.number ?? parseProblemNumber() ?? 0,
    slug: problem.slug,
    title,
    difficulty,
    language,
    code,
    status: "Accepted",
    timestamp: new Date().toISOString()
  });
  if (normalized.submissionId === lastSubmissionId) return undefined;
  return normalized;
}

async function pollLeetCodeApi(): Promise<LeetCodeSubmission | undefined> {
  const problem = await leetCode.getCurrentProblem();
  const currentSubmissionId = extractSubmissionIdFromUrl();
  if (currentSubmissionId) {
    const detail = await leetCode.getSubmission(normalizeSubmission({
      submissionId: currentSubmissionId,
      problemNumber: problem.number,
      slug: problem.slug,
      title: problem.title,
      difficulty: problem.difficulty,
      language: "unknown",
      code: "",
      status: "Accepted"
    }));
    if (detail.submissionId === lastSubmissionId || detail.status !== "Accepted" || !detail.code) return undefined;
    return detail;
  }
  const submissions = await leetCode.getRecentSubmissions(problem.slug);
  const latest = submissions[0];
  if (!latest) return undefined;
  if (latest.submissionId === lastSubmissionId) return undefined;
  if (latest.status !== "Accepted") return undefined;
  const detail = await leetCode.getSubmission({
    ...latest,
    problemNumber: problem.number,
    slug: problem.slug,
    title: problem.title,
    difficulty: problem.difficulty,
    code: "",
    status: "Accepted"
  });
  return detail.code ? detail : undefined;
}

async function emitAcceptedSubmission(): Promise<void> {
  let submission: LeetCodeSubmission | undefined;
  try {
    submission = await pollLeetCodeApi();
    lastDetectionError = "";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read the accepted LeetCode submission.";
    if (message !== lastDetectionError) {
      lastDetectionError = message;
      console.error("Solve2Git LeetCode detection failed:", message);
      const contentError: RuntimeMessage = { type: "CONTENT_ERROR", error: `LeetCode detection failed: ${message}` };
      await chrome.runtime.sendMessage(contentError).catch(() => undefined);
    }
    let problemMetadata: { number: number; slug: string; title: string; difficulty: Difficulty } | undefined;
    try { problemMetadata = await leetCode.getCurrentProblem(); } catch { /* DOM fallback can still work without metadata. */ }
    submission = parseSubmissionFromDom(problemMetadata);
  }
  if (!submission) return;
  const message: RuntimeMessage = { type: "SUBMISSION_ACCEPTED", submission };
  const response = await chrome.runtime.sendMessage(message).catch(() => undefined);
  if (response) lastSubmissionId = submission.submissionId;
}

async function scan(): Promise<void> {
  if (scanInFlight) return;
  scanInFlight = true;
  try {
    if (location.href !== lastRoute) {
      lastRoute = location.href;
      lastDetectionError = "";
    }
    await emitAcceptedSubmission();
    await chrome.runtime.sendMessage({ type: "CONTENT_HEALTH", healthy: true } satisfies RuntimeMessage).catch(() => undefined);
  } finally {
    scanInFlight = false;
  }
}

function scheduleScan(): void {
  if (scanTimer !== undefined) window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => { scanTimer = undefined; void scan(); }, 350);
}

const observer = new MutationObserver(scheduleScan);
observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
window.setInterval(scheduleScan, 3000);
window.addEventListener("popstate", scheduleScan);
window.addEventListener("hashchange", scheduleScan);
scheduleScan();
