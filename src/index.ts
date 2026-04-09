#!/usr/bin/env bun
import { program } from "commander";
import chalk from "chalk";
import { $ } from "bun";
import { getReflog, isGitRepo } from "./reflog.js";
import {
  displayEntries,
  displayUndoPreview,
  displaySuccess,
  displayError,
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
  .action(async (opts) => {
    if (!(await ensureGitRepo())) return;
    const entries = await getReflog(parseInt(opts.count));
    displayEntries(entries);
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

    try {
      const parts = entry.undoCommand.split(" ");
      const result = await $`${parts}`.quiet();
      displaySuccess(entry.undoCommand);
    } catch (err: any) {
      displayError(`Command failed: ${err.message || err}`);
      process.exit(1);
    }
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

    try {
      const parts = entry.undoCommand.split(" ");
      await $`${parts}`.quiet();
      displaySuccess(entry.undoCommand);
    } catch (err: any) {
      displayError(`Command failed: ${err.message || err}`);
      process.exit(1);
    }
  });

// Default action: show list
program.action(async () => {
  if (!(await ensureGitRepo())) return;
  const entries = await getReflog(10);
  displayEntries(entries);
});

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
