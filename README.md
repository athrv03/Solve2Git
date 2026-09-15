# Solve2Git

Solve2Git is a Chrome extension that archives accepted LeetCode submissions to a GitHub repository you choose. Each accepted submission is retained independently:

```text
problems/0001-two-sum/python3/123456789.py
```

## GitHub App setup

Solve2Git uses a GitHub App user authorization token through the device flow. Create a GitHub App, enable **Device Flow**, and grant these repository permissions:

- **Contents: Read and write**
- **Metadata: Read-only**

Install the app on the repositories that Solve2Git may write to. Copy the app's **Client ID** (not the App ID), then build the extension with it:

```bash
VITE_GITHUB_CLIENT_ID=your_public_github_app_client_id npm run build
```

The device flow setup is described in GitHub's [GitHub App authorization documentation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app).

## Development and installation

```bash
npm install
npm test
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist/`. Open Solve2Git settings, connect GitHub, choose an installed writable repository and branch, then save.

## How syncing works

- Only complete, accepted submissions are queued.
- A submission ID is written at most once, even after page re-renders or browser restarts.
- Later accepted submissions remain separate versions rather than replacing older code.
- Jobs that fail are stored locally and can be retried from the popup or settings page.
- If automatic sync is disabled, accepted submissions are still queued for a later manual retry.

## Troubleshooting

- **Built without client ID:** rebuild with `VITE_GITHUB_CLIENT_ID` set to the GitHub App Client ID.
- **No repository appears:** confirm the GitHub App is installed on that repository and its user token has access to it.
- **Branch not found or no write access:** select an existing branch and ensure Contents permission is read/write.
- **Authorization expired:** reconnect GitHub from settings, then retry pending syncs.
- **LeetCode detection fails:** refresh the problem page; Solve2Git falls back to page parsing when LeetCode's internal GraphQL response changes.

## Privacy and security

GitHub access tokens and pending submissions are stored only in Chrome extension local storage. Solve2Git sends code only to the GitHub repository selected by the user and talks to LeetCode only from the active LeetCode page. It has no Solve2Git backend or analytics service.

The Chrome Web Store policy page is [docs/privacy-policy.html](docs/privacy-policy.html). After GitHub Pages is enabled, use its public URL in the Store listing’s Privacy Policy field.

## Release checklist

1. Build with the production GitHub App Client ID.
2. Load `dist/`, authorize, and select a writable test repository and branch.
3. Submit and accept a LeetCode solution; verify the versioned file and commit in GitHub.
4. Temporarily disconnect the network, confirm a pending job is shown, restore access, and retry it.
5. Disconnect GitHub, reconnect it, and verify pending jobs can be retried.
