# Handle Reminder Action

This action processes reminder comments on issues and pull requests and manages reminder labels with date-based deadlines.

> [!CAUTION]
> This action is designed for use within the ioBroker ecosystem only. Feel free to use it, but future changes may affect repositories outside this ecosystem.

## What it does

The action implements the same reminder handling flow as `handleReminder` from `ioBroker.repositories`:

- Searches comments for `created DD.MM.YYYY` and `reminder DD.MM.YYYY`
- Adds or updates date labels (`D.M.YYYY`) on the issue/PR
- Sets reminder label color to:
  - `ffffff` (white) while reminder date is in the future
  - `ff0000` (red) once reminder date has passed
- Adds `⚠️check` where needed
- Removes outdated reminder labels from issues/PRs
- Removes outdated repository labels that are no longer used

## Usage

Create a workflow in your repository (for example `.github/workflows/handleReminder.yml`):

```yaml
name: Handle Reminder

on:
  issue_comment:
    types:
      - created
  workflow_dispatch:
  schedule:
    - cron: '5 0 * * *'

jobs:
  handle-reminder:
    runs-on: ubuntu-latest

    permissions:
      issues: write
      pull-requests: write

    steps:
      - name: Handle reminder labels
        uses: iobroker-bot-orga/action-handle-reminder@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          process-all: ${{ github.event_name == 'schedule' || github.event_name == 'workflow_dispatch' }}
```

A ready-to-copy template is available at:

- `.github/workflows/handleReminder.example.yml`

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token with issue/PR label write permissions | Yes | - |
| `process-all` | Process all open issues/PRs instead of a single one | No | `false` |
| `issue-number` | Optional explicit issue/PR number to process | No | `''` |

## Trigger behavior

- **issue_comment**: processes the commented issue/PR
- **workflow_dispatch**: process all open issues/PRs (set `process-all: true`)
- **schedule**: process all open issues/PRs (set `process-all: true`)

## Permissions

The workflow job must include:

- `issues: write`
- `pull-requests: write`

## License

[MIT](LICENSE)
