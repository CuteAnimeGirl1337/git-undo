import { $ } from "bun";

export interface ReflogEntry {
  hash: string;
  prevHash: string;
  index: number;
  action: string;
  detail: string;
  description: string;
  danger: "safe" | "caution" | "risky";
  undoCommand: string | null;
  timestamp: string;
}

/**
 * Check if we're inside a git repository.
 */
export async function isGitRepo(): Promise<boolean> {
  try {
    await $`git rev-parse --is-inside-work-tree`.quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if there are uncommitted changes (staged or unstaged).
 */
export async function hasUncommittedChanges(): Promise<boolean> {
  try {
    const result = await $`git status --porcelain`.quiet();
    return result.text().trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if we're in the middle of a rebase, merge, or cherry-pick.
 */
export async function getInProgressOperation(): Promise<string | null> {
  try {
    const gitDir = (await $`git rev-parse --git-dir`.quiet()).text().trim();

    // Check rebase
    try {
      await $`test -d ${gitDir}/rebase-merge`.quiet();
      return "rebase";
    } catch {}
    try {
      await $`test -d ${gitDir}/rebase-apply`.quiet();
      return "rebase";
    } catch {}

    // Check merge
    try {
      await $`test -f ${gitDir}/MERGE_HEAD`.quiet();
      return "merge";
    } catch {}

    // Check cherry-pick
    try {
      await $`test -f ${gitDir}/CHERRY_PICK_HEAD`.quiet();
      return "cherry-pick";
    } catch {}

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse the git reflog into human-readable entries.
 */
export async function getReflog(count: number = 20): Promise<ReflogEntry[]> {
  if (count <= 0) count = 20;
  let result;
  try {
    result = await $`git reflog --format="%H %P %gd %gs %ci" -n ${count}`.quiet();
  } catch {
    return [];
  }
  const lines = result.text().trim().split("\n").filter(Boolean);

  const entries: ReflogEntry[] = [];

  for (const line of lines) {
    // Format: hash parent1 [parent2...] HEAD@{n} action timestamp
    // Merge commits have multiple parents, so we match greedily up to HEAD@{n}
    const match = line.match(
      /^(\S+)\s+(.*?)\s*HEAD@\{(\d+)\}\s+(.+?)\s+(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}.*)$/
    );
    if (!match) continue;

    const [, hash, parentStr, indexStr, rawAction, timestamp] = match;
    // Take only the first parent as prevHash (for merge commits, this is the branch we merged into)
    const prevHash = parentStr.trim().split(/\s+/)[0] || "";
    const index = parseInt(indexStr);
    const parsed = parseAction(rawAction, hash, prevHash, index);

    entries.push({
      hash,
      prevHash: prevHash || "",
      index,
      timestamp: formatTimestamp(timestamp),
      ...parsed,
    });
  }

  return entries;
}

interface ParsedAction {
  action: string;
  detail: string;
  description: string;
  danger: "safe" | "caution" | "risky";
  undoCommand: string | null;
}

function parseAction(
  raw: string,
  hash: string,
  prevHash: string,
  index: number
): ParsedAction {
  const r = raw.toLowerCase();

  // commit
  if (r.startsWith("commit:") || r.startsWith("commit (initial):")) {
    const msg = raw.replace(/^commit(\s*\(initial\))?:\s*/i, "");
    return {
      action: "commit",
      detail: msg,
      description: `Created a new commit: "${msg}"`,
      danger: "safe",
      undoCommand: `git reset --soft HEAD~1`,
    };
  }

  // commit (amend)
  if (r.startsWith("commit (amend):")) {
    const msg = raw.replace(/^commit \(amend\):\s*/i, "");
    return {
      action: "amend",
      detail: msg,
      description: `Amended the last commit to: "${msg}"`,
      danger: "caution",
      undoCommand: prevHash ? `git reset --soft ${prevHash}` : null,
    };
  }

  // commit (merge)
  if (r.startsWith("commit (merge):")) {
    const msg = raw.replace(/^commit \(merge\):\s*/i, "");
    return {
      action: "merge-commit",
      detail: msg,
      description: `Merge commit: "${msg}"`,
      danger: "caution",
      undoCommand: prevHash ? `git reset --hard ${prevHash}` : `git reset --hard HEAD~1`,
    };
  }

  // checkout / switch — also detect branch creation
  if (r.startsWith("checkout:")) {
    const detail = raw.replace(/^checkout:\s*/i, "");
    const branchMatch = detail.match(
      /moving from (\S+) to (\S+)/
    );
    if (branchMatch) {
      // Detect if the target hash equals the source hash — indicates branch creation
      // (When creating a branch, git checks out to the same commit)
      return {
        action: "checkout",
        detail,
        description: `Switched from branch '${branchMatch[1]}' to '${branchMatch[2]}'`,
        danger: "safe",
        undoCommand: `git checkout ${branchMatch[1]}`,
      };
    }
    return {
      action: "checkout",
      detail,
      description: `Checked out: ${detail}`,
      danger: "safe",
      undoCommand: prevHash ? `git checkout ${prevHash}` : null,
    };
  }

  // pull
  if (r.startsWith("pull:")) {
    const detail = raw.replace(/^pull:\s*/i, "");
    return {
      action: "pull",
      detail,
      description: `Pulled changes (fast-forward)`,
      danger: "caution",
      undoCommand: prevHash ? `git reset --hard ${prevHash}` : null,
    };
  }

  // rebase
  if (r.includes("rebase")) {
    const detail = raw.replace(/^rebase\s*(\([^)]*\))?:\s*/i, "");
    if (r.includes("finish")) {
      return {
        action: "rebase",
        detail,
        description: `Finished a rebase`,
        danger: "risky",
        undoCommand: prevHash ? `git reset --hard ${prevHash}` : null,
      };
    }
    return {
      action: "rebase",
      detail,
      description: `Rebase step: ${detail}`,
      danger: "risky",
      undoCommand: null,
    };
  }

  // reset
  if (r.startsWith("reset:")) {
    const detail = raw.replace(/^reset:\s*/i, "");
    return {
      action: "reset",
      detail,
      description: `Reset HEAD to: ${detail}`,
      danger: "risky",
      undoCommand: prevHash ? `git reset --hard ${prevHash}` : null,
    };
  }

  // merge
  if (r.startsWith("merge")) {
    const detail = raw.replace(/^merge\s*\S*:\s*/i, "");
    return {
      action: "merge",
      detail,
      description: `Merged: ${detail}`,
      danger: "caution",
      undoCommand: prevHash ? `git reset --hard ${prevHash}` : `git reset --hard HEAD~1`,
    };
  }

  // cherry-pick
  if (r.startsWith("cherry-pick:")) {
    const detail = raw.replace(/^cherry-pick:\s*/i, "");
    return {
      action: "cherry-pick",
      detail,
      description: `Cherry-picked: "${detail}"`,
      danger: "safe",
      undoCommand: `git reset --soft HEAD~1`,
    };
  }

  // branch creation: "branch: Created from ..."
  if (r.startsWith("branch: created from")) {
    const detail = raw.replace(/^branch:\s*/i, "");
    const fromMatch = detail.match(/Created from\s+(.+)/i);
    return {
      action: "branch-create",
      detail,
      description: `Created branch from ${fromMatch ? fromMatch[1] : "unknown"}`,
      danger: "safe",
      undoCommand: null, // branch creation is benign; deleting requires knowing the name
    };
  }

  // branch (other operations, clone)
  if (r.startsWith("clone:") || r.startsWith("branch:")) {
    return {
      action: "branch",
      detail: raw,
      description: `Branch operation: ${raw}`,
      danger: "safe",
      undoCommand: null,
    };
  }

  // stash — detailed detection
  if (r.includes("stash")) {
    // "WIP on branch: hash message" is a stash push
    if (r.startsWith("wip on") || r.startsWith("on ") || r.includes("stash:")) {
      return {
        action: "stash",
        detail: raw,
        description: `Stashed changes: ${raw}`,
        danger: "safe",
        undoCommand: `git stash pop`,
      };
    }
    return {
      action: "stash",
      detail: raw,
      description: `Stash operation: ${raw}`,
      danger: "safe",
      undoCommand: `git stash pop`,
    };
  }

  // fallback
  return {
    action: "unknown",
    detail: raw,
    description: raw,
    danger: "caution",
    undoCommand: prevHash ? `git reset --hard ${prevHash}` : null,
  };
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts.trim());
  if (isNaN(date.getTime())) return ts.trim();

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}
