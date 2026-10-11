# The daily lesson job

A scheduled task of Claude Desktop writes my Turkish lesson and cards each day. The mod reads what it writes, and it reads back my answers from the mod. These two files are its prompts:

| File | What it is | Where it is used |
| --- | --- | --- |
| [`DAILY-LESSON-PROMPT.md`](DAILY-LESSON-PROMPT.md) | The full rules: the lesson design, the cards file format, how to read my answers, and how to choose the next lesson | `~/.claude/turkish/DAILY-LESSON-PROMPT.md` is a symlink to this file, so an edit here reaches the next run |
| [`ROUTINE-PROMPT.md`](ROUTINE-PROMPT.md) | The routine's own prompt: it reads the full rules first, and repeats them in short form for a run where that file is missing | A copy. The scheduler keeps the live prompt in `~/.claude/scheduled-tasks/daily-turkish-lesson/SKILL.md` and rewrites that file on each update |

The routine is `daily-turkish-lesson`, with the schedule `0 10 * * *`: every day at 10:00. A run that is due while the app is closed starts the next time the app opens.

## Change the rules

1. Edit `DAILY-LESSON-PROMPT.md`.
2. When the change touches the short form, edit `ROUTINE-PROMPT.md` to match.
3. Ask Claude to apply `ROUTINE-PROMPT.md` to the `daily-turkish-lesson` routine. The scheduler tool replaces the routine's prompt with it.

## Set the routine up again

When the routine is gone from the scheduler, ask Claude to create the `daily-turkish-lesson` routine with the schedule `0 10 * * *` and the prompt in `ROUTINE-PROMPT.md`. Check that the symlink is in place:

```bash
ls -l ~/.claude/turkish/DAILY-LESSON-PROMPT.md
```

The learning state that the job reads and writes (`progress.md`, `SYLLABUS.md`, `lessons/`, `cards/`) stays in `~/.claude/turkish`, outside this repository.
