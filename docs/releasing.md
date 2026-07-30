# Releasing

**Releases use a single branch: `main`.** Stable (`latest`) and Release candidate (`rc`) publish from there.
Feature branches use **canary** for pre-merge testing.

| Channel | When                                                         | Install                               |
| ------- | ------------------------------------------------------------ | ------------------------------------- |
| Stable  | After a Version Packages PR on `main`                        | `npm i @kadanza/extension-sdk`        |
| RC      | While `main` is in pre mode (`pre.json` has `"mode": "pre"`) | `npm i @kadanza/extension-sdk@rc`     |
| Canary  | Manual Snapshot workflow on a feature branch                 | `npm i @kadanza/extension-sdk@canary` |

We use [Changesets](https://github.com/changesets/changesets). A **changeset** is a short note in `.changeset/` (e.g. `.changeset/sunny-keys-dance.md`) that says how to bump the version and what to put in the changelog. Without one, your work will not ship in a stable/RC release (and canary will refuse to publish).

Those files are **not** the changelog. On the **Version Packages** PR, CI runs `changeset version`, which:

1. Bumps `package.json`
2. Appends your notes into `CHANGELOG.md` (creates it if needed)
3. Deletes the consumed `.changeset/*.md` files

Canary Snapshot does **not** update `CHANGELOG.md` on the branch.

> [!IMPORTANT]
> Do **not** edit `CHANGELOG.md` by hand. Change release notes by editing or adding changeset files before they are consumed.

**One-time setup:** npm Automation token with publish access → GitHub secret `NPM_TOKEN`.

## Most common flow: ship a feature

You iterate on a branch, you optionally publish canaries to do some early testing for extension app build, then merge to `main`.

### 1. Start the feature

```bash
git checkout -b feature/my-thing
# …code…
```

### 2. Add a changeset (when the change is worth releasing)

```bash
npm run changeset
```

Pick `patch` / `minor` / `major` and write a short consumer-facing note. Commit the new `.changeset/*.md` file with your branch.

You do **not** need a new changeset for every commit or every canary. One changeset covering the feature is enough for most PRs. Add another only if you introduce a separate bump (e.g. an unrelated fix on the same branch), or replace/edit the existing file if the note should change.

If you only want a canary and have nothing release-worthy yet:

```bash
npx changeset add --empty
```

### 3. Test with canary (optional, as often as you like)

Push the branch, then: GitHub → Actions → **Snapshot** → Run workflow → select your branch.

```bash
npm install @kadanza/extension-sdk@canary
# or pin 0.0.0-canary-… from the job log
```

Keep coding and re-run Snapshot whenever you want a new build. Each run overwrites the `canary` tag. Do **not** commit the temporary version bumps the job applies.

### 4. Open the PR and merge to `main`

Include the changeset file(s) in the PR. After merge, CI opens or updates a **Version Packages** PR — that is when changesets become `CHANGELOG.md` entries and the `.changeset/*.md` files are removed. Review and merge that PR → CI publishes to `latest` (or `rc` if pre mode is active).

## RC series on `main`

Shared “almost stable” channel for combing features which you want to release and test together before promoting to the public officially (npm latest).
In this case `pre.json` has `"mode": "pre"`, Version Packages publishes go to `rc` tag.

```bash
npm run release:rc:enter   # creates/updates pre.json + README banner
# commit both, merge to main, then ship features as usual
npm run release:rc:exit    # sets mode to "exit" + removes banner
# commit both, merge; next Version Packages run deletes pre.json and publishes stable
```

`release:rc:exit` does **not** delete `pre.json` immediately — it sets `"mode": "exit"`. The file is removed on the next `changeset version` (the Version Packages PR).

> [!IMPORTANT] **Do not edit the README RC banner by hand; enter/exit npm scripts are responsible for that.**

## Commands you’ll use

| You run                             | What it does                                           |
| ----------------------------------- | ------------------------------------------------------ |
| `npm run changeset`                 | Add a changeset for the eventual release               |
| `npx changeset add --empty`         | Changeset with no bump note (canary-only escape hatch) |
| GitHub Actions → **Snapshot**       | Publish current branch to `@canary`                    |
| `npm run release:rc:enter` / `exit` | Start/end RC mode on `main`                            |

CI-only (you rarely run these locally): `version-packages`, `version-packages:snapshot`, `release`, `release:canary`.
