# DSH LAN mode

Public package `@goodandready/dsh-lanmode`; host bridge and early browser shim.
Source: canonical Gitea repository. Production uses a DSH-installed package,
never the development worktree.

| Check | Command / acceptance |
| --- | --- |
| Unit and local integrations | `npm test` |
| Loader regression | `node --test test/shim.test.mjs` |
| Actual DSH lifecycle | `node test/integration/alpha-remotes.mjs /path/to/built-dsh` |
| Build / typecheck / lint | no scripts; JavaScript is shipped directly |
| Browser acceptance | no boot error; session list, composer, model selection |
| Deployment | exact published package via DSH, then approved service restart |

See [README](README.md), [agent constraints](AGENTS.md), and
[current repair plan](docs/plans/31-async-apply.md).
