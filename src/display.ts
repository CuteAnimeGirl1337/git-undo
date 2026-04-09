import chalk from "chalk";
import type { ReflogEntry } from "./reflog.js";

const DANGER_COLORS = {
  safe: chalk.green,
  caution: chalk.yellow,
  risky: chalk.red,
};

const DANGER_LABELS = {
  safe: chalk.green("● safe"),
  caution: chalk.yellow("● caution"),
  risky: chalk.red("● risky"),
};

const ACTION_ICONS: Record<string, string> = {
  commit: "✏️ ",
  amend: "📝",
  "merge-commit": "🔀",
  checkout: "👉",
  pull: "⬇️ ",
  rebase: "♻️ ",
  reset: "⏪",
  merge: "🔀",
  "cherry-pick": "🍒",
  branch: "🌿",
  stash: "📦",
  unknown: "❔",
};

export function displayEntries(entries: ReflogEntry[]): void {
  if (entries.length === 0) {
    console.log(chalk.dim("  No git history found."));
    return;
  }

  console.log();
  console.log(
    chalk.bold("  Your recent git actions:") +
      chalk.dim("  (newest first)")
  );
  console.log();

  for (const entry of entries) {
    const icon = ACTION_ICONS[entry.action] || "❔";
    const dangerLabel = DANGER_LABELS[entry.danger];
    const color = DANGER_COLORS[entry.danger];
    const hashShort = chalk.dim(entry.hash.slice(0, 7));

    console.log(
      `  ${icon} ${color(entry.description)}  ${hashShort}  ${chalk.dim(entry.timestamp)}`
    );

    if (entry.undoCommand) {
      console.log(
        `     ${dangerLabel}  undo: ${chalk.cyan(entry.undoCommand)}`
      );
    } else {
      console.log(`     ${dangerLabel}  ${chalk.dim("no simple undo available")}`);
    }
    console.log();
  }
}

export function displayUndoPreview(entry: ReflogEntry): void {
  console.log();
  console.log(chalk.bold("  Undoing your last action:"));
  console.log();

  const icon = ACTION_ICONS[entry.action] || "❔";
  const color = DANGER_COLORS[entry.danger];

  console.log(`  ${icon} ${color(entry.description)}`);
  console.log(`     ${chalk.dim(entry.timestamp)}`);
  console.log();

  if (entry.undoCommand) {
    console.log(`  Will run: ${chalk.cyan.bold(entry.undoCommand)}`);
    console.log();

    if (entry.danger === "risky") {
      console.log(
        chalk.red.bold(
          "  ⚠  This is a risky operation — you may lose uncommitted changes!"
        )
      );
      console.log();
    } else if (entry.danger === "caution") {
      console.log(
        chalk.yellow("  ⚠  This operation modifies your history. Proceed with care.")
      );
      console.log();
    }
  } else {
    console.log(
      chalk.dim("  No simple undo available for this action.")
    );
    console.log(
      chalk.dim(
        `  You can manually reset to before this action with: git reset --hard ${entry.prevHash || "HEAD@{1}"}`
      )
    );
    console.log();
  }
}

export function displaySuccess(command: string): void {
  console.log(chalk.green.bold("  ✓ Done!") + chalk.dim(` Ran: ${command}`));
  console.log();
}

export function displayError(message: string): void {
  console.log(chalk.red.bold(`  ✗ ${message}`));
  console.log();
}
