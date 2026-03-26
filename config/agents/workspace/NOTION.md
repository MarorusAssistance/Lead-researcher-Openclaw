# NOTION.md - Notion API Configuration

## Setup

1. **Create a Notion API token**
   - Go to: https://www.notion.com/settings
   - Scroll to "Integrations" → "New Integration"
   - Name it (e.g., "OpenClaw Recruiters")
   - Copy the API token

2. **Create a database**
   - In Notion, create a new database (or use an existing one)
   - Copy the database ID from the URL (after `/d/`)
   - Example: `12345678-1234-1234-1234-1234567890ab`

## Configuration

Update the following values in this file:

- `NOTION_API_TOKEN` = "secret_1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
- `NOTION_DATABASE_ID` = "12345678-1234-1234-1234-1234567890ab"

## Usage

Once configured, run:

```bash
openclaw notion sync
```

This will sync your recruiters database with Notion.