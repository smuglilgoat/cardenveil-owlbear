# Docs

Two directories here are synced to GitBook. Everything else is internal and
never published.

| Directory | GitBook space | Site path |
|---|---|---|
| `docs/documentation/` | Documentation | `/documentation` |
| `docs/changelog/` | Changelog | `/changelog` |

Each mapped directory is a self-contained space: its own `.gitbook.yaml`,
`README.md` (first page) and `SUMMARY.md` (navigation). `SUMMARY.md` is the
authoritative navigation — a page missing from it is not published.

Edit published content in GitBook. GitBook commits the result back to this repo,
so expect a conflict if the same page is also edited here. Keep every referenced
asset inside its space directory; Git Sync does not share assets between spaces.

## Not published

Internal material, deliberately outside both mapped directories:

- `docs/agent-sessions/` — session logs.
- `docs/design/` — UI prototypes and proposals.
- `docs/archive/` — historical material (e.g. the Firebase notes).

Legacy sources kept in place because `src/lib/attackRoll.js` and `AGENTS.md`
still cite them. Their published equivalents live under `docs/documentation/`:

| Legacy file | Published as |
|---|---|
| `docs/system-overview.md` | `docs/documentation/architecture/system-overview.md` and its siblings |
| `docs/debug-live-room.md` | `docs/documentation/operations/debug-live-room.md` |
| `docs/Reglejetdattaque.md` + `docs/patch.md` | `docs/documentation/game-rules/damage-rolls.md` |
| `docs/character-sheet-analysis.md` | not published (outdated planning doc) |

## Git Sync setup

Configured once in the GitBook app, not scriptable. Map `Documentation` →
`./docs/documentation` and `Changelog` → `./docs/changelog`. GitBook writes
`gitbook-docs.yaml` at the repo root and generates the space `key`s — do not
hand-write them, changing a key replaces the space with a new one.

The first sync must be **Git → GitBook**, so this repository replaces the empty
GitBook content. Choosing the other direction overwrites this repo.
