# LeetCode → GitHub Chrome Extension — Design Document

## 1. Project Goal

Build a Chrome extension that automatically synchronizes a user's **accepted LeetCode submissions** to a **GitHub repository selected by the user**.

Primary goals:

- Detect successful LeetCode submissions.
- Retrieve the submitted source code and useful problem metadata.
- Avoid syncing duplicate submissions.
- Create/update solution files in the user's selected GitHub repository.
- Create a real GitHub commit for each newly synced accepted solution.
- Make the GitHub repository useful as a coding portfolio, not merely as a contribution-graph generator.
- Require the minimum practical GitHub permissions.
- Avoid requiring a backend for the MVP.

Important: the extension should not intentionally fabricate activity or commits unrelated to genuine LeetCode solutions. Each GitHub commit should correspond to a real accepted submission.

---

## 2. High-Level Architecture

```text
┌──────────────────────┐
│       LeetCode       │
│                      │
│  User submits code   │
└──────────┬───────────┘
           │
           │ Accepted
           ▼
┌──────────────────────┐
│ Chrome Extension     │
│                      │
│ Content Script       │
│   ↓                  │
│ Detect submission    │
│   ↓                  │
│ Extract solution     │
│   ↓                  │
│ Background Worker    │
└──────────┬───────────┘
           │
           │ GitHub API
           ▼
┌──────────────────────┐
│   Selected GitHub    │
│      Repository      │
│                      │
│ LeetCode/            │
│   0001-two-sum/      │
│      solution.py     │
│      metadata.json   │
└──────────────────────┘
```

### Components

```text
extension/
├── src/
│   ├── background/
│   │   ├── service-worker.ts
│   │   ├── github.ts
│   │   ├── leetcode.ts
│   │   └── sync.ts
│   │
│   ├── content/
│   │   └── leetcode-submission.ts
│   │
│   ├── popup/
│   │   ├── App.tsx
│   │   └── ...
│   │
│   ├── options/
│   │   ├── App.tsx
│   │   └── ...
│   │
│   ├── storage/
│   │   └── settings.ts
│   │
│   └── types/
│       └── index.ts
│
├── public/
│   └── icons/
│
├── manifest.json
├── package.json
└── README.md
```

---

## 3. Chrome Extension Technology

Use:

- **Chrome Extension Manifest V3**
- **TypeScript**
- **React** for popup/options UI
- `chrome.storage` for configuration and local sync state
- Service worker for background operations
- Content script on LeetCode problem/submission pages

The MVP should be client-side and should not require a custom backend.

---

## 4. LeetCode Integration

### Important constraint

LeetCode does not provide a broadly documented, stable public API/SDK for this use case.

The LeetCode website uses internal GraphQL APIs. These can be used by the extension where appropriate, but they should be treated as **internal/unstable interfaces**.

Do not assume these endpoints are permanent.

Build a small abstraction around all LeetCode requests:

```ts
interface LeetCodeClient {
  getCurrentProblem(): Promise<LeetCodeProblem>;
  getRecentSubmissions(slug: string): Promise<LeetCodeSubmission[]>;
  getSubmissionCode(submissionId: string): Promise<string>;
}
```

This keeps LeetCode-specific implementation details isolated.

### Prefer API over DOM scraping

The extension should preferably obtain submission data through LeetCode's internal GraphQL interface.

DOM scraping should be considered a fallback only.

Avoid selectors tied to presentation-specific class names whenever possible.

---

## 5. Detecting an Accepted Submission

The extension should monitor the active LeetCode problem/submission page.

The desired state machine is:

```text
User submits
     ↓
Submission appears
     ↓
Determine status
     ↓
┌──────────────┐
│   Accepted?  │
└──────┬───────┘
       │
   ┌───┴───┐
   │       │
  YES      NO
   │       │
   ▼       ▼
Continue   Ignore
```

Do **not** sync:

- Wrong Answer
- Time Limit Exceeded
- Memory Limit Exceeded
- Runtime Error
- Compilation Error
- Other failed submissions

Only an accepted submission should trigger synchronization.

---

## 6. Submission Data Model

Normalize LeetCode data into an internal structure:

```ts
interface LeetCodeSubmission {
  submissionId: string;
  problemNumber: number;
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  language: string;
  code: string;
  status: "Accepted" | "Rejected";
  timestamp: string;

  runtime?: string;
  memory?: string;
  runtimePercentile?: number;
  memoryPercentile?: number;
}
```

Example:

```json
{
  "submissionId": "123456789",
  "problemNumber": 1,
  "slug": "two-sum",
  "title": "Two Sum",
  "difficulty": "Easy",
  "language": "python",
  "code": "class Solution:\n    ...",
  "status": "Accepted",
  "timestamp": "2026-09-15T10:30:00Z",
  "runtime": "52 ms",
  "memory": "18.2 MB"
}
```

---

## 7. GitHub Integration

Use GitHub's repository Contents API to create/update files.

Core operation:

```text
PUT /repos/{owner}/{repo}/contents/{path}
```

The request should contain:

- `message`
- `content` (Base64)
- `branch`
- `sha` when replacing an existing file

The extension should encapsulate GitHub calls:

```ts
interface GitHubClient {
  getAuthenticatedUser(): Promise<GitHubUser>;
  listRepositories(): Promise<GitHubRepository[]>;
  getFile(owner: string, repo: string, path: string, branch: string): Promise<GitHubFile | null>;
  createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string,
    sha?: string
  ): Promise<void>;
}
```

---

## 8. GitHub Authentication

### Preferred production approach

Use a proper GitHub OAuth/device authorization flow appropriate for a browser extension.

The user should explicitly authorize the extension.

The extension should request only the minimum repository permissions required.

### MVP alternative

A fine-grained GitHub Personal Access Token can be supported as an initial MVP option.

If using a fine-grained PAT:

- Restrict access to the selected repository.
- Request only repository Contents read/write access.
- Do not request unnecessary administration, workflow, issues, or organization permissions.
- Store the token using Chrome extension storage with care.
- Never log the token.
- Never send the token to an application-owned backend.

For a public extension, replace manual PAT entry with a proper authorization flow before broad release.

---

## 9. Repository Selection

The extension should provide a setup screen:

```text
GitHub
────────────────────────
✓ Connected as username

Repository
[ username / leetcode-solutions ▼ ]

Branch
[ main ▼ ]

Solution directory
[ LeetCode/ ]

☑ Automatically sync accepted submissions

[ Save Settings ]
```

The user should be able to select:

- GitHub account
- Repository
- Branch
- Root solution directory
- Whether automatic sync is enabled

---

## 10. Repository Structure

Recommended default:

```text
leetcode-solutions/
│
├── LeetCode/
│   ├── 0001-two-sum/
│   │   └── solution.py
│   │
│   ├── 0002-add-two-numbers/
│   │   └── solution.cpp
│   │
│   └── 0003-longest-substring-without-repeating-characters/
│       └── solution.java
│
└── README.md
```

Alternative flat structure:

```text
LeetCode/
├── 0001-two-sum.py
├── 0002-add-two-numbers.cpp
└── 0003-longest-substring-without-repeating-characters.java
```

The folder-based layout is recommended because it leaves room for metadata and tests later.

---

## 11. Filename Generation

Normalize the LeetCode slug.

Example:

```text
Problem:
Two Sum

Number:
1

Slug:
two-sum

Language:
Python
```

Result:

```text
LeetCode/0001-two-sum/solution.py
```

Use zero-padded problem numbers.

Suggested function:

```ts
function solutionPath(problem: LeetCodeProblem): string {
  const number = String(problem.number).padStart(4, "0");
  return `LeetCode/${number}-${problem.slug}/solution.${extension}`;
}
```

---

## 12. Language → File Extension

Maintain a mapping:

```ts
const extensions = {
  python: "py",
  python3: "py",
  cpp: "cpp",
  "c++": "cpp",
  java: "java",
  javascript: "js",
  typescript: "ts",
  c: "c",
  csharp: "cs",
  "c#": "cs",
  go: "go",
  rust: "rs",
  kotlin: "kt",
  swift: "swift",
  ruby: "rb",
  php: "php",
  scala: "scala"
};
```

Unknown languages should use a safe fallback or require user configuration rather than generating a misleading extension.

---

## 13. Duplicate Prevention

Duplicate prevention is essential.

The extension should maintain a local sync index:

```ts
interface SyncedSubmission {
  submissionId: string;
  problemNumber: number;
  language: string;
  githubPath: string;
  githubCommitSha?: string;
  syncedAt: string;
}
```

Before syncing:

```text
Accepted submission
        ↓
Have we synced submissionId?
        │
   ┌────┴────┐
  YES       NO
   │         │
 Ignore      ▼
          Sync
```

Do not rely solely on the GitHub filename for deduplication.

---

## 14. Handling Multiple Accepted Submissions

A user may solve the same problem multiple times or submit accepted solutions in different languages.

Recommended behavior:

### Default

Keep the latest accepted solution for a problem/language:

```text
0001-two-sum/
    solution.py
```

If the user later submits an improved Python solution, update the file.

### Optional advanced mode

Preserve every accepted version:

```text
0001-two-sum/
    python/
        solution-2026-09-15.py
        solution-2026-09-20.py
    cpp/
        solution.cpp
```

Do not make this the MVP default.

---

## 15. Git Commit Strategy

Only create a GitHub commit for a newly synchronized accepted solution.

Example commit message:

```text
Solve LeetCode #1 - Two Sum
```

For updates:

```text
Update LeetCode #1 - Two Sum
```

The commit should contain the actual LeetCode solution.

Do not generate artificial empty commits simply to increase the GitHub contribution graph.

---

## 16. Sync Flow

Complete MVP flow:

```text
1. User solves a LeetCode problem
             ↓
2. User submits
             ↓
3. Extension detects submission
             ↓
4. Check submission status
             ↓
5. If not Accepted → stop
             ↓
6. Retrieve submission ID/code/metadata
             ↓
7. Check local sync index
             ↓
8. If already synced → stop
             ↓
9. Determine GitHub path
             ↓
10. Check whether target file exists
             ↓
11. Create or update GitHub file
             ↓
12. GitHub creates commit
             ↓
13. Store sync record locally
             ↓
14. Show success notification
```

---

## 17. GitHub File Creation

For a new solution:

```text
PUT /repos/{owner}/{repo}/contents/LeetCode/0001-two-sum/solution.py
```

Payload conceptually:

```json
{
  "message": "Solve LeetCode #1 - Two Sum",
  "content": "<base64 encoded source>",
  "branch": "main"
}
```

For an existing solution, retrieve the existing file's SHA and send it with the update:

```json
{
  "message": "Update LeetCode #1 - Two Sum",
  "content": "<base64 encoded source>",
  "sha": "<existing file sha>",
  "branch": "main"
}
```

---

## 18. Optional Metadata File

A metadata file can make the repository much more useful:

```text
0001-two-sum/
├── solution.py
└── metadata.json
```

Example:

```json
{
  "number": 1,
  "title": "Two Sum",
  "slug": "two-sum",
  "difficulty": "Easy",
  "language": "python",
  "submittedAt": "2026-09-15T10:30:00Z",
  "runtime": "52 ms",
  "memory": "18.2 MB"
}
```

This should be optional for the MVP.

---

## 19. README Generation

A useful extension feature is automatic README maintenance.

Example:

```markdown
# LeetCode Solutions

| # | Problem | Difficulty | Language |
|---|---------|------------|----------|
| 1 | Two Sum | Easy | Python |
| 2 | Add Two Numbers | Medium | C++ |
| 3 | Longest Substring Without Repeating Characters | Medium | Java |
```

The README should be generated deterministically from synchronized metadata.

Avoid overwriting user-authored README content.

Prefer maintaining a clearly delimited generated section:

```markdown
<!-- LEETCODE-SYNC:START -->

Generated solution index goes here.

<!-- LEETCODE-SYNC:END -->
```

Only update content inside those markers.

---

## 20. Popup UI

The popup should show:

```text
┌────────────────────────────────────────┐
│            LeetCode Sync               │
├────────────────────────────────────────┤
│ GitHub                                  │
│ ✓ Connected as username                │
│                                         │
│ Repository                              │
│ username/leetcode-solutions             │
│                                         │
│ Today's syncs                           │
│ ✓ #1 Two Sum                            │
│ ✓ #15 3Sum                              │
│ ✓ #20 Valid Parentheses                 │
│                                         │
│ Last sync                               │
│ #20 Valid Parentheses                   │
│ Synced just now                         │
│                                         │
│ [ Open Repository ]  [ Settings ]       │
└────────────────────────────────────────┘
```

---

## 21. Settings

Provide:

- GitHub connection
- Repository
- Branch
- Root directory
- Auto-sync toggle
- File organization mode
- Whether to create metadata
- Whether to update README
- Notification preference

Example:

```text
Settings
────────────────────────

GitHub
  Account: username
  Repository: leetcode-solutions
  Branch: main

Storage
  Directory: LeetCode/

Sync
  ☑ Sync accepted submissions automatically
  ☑ Create metadata.json
  ☐ Update README

Notifications
  ☑ Show successful sync notification
  ☑ Show sync errors
```

---

## 22. Error Handling

The extension should distinguish:

### Authentication errors

```text
GitHub authorization expired.
Please reconnect GitHub.
```

### Repository errors

```text
The selected repository is unavailable or you no longer have write access.
```

### Rate limiting

```text
GitHub rate limit reached.
The solution will be retried later.
```

### LeetCode API changes

```text
Unable to retrieve the latest LeetCode submission.
Please retry or check for an extension update.
```

### Duplicate

```text
This submission has already been synchronized.
```

### Unknown language

```text
Unsupported LeetCode language: XYZ.
Please configure a file extension.
```

Never silently lose a solution.

---

## 23. Retry Strategy

For transient GitHub failures:

```text
Attempt 1
   ↓
wait
   ↓
Attempt 2
   ↓
wait
   ↓
Attempt 3
   ↓
show failure
```

Use exponential backoff.

Do not aggressively retry authentication errors or permanent `4xx` errors.

---

## 24. Security Requirements

### Never

- Log GitHub access tokens.
- Put tokens in page DOM.
- Send tokens to LeetCode.
- Send tokens to an extension-owned backend unless absolutely necessary.
- Request unnecessary GitHub permissions.
- Store secrets in source code.
- Commit secrets into the user's repository.

### Do

- Use least-privilege GitHub authorization.
- Keep GitHub API calls in the extension service worker.
- Validate GitHub API responses.
- Sanitize generated paths.
- Restrict operations to the user-selected repository.
- Escape/sanitize problem slugs before constructing paths.
- Never allow arbitrary remote URLs from LeetCode to become filesystem/repository paths.

---

## 25. Content Security Policy

Follow Chrome Manifest V3 restrictions.

Avoid:

- `eval`
- dynamically generated executable JavaScript
- remotely hosted executable scripts

Bundle extension code locally.

---

## 26. Permissions

Keep `manifest.json` permissions minimal.

Likely requirements:

```json
{
  "permissions": [
    "storage",
    "notifications"
  ],
  "host_permissions": [
    "https://leetcode.com/*",
    "https://api.github.com/*"
  ]
}
```

Review the exact Chrome and GitHub authentication requirements before publishing because permissions and OAuth architecture may affect what belongs in `host_permissions`.

Do not request broad `<all_urls>` access.

---

## 27. Recommended Manifest Shape

Conceptual Manifest V3:

```json
{
  "manifest_version": 3,
  "name": "LeetCode GitHub Sync",
  "version": "0.1.0",
  "description": "Sync accepted LeetCode solutions to a selected GitHub repository.",
  "permissions": [
    "storage",
    "notifications"
  ],
  "host_permissions": [
    "https://leetcode.com/*",
    "https://api.github.com/*"
  ],
  "background": {
    "service_worker": "dist/background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html"
  },
  "options_page": "options.html",
  "content_scripts": [
    {
      "matches": [
        "https://leetcode.com/problems/*"
      ],
      "js": [
        "content.js"
      ]
    }
  ]
}
```

This is a starting point, not a final production manifest.

---

## 28. Message Passing

Use Chrome runtime messaging between content script and service worker.

Example:

```ts
chrome.runtime.sendMessage({
  type: "SUBMISSION_ACCEPTED",
  submission: normalizedSubmission
});
```

Service worker:

```ts
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SUBMISSION_ACCEPTED") {
    syncSubmission(message.submission);
  }
});
```

Keep GitHub credentials and GitHub API logic out of the page context.

---

## 29. Local Storage Schema

Suggested storage:

```ts
interface ExtensionSettings {
  githubOwner?: string;
  githubRepo?: string;
  githubBranch: string;
  rootDirectory: string;
  autoSync: boolean;
  createMetadata: boolean;
  updateReadme: boolean;
}

interface SyncState {
  syncedSubmissions: Record<string, SyncedSubmission>;
}
```

Use `chrome.storage.local` for non-sensitive state.

Use an appropriate secure approach for authentication credentials/tokens supported by the chosen GitHub auth flow.

---

## 30. Notifications

On successful sync:

```text
✓ LeetCode synced

#1 Two Sum → GitHub
```

On failure:

```text
⚠ LeetCode sync failed

#1 Two Sum could not be uploaded.
Open LeetCode Sync for details.
```

Avoid excessive notifications.

---

## 31. Initial MVP Scope

Build only:

1. Chrome Manifest V3 extension.
2. LeetCode problem-page detection.
3. Accepted submission detection.
4. Submission code retrieval.
5. Problem metadata retrieval.
6. GitHub authentication.
7. Repository selection.
8. Branch selection.
9. Automatic file creation/update.
10. Duplicate detection.
11. Success/error notification.
12. Basic popup showing sync status.

Do **not** start with:

- Analytics dashboard
- Complex README generation
- Multiple repository synchronization
- Backend infrastructure
- AI-generated explanations
- Automatic code refactoring
- Social features

---

## 32. Phase 2

After the MVP works reliably:

- Generated README
- Metadata files
- Runtime/memory statistics
- Multiple languages
- Multiple repositories
- Historical submission versions
- Manual "Sync now" button
- Sync history UI
- Retry queue
- Better offline behavior
- GitHub repository initialization
- Export/import settings

---

## 33. Phase 3

Potential advanced features:

- Daily/weekly solving statistics
- Contribution calendar
- LeetCode ↔ GitHub synchronization history
- Search solutions from extension
- Repository dashboard
- Optional generated explanations
- Tests generated from problem examples
- Local linting/formatting
- Commit templates
- Custom directory templates

These should not block the core synchronization workflow.

---

## 34. Important Product Principle

The extension should be positioned as:

> "Automatically back up and organize your genuine LeetCode solutions in GitHub."

Not:

> "Generate GitHub activity."

The GitHub activity should naturally result from meaningful commits containing actual solutions.

This keeps the repository useful to the user and avoids making the product solely about manipulating contribution-graph appearance.

---

## 35. Testing Strategy

### Unit tests

Test:

- Slug sanitization
- Problem path generation
- Language extension mapping
- Base64 encoding
- Commit message generation
- Duplicate detection
- Metadata generation

Example:

```ts
expect(
  solutionPath({
    number: 1,
    slug: "two-sum"
  })
).toBe("LeetCode/0001-two-sum/solution.py");
```

### Integration tests

Test against:

- Test GitHub repository
- Mock GitHub API
- Mock LeetCode API responses

Verify:

```text
Accepted submission
→ GitHub file created
→ GitHub commit created
→ sync state stored
```

### Browser tests

Verify:

- Extension loads.
- Content script runs on LeetCode.
- Accepted submission is detected.
- Failed submissions are ignored.
- Popup displays correct status.
- Settings persist.
- GitHub disconnect/reconnect works.

---

## 36. Edge Cases

Handle:

- User submits multiple times quickly.
- LeetCode UI changes.
- Same submission is detected twice.
- Same problem solved in multiple languages.
- Existing GitHub file was manually edited.
- GitHub branch does not exist.
- Repository becomes private/unavailable.
- User loses repository access.
- Network disappears during sync.
- GitHub returns rate-limit responses.
- LeetCode changes its internal GraphQL API.
- Submission code contains unusual Unicode.
- Problem slug contains unexpected characters.
- User changes repository after previous syncs.
- Extension service worker is restarted during synchronization.

---

## 37. Conflict Strategy

If a target file exists:

### Default behavior

Retrieve the existing file SHA and update it.

However, avoid silently overwriting a manually edited file.

A safer strategy is:

```text
Existing GitHub file
        ↓
Was it created by this extension?
        │
   ┌────┴─────┐
  YES         NO
   │           │
 Update      Ask user
```

For MVP, document that solution files are extension-managed.

A future version should maintain ownership metadata so manual edits can be detected.

---

## 38. Data Flow Example

User solves:

```text
LeetCode #1
Two Sum
Python
Accepted
```

Extension obtains:

```json
{
  "problemNumber": 1,
  "slug": "two-sum",
  "title": "Two Sum",
  "language": "python",
  "code": "class Solution: ...",
  "status": "Accepted"
}
```

Generates:

```text
LeetCode/0001-two-sum/solution.py
```

Generates commit:

```text
Solve LeetCode #1 - Two Sum
```

Calls GitHub:

```text
PUT
/repos/username/leetcode-solutions/contents/LeetCode/0001-two-sum/solution.py
```

Then records:

```json
{
  "submissionId": "123456789",
  "githubPath": "LeetCode/0001-two-sum/solution.py",
  "syncedAt": "2026-09-15T10:30:00Z"
}
```

---

## 39. Suggested Implementation Order

### Step 1 — Extension skeleton

Create:

```text
Manifest V3
TypeScript
React popup
Service worker
Content script
```

### Step 2 — LeetCode detection

Implement:

```text
Problem page
→ submission event
→ accepted status
```

Do this before GitHub integration.

### Step 3 — LeetCode data extraction

Implement:

```text
submission ID
problem number
slug
title
language
code
difficulty
timestamp
```

### Step 4 — GitHub authentication

Implement user authorization and authenticated API requests.

### Step 5 — Repository picker

Retrieve repositories and let the user choose one.

### Step 6 — File sync

Implement:

```text
Accepted
→ path
→ Base64
→ GitHub Contents API
→ commit
```

### Step 7 — Duplicate prevention

Persist submission IDs.

### Step 8 — UI

Show:

```text
Connected
Repository
Last sync
Sync history
Errors
```

### Step 9 — Hardening

Test:

- network errors
- API failures
- service-worker restarts
- duplicate events
- rate limits
- changed LeetCode UI/API

### Step 10 — Optional enhancements

README, metadata, statistics, multiple languages, etc.

---

## 40. Definition of Done for MVP

The MVP is complete when:

- [ ] User installs the extension.
- [ ] User connects GitHub.
- [ ] User selects a repository.
- [ ] User opens a LeetCode problem.
- [ ] User submits a solution.
- [ ] Failed submissions are ignored.
- [ ] Accepted submissions are detected.
- [ ] Source code is retrieved.
- [ ] Correct file extension is selected.
- [ ] Correct GitHub path is generated.
- [ ] Solution is committed to the selected repository.
- [ ] Duplicate submissions are not repeatedly committed.
- [ ] User receives a success notification.
- [ ] Errors are clearly displayed.
- [ ] GitHub credentials are not exposed to LeetCode/page scripts.
- [ ] The extension requests only necessary permissions.
- [ ] The repository contains genuine solution commits corresponding to actual accepted submissions.

---

## 41. Useful Existing Reference Projects

Existing open-source projects can be studied for implementation ideas, especially around LeetCode submission extraction and GitHub synchronization.

- LeetSync: https://github.com/LeetSync/LeetSync
- LeetHub: https://github.com/SyedMuhammadFaheem/LeetHub

These projects should be treated as references rather than dependencies unless their licenses and current implementations fit the project.

---

## 42. Official API Documentation

GitHub repository contents API:

https://docs.github.com/en/rest/repos/contents

GitHub authentication documentation should be consulted for the authorization architecture chosen for the production extension.

---

## 43. Final Recommended Stack

```text
Frontend
  React + TypeScript

Extension
  Chrome Manifest V3

State
  chrome.storage

LeetCode
  Internal GraphQL abstraction
  DOM fallback where necessary

GitHub
  GitHub REST API
  Contents API

Authentication
  GitHub OAuth/device authorization for production
  Fine-grained PAT for early MVP if necessary

Architecture
  Client-side only
  No backend required initially
```

The most important engineering decision is to isolate LeetCode integration behind a dedicated adapter because its internal APIs are not a stable public contract. GitHub integration should likewise be isolated behind a client module so authentication and repository operations can evolve without affecting the rest of the extension.
