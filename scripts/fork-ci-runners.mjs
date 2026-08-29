// Re-points this fork's PR-gating workflows at GitHub-hosted runners.
//
// Upstream runs CI on `blacksmith-*` labels, which resolve to runners owned by
// their Blacksmith account. Blacksmith is organization-only, and this fork sits
// under a personal account, so those labels match nothing here: jobs sit QUEUED
// forever instead of failing. The tell is an empty `runner=` on a queued job.
//
// Every upstream sync that touches these files reintroduces the labels, so this
// is a re-apply, not a one-off. Run it after merging upstream/main:
//
//   node scripts/fork-ci-runners.mjs           # rewrite in place
//   node scripts/fork-ci-runners.mjs --check   # exit 1 if any remain
//
// Only the two workflows that gate pull requests are rewritten. The release and
// deploy workflows keep their Blacksmith labels on purpose: they need secrets
// this fork does not have, so remapping them would turn a harmless hang into a
// noisy failure. They are disabled at the repository instead
// (`gh workflow disable <file>`), which needs no file change and so survives a
// sync untouched.
import * as NodeFS from "node:fs";

const TARGETS = [".github/workflows/ci.yml", ".github/workflows/mobile-fingerprint-check.yml"];

// GitHub's own labels for the images Blacksmith mirrors. Anything not listed is
// left alone and reported, so an upstream move to a new image surfaces here
// rather than silently writing a label no runner answers to.
const KNOWN = new Set(["ubuntu-24.04", "macos-26", "macos-15", "windows-2025"]);

// blacksmith-8vcpu-ubuntu-2404 -> ubuntu-24.04, blacksmith-6vcpu-macos-26 -> macos-26.
// The vCPU count is Blacksmith's sizing knob and has no GitHub equivalent.
const hostedLabel = (blacksmithLabel) => {
  const os = blacksmithLabel.replace(/^blacksmith-\d+vcpu-/, "");
  const ubuntu = os.match(/^ubuntu-(\d{2})(\d{2})$/);
  return ubuntu ? `ubuntu-${ubuntu[1]}.${ubuntu[2]}` : os;
};

const check = process.argv.includes("--check");
const changes = [];
const unknown = [];

for (const file of TARGETS) {
  const before = NodeFS.readFileSync(file, "utf8");
  const after = before.replace(
    /^(\s*runs-on: )(blacksmith-\S+)$/gm,
    (line, prefix, blacksmithLabel) => {
      const replacement = hostedLabel(blacksmithLabel);
      if (!KNOWN.has(replacement)) {
        unknown.push(`${file}: ${blacksmithLabel} -> ${replacement}`);
        return line;
      }
      changes.push(`${file}: ${blacksmithLabel} -> ${replacement}`);
      return `${prefix}${replacement}`;
    },
  );
  if (!check && after !== before) NodeFS.writeFileSync(file, after);
}

for (const entry of unknown) console.error(`Unrecognised image, left as-is: ${entry}`);
for (const entry of changes) console.log(`${check ? "Would rewrite" : "Rewrote"} ${entry}`);

if (unknown.length > 0) {
  console.error(`\nAdd the GitHub label for ${unknown.length} image(s) to KNOWN, then re-run.`);
  process.exit(1);
}

if (changes.length === 0) {
  console.log("All PR-gating workflows already target GitHub-hosted runners.");
} else if (check) {
  console.error(`\n${changes.length} Blacksmith label(s) remain. Run without --check to fix.`);
  process.exit(1);
}
