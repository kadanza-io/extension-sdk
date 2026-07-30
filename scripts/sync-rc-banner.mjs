/**
 * Inserts or removes the RC banner in README.md.
 * Called by `release:rc:enter` / `release:rc:exit` so the banner stays in sync with Changesets pre mode.
 * Usage: node scripts/sync-rc-banner.mjs <enter|exit>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const README_PATH = join(ROOT, "README.md");
const TITLE = "# @kadanza/extension-sdk";
const START = "<!-- rc-banner:start -->";
const END = "<!-- rc-banner:end -->";

const BANNER = `${START}
> [!IMPORTANT]
> **This is a Release candidate version.** \`main\` is the only release branch. 
> It publishes **stable** (\`latest\`) and **RC** (\`rc\`) from the same line — not separate long-lived branches.
> More information on [docs/releasing.md](docs/releasing.md).
${END}
`;

const BLOCK_RE = new RegExp(
  `${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}\\n?`,
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sync(mode) {
  let readme = readFileSync(README_PATH, "utf8");
  const hasBlock = BLOCK_RE.test(readme);

  if (mode === "exit") {
    if (!hasBlock) return;
    writeFileSync(
      README_PATH,
      readme.replace(BLOCK_RE, "").replace(
        new RegExp(`^${escapeRegExp(TITLE)}\\n+`),
        `${TITLE}\n\n`,
      ),
    );
    return;
  }

  if (mode === "enter") {
    if (hasBlock) return;
    if (!readme.startsWith(`${TITLE}\n`)) {
      throw new Error(
        `Expected README.md to start with "${TITLE}" so the RC banner can be inserted.`,
      );
    }
    writeFileSync(
      README_PATH,
      readme.replace(`${TITLE}\n`, `${TITLE}\n\n${BANNER}`),
    );
    return;
  }

  throw new Error(`Usage: node scripts/sync-rc-banner.mjs <enter|exit>`);
}

sync(process.argv[2]);
