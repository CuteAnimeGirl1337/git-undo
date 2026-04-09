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
  "branch-create": "🌱",
  "branch-delete": "🗑️ ",
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

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const icon = ACTION_ICONS[entry.action] || "❔";
    const dangerLabel = DANGER_LABELS[entry.danger];
    const color = DANGER_COLORS[entry.danger];
    const hashShort = chalk.dim(entry.hash.slice(0, 7));
    const indexTag = chalk.bold.white(`#${i}`);

    console.log(
      `  ${indexTag}  ${icon} ${color(entry.description)}  ${hashShort}  ${chalk.dim(entry.timestamp)}`
    );

    if (entry.undoCommand) {
      console.log(
        `       ${dangerLabel}  undo: ${chalk.cyan(entry.undoCommand)}`
      );
    } else {
      console.log(`       ${dangerLabel}  ${chalk.dim("no simple undo available")}`);
    }
    console.log();
  }
}

export function displayEntriesJson(entries: ReflogEntry[]): void {
  const output = entries.map((entry, i) => ({
    index: i,
    hash: entry.hash,
    prevHash: entry.prevHash,
    action: entry.action,
    detail: entry.detail,
    description: entry.description,
    danger: entry.danger,
    undoCommand: entry.undoCommand,
    timestamp: entry.timestamp,
  }));
  console.log(JSON.stringify(output, null, 2));
}

export function displayUndoPreview(entry: ReflogEntry, showWarnings: boolean = true): void {
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

    if (showWarnings && entry.danger === "risky") {
      console.log(
        chalk.red.bold(
          "  ⚠  This is a risky operation — you may lose uncommitted changes!"
        )
      );
      console.log();
    } else if (showWarnings && entry.danger === "caution") {
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

export function displayInteractiveList(
  entries: ReflogEntry[],
  selectedIndex: number
): void {
  // Move cursor to top-left and clear screen
  process.stdout.write("\x1B[H\x1B[2J");

  console.log();
  console.log(
    chalk.bold("  git-undo interactive") +
      chalk.dim("  (↑/↓ navigate, Enter to undo, q to quit)")
  );
  console.log();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const icon = ACTION_ICONS[entry.action] || "❔";
    const dangerLabel = DANGER_LABELS[entry.danger];
    const color = DANGER_COLORS[entry.danger];
    const hashShort = chalk.dim(entry.hash.slice(0, 7));
    const isSelected = i === selectedIndex;

    const cursor = isSelected ? chalk.cyan.bold("> ") : "  ";
    const indexTag = chalk.bold.white(`#${i}`);
    const highlight = isSelected ? chalk.underline : (s: string) => s;

    console.log(
      `${cursor}${indexTag}  ${icon} ${highlight(color(entry.description))}  ${hashShort}  ${chalk.dim(entry.timestamp)}`
    );

    if (entry.undoCommand) {
      console.log(
        `       ${dangerLabel}  undo: ${chalk.cyan(entry.undoCommand)}`
      );
    } else {
      console.log(`       ${dangerLabel}  ${chalk.dim("no simple undo available")}`);
    }
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

export function displayWarning(message: string): void {
  console.log(chalk.yellow.bold(`  ⚠  ${message}`));
}
