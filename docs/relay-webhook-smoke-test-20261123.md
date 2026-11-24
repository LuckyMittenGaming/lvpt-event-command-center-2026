# LVPT Relay Webhook Smoke Test

This document is a non-production fixture to verify the event-driven AI↔Cursor reviewer on a **draft pull request against `feature/unified-command-center-staging` only**.

It contains no application code, personal data, credentials, or instructions to merge or deploy.

Expected behavior: after a valid GitHub event, the disabled relay does nothing; after a Preview-only dry-run is expressly configured, it evaluates safely without posting GitHub comments, calling OpenAI, or launching Cursor.
