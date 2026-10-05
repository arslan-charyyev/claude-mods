# claude-mods

My private Claude Code mods. Each folder is one mod: a plugin with function hooks that runs inside Claude Code. See the [mods documentation](https://code.claude.com/docs/en/plugins/mods/overview).

| Mod | What it does |
| --- | --- |
| [`turkish-practice`](turkish-practice/) | Turkish flashcards with spaced repetition from my daily lessons, in a band above the prompt and a `/tr` pane of the Desktop Code tab |

## Load a mod

Add the mod's folder to `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`, separated by `:` from other folders. Every new session then loads it, and an interactive session reloads it when a file changes:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/mnt/data/Dev/projects/linux/arslan-charyyev/claude-mods/turkish-practice" } }
```

## Check and test a mod

```
claude plugin validate turkish-practice
cd turkish-practice && capped claude plugin test
```
