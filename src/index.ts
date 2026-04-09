#!/usr/bin/env bun
import { program } from "commander";
import chalk from "chalk";
import { $ } from "bun";
import {
  getReflog,
  isGitRepo,
  hasUncommittedChanges,
  getInProgressOperation,
} from "./reflog.js";
import {
  displayEntries,
  displayEntriesJson,
  displayUndoPreview,
  displayInteractiveList,
  displaySuccess,
  displayError,
  displayWarning,
} from "./display.js";

program
  .name("git-undo")
  .description("Undo git mistakes in plain English")
  .version("1.0.0");

program
  .command("list")
  .alias("ls")
  .description("Show recent git actions in plain English")
  .option("-n, --count <number>", "Number of actions to show", "10")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    if (!(await ensureGitRepo())) return;
    const entries = await getReflog(parseInt(opts.count));
    if (opts.json) {
      displayEntriesJson(entries);
    } else {
      displayEntries(entries);
    }
  });

program
  .command("last")
  .description("Undo the last git action")
  .option("-y, --yes", "Skip confirmation", false)
  .action(async (opts) => {
    if (!(await ensureGitRepo())) return;

    const entries = await getReflog(1);
    if (entries.length === 0) {
      displayError("No actions found in reflog.");
      return;
    }

    const entry = entries[0];
    displayUndoPreview(entry);

    if (!entry.undoCommand) {
      process.exit(1);
      return;
    }

    if (!(await confirmSafetyChecks(entry, opts.yes))) return;

    if (!opts.yes) {
      process.stdout.write(
        chalk.bold("  Proceed? ") + chalk.dim("[y/N] ")
      );

      const answer = await readLine();
      if (answer.toLowerCase() !== "y") {
        console.log(chalk.dim("\n  Cancelled."));
        return;
      }
    }

    await executeUndo(entry);
  });

program
  .command("show <number>")
  .description("Show details of a specific action by its index (from list)")
  .action(async (number) => {
    if (!(await ensureGitRepo())) return;
    const idx = parseInt(number);
    const entries = await getReflog(idx + 1);

    if (idx >= entries.length) {
      displayError(`Action #${idx} not found. Only ${entries.length} actions in history.`);
      return;
    }

    const entry = entries[idx];
    displayUndoPreview(entry);
  });

program
  .command("undo <number>")
  .description("Undo a specific action by its index (from list)")
  .option("-y, --yes", "Skip confirmation", false)
  .action(async (number, opts) => {
    if (!(await ensureGitRepo())) return;
    const idx = parseInt(number);
    const entries = await getReflog(idx + 1);

    if (idx >= entries.length) {
      displayError(`Action #${idx} not found.`);
      return;
    }

    const entry = entries[idx];
    displayUndoPreview(entry);

    if (!entry.undoCommand) {
      process.exit(1);
      return;
    }

    if (!(await confirmSafetyChecks(entry, opts.yes))) return;

    if (!opts.yes) {
      process.stdout.write(
        chalk.bold("  Proceed? ") + chalk.dim("[y/N] ")
      );
      const answer = await readLine();
      if (answer.toLowerCase() !== "y") {
        console.log(chalk.dim("\n  Cancelled."));
        return;
      }
    }

    await executeUndo(entry);
  });

program
  .command("diff")
  .description("Show what would change if you undo the last action")
  .option("-n, --number <number>", "Show diff for action at index N", "0")
  .action(async (opts) => {
    if (!(await ensureGitRepo())) return;
    const idx = parseInt(opts.number);
    const entries = await getReflog(idx + 1);

    if (entries.length === 0) {
      displayError("No actions found in reflog.");
      return;
    }

    if (idx >= entries.length) {
      displayError(`Action #${idx} not found.`);
      return;
    }

    const entry = entries[idx];
    const targetHash = entry.prevHash || null;

    if (!targetHash) {
      displayError("No previous hash available to diff against.");
      return;
    }

    console.log();
    console.log(
      chalk.bold("  Diff preview: ") +
        chalk.dim(`what changes if you undo action #${idx}`)
    );
    console.log(
      chalk.dim(`  (HEAD vs ${targetHash.slice(0, 7)})`)
    );
    console.log();

    try {
      const result = await $`git diff HEAD ${targetHash}`.quiet();
      const diffOutput = result.text();
      if (diffOutput.trim().length === 0) {
        console.log(chalk.dim("  No differences found."));
      } else {
        // Colorize diff output
        for (const line of diffOutput.split("\n")) {
          if (line.startsWith("+") && !line.startsWith("+++")) {
            process.stdout.write(chalk.green(line) + "\n");
          } else if (line.startsWith("-") && !line.startsWith("---")) {
            process.stdout.write(chalk.red(line) + "\n");
          } else if (line.startsWith("@@")) {
            process.stdout.write(chalk.cyan(line) + "\n");
          } else if (line.startsWith("diff ") || line.startsWith("index ")) {
            process.stdout.write(chalk.bold(line) + "\n");
          } else {
            process.stdout.write(line + "\n");
          }
        }
      }
    } catch (err: any) {
      displayError(`Failed to generate diff: ${err.message || err}`);
    }
    console.log();
  });

// Default action: interactive mode (no args)
program.action(async () => {
  if (!(await ensureGitRepo())) return;

  // Check if stdout is a TTY — if not, fall back to list
  if (!process.stdin.isTTY) {
    const entries = await getReflog(10);
    displayEntries(entries);
    return;
  }

  const entries = await getReflog(15);
  if (entries.length === 0) {
    displayError("No git history found.");
    return;
  }

  await runInteractive(entries);
});

async function runInteractive(entries: import("./reflog.js").ReflogEntry[]) {
  let selectedIndex = 0;
  const maxIndex = entries.length - 1;

  // Render initial view
  displayInteractiveList(entries, selectedIndex);

  // Enter raw mode for arrow key handling
  const stdin = process.stdin;
  stdin.setRawMode?.(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  return new Promise<void>((resolve) => {
    const onData = async (key: string) => {
      // Ctrl+C or q to quit
      if (key === "\u0003" || key === "q" || key === "Q") {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\x1B[H\x1B[2J"); // clear screen
        console.log(chalk.dim("  Cancelled."));
        resolve();
        return;
      }

      // Arrow up or k
      if (key === "\u001B[A" || key === "k") {
        selectedIndex = Math.max(0, selectedIndex - 1);
        displayInteractiveList(entries, selectedIndex);
        return;
      }

      // Arrow down or j
      if (key === "\u001B[B" || key === "j") {
        selectedIndex = Math.min(maxIndex, selectedIndex + 1);
        displayInteractiveList(entries, selectedIndex);
        return;
      }

      // Enter to select
      if (key === "\r" || key === "\n") {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\x1B[H\x1B[2J"); // clear screen

        const entry = entries[selectedIndex];
        displayUndoPreview(entry);

        if (!entry.undoCommand) {
          resolve();
          return;
        }

        if (!(await confirmSafetyChecks(entry, false))) {
          resolve();
          return;
        }

        process.stdout.write(
          chalk.bold("  Proceed? ") + chalk.dim("[y/N] ")
        );
        const answer = await readLine();
        if (answer.toLowerCase() !== "y") {
          console.log(chalk.dim("\n  Cancelled."));
          resolve();
          return;
        }

        await executeUndo(entry);
        resolve();
        return;
      }
    };

    stdin.on("data", onData);
  });
}

/**
 * Run safety checks before executing a risky undo.
 * Returns true if it's safe to proceed, false if the user should stop.
 */
async function confirmSafetyChecks(
  entry: import("./reflog.js").ReflogEntry,
  skipPrompt: boolean
): Promise<boolean> {
  if (entry.danger !== "risky") return true;

  // Check for in-progress operations
  const inProgress = await getInProgressOperation();
  if (inProgress) {
    displayWarning(
      `A ${inProgress} is currently in progress. Undoing now may leave your repo in a broken state.`
    );
    if (skipPrompt) {
      console.log(chalk.red("  Aborting due to in-progress operation."));
      console.log();
      return false;
    }
    process.stdout.write(
      chalk.bold("  Continue anyway? ") + chalk.dim("[y/N] ")
    );
    const answer = await readLine();
    if (answer.toLowerCase() !== "y") {
      console.log(chalk.dim("\n  Cancelled."));
      return false;
    }
  }

  // Check for uncommitted changes
  if (await hasUncommittedChanges()) {
    displayWarning(
      "You have uncommitted changes. This risky undo may destroy them."
    );
    console.log(
      chalk.yellow(
        "  Consider committing or stashing your changes first."
      )
    );
    console.log();
    if (skipPrompt) {
      // With -y flag + uncommitted changes on risky op, still warn but proceed
      return true;
    }
    process.stdout.write(
      chalk.bold("  Continue anyway? ") + chalk.dim("[y/N] ")
    );
    const answer = await readLine();
    if (answer.toLowerCase() !== "y") {
      console.log(chalk.dim("\n  Cancelled."));
      return false;
    }
  }

  return true;
}

async function executeUndo(entry: import("./reflog.js").ReflogEntry) {
  if (!entry.undoCommand) return;
  try {
    const parts = entry.undoCommand.split(" ");
    await $`${parts}`.quiet();
    displaySuccess(entry.undoCommand);
  } catch (err: any) {
    displayError(`Command failed: ${err.message || err}`);
    process.exit(1);
  }
}

async function ensureGitRepo(): Promise<boolean> {
  if (await isGitRepo()) return true;
  displayError("Not a git repository. Run this inside a git project.");
  process.exit(1);
  return false;
}

function readLine(): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode?.(false);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.once("data", (data) => {
      stdin.pause();
      resolve(data.toString().trim());
    });
  });
}

program.parse();
