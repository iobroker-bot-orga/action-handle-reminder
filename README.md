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
          # optional: enable email reporting by providing mail server secrets
          mail_server_address: ${{ secrets.IOBBOT_MAIL_SERVER_ADDRESS }}
          mail_server_port: ${{ secrets.IOBBOT_MAIL_PORT }}
          mail_secure: ${{ secrets.IOBBOT_MAIL_SECURE }}
          mail_username: ${{ secrets.IOBBOT_MAIL_USERNAME }}
          mail_password: ${{ secrets.IOBBOT_GMXMAIL }}
          mail_to: ${{ secrets.IOBBOT_MAIL_TO }}
          mail_from: ${{ secrets.IOBBOT_MAIL_FROM }}
```

A ready-to-copy template is available at:

- `.github/workflows/handleReminder.example.yml`

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token with issue/PR label write permissions | Yes | - |
| `process-all` | Process all open issues/PRs instead of a single one | No | `false` |
| `issue-number` | Optional explicit issue/PR number to process | No | `''` |
| `mail_server_address` | Mail server address (e.g. `mail.gmx.net`). If not set, no email is sent. | No | `''` |
| `mail_server_port` | Mail server port | No | `''` |
| `mail_secure` | Use SSL/TLS for the mail server connection | No | `''` |
| `mail_username` | Mail server username | No | `''` |
| `mail_password` | Mail server password | No | `''` |
| `mail_subject` | Custom email subject. Defaults to `[iobroker-bot] reminder for repository <owner>/<repo>` | No | `''` |
| `mail_to` | Email recipient address | No | `''` |
| `mail_from` | Email sender address (e.g. `ioBroker Bot <bot@example.com>`) | No | `''` |

## Email reporting

When `mail_server_address` is set and the action runs in full-repository mode (triggered by `schedule` or `workflow_dispatch`, or when `process-all` is `true`), the action sends an email listing all overdue issues and pull requests sorted by due date (oldest first). Issue and PR titles in the email are clickable links that open the referenced item directly.

No email is sent if `mail_server_address` is not configured or if there are no overdue items.

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
