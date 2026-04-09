# git-undo

> Undo git mistakes in plain English. No more deciphering `git reflog`.

<p align="center">
  <img src="demo.svg" alt="git-undo demo" width="700">
</p>

Every developer has panicked after a bad `git reset`, accidental `commit --amend`, or wrong branch checkout. `git-undo` shows your recent actions in **human-readable language** and lets you reverse them with one command.

---

## Quick Start

```bash
git clone https://github.com/CuteAnimeGirl1337/git-undo.git
cd git-undo
bun install
```

### Run directly

```bash
bun src/index.ts
```

### Install globally (use `git-undo` from anywhere)

```bash
bun build src/index.ts --outfile bin/git-undo.js --target node
bun link
```

Then you can use it from any git repo:

```bash
git-undo
```

---

## Before & After

**Before** (raw `git reflog`):
```
a1b2c3d HEAD@{0}: checkout: moving from feature-branch to master
e4f5g6h HEAD@{1}: commit: wip: new stuff
i7j8k9l HEAD@{2}: checkout: moving from master to feature-branch
```

**After** (`git-undo`):
```
👉 Switched from branch 'feature-branch' to 'master'  a1b2c3d  2m ago
   ● safe  undo: git checkout feature-branch

✏️  Created a new commit: "wip: new stuff"  e4f5g6h  3m ago
   ● safe  undo: git reset --soft HEAD~1

👉 Switched from branch 'master' to 'feature-branch'  i7j8k9l  3m ago
   ● safe  undo: git checkout master
```

Each action shows:
- **What happened** in plain English
- **Danger level** — 🟢 safe, 🟡 caution, 🔴 risky
- **Exact undo command** to reverse it

---

## Usage

```bash
git-undo                # Show recent actions (default)
git-undo list           # Same thing, explicitly
git-undo list -n 25     # Show more history
git-undo last           # Undo last action (asks for confirmation)
git-undo last -y        # Undo without confirmation
git-undo show 3         # Show details of action #3
git-undo undo 3         # Undo a specific action by index
```

## Danger Levels

| Level | Meaning |
|-------|---------|
| 🟢 **safe** | Easily reversible (checkout, simple commit) |
| 🟡 **caution** | Modifies history, but recoverable (amend, merge, pull) |
| 🔴 **risky** | May lose uncommitted work (rebase, hard reset) |

## Supported Actions

`commit` · `commit --amend` · `checkout` / `switch` · `merge` · `rebase` · `reset` · `pull` · `cherry-pick` · `stash`

## Requirements

- Git 2.x+
- [Bun](https://bun.sh)

## License

MIT
