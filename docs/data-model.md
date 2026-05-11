<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Data Model

## Context Profiles

Context is split into two first-class layers:

- **Contact context** describes a person or contact point across conversations.
- **Conversation context** describes a room or group, such as an iMessage chat.

When a draft is generated or reviewed, the intended resolution order is:

1. Each participant/contact context.
2. The conversation/group context.
3. Global defaults.

Privacy and safety constraints are conservative. `do_not_reply` and sharing boundaries take
precedence over tone preferences or room-level defaults.

`ContextService.resolve()` returns the contributing contact records, the room record, and an
effective bundle. Reply posture uses the most restrictive value, `avoid_rude` wins over other tone
choices, and personal-detail sharing uses intersection semantics so a detail is allowed only when
all contributing context that declares boundaries allows it.

## Structured Choices

Both contact and conversation context support the same structured fields:

- `relationship`: `family`, `friend`, `professional`, `service`, `unknown`
- `tone`: `polite`, `warm`, `direct`, `terse`, `avoid_rude`
- `reply_posture`: `do_not_reply`, `reply_if_needed`, `usually_reply`, `always_reply`
- `allowed_personal_details_json`: JSON array of approved personal-detail categories:
  `location`, `health_updates`, `daily_agenda`, `family_updates`
- `custom_personal_details_json`: JSON array of custom allowed details

They also support free-form fields:

- `custom_prompt`: direct instructions for this person or room
- `notes`: admin-facing context notes

## Tables

### `contact_contexts`

One row per tenant and stable contact key. The contact key may be a contacts-mcp identifier,
normalized phone/email handle, or imported local contact ID.

Important columns:

- `tenant_id`
- `contact_key`
- `display_name`
- structured context fields
- `custom_prompt`
- `notes`
- timestamps

Uniqueness: `(tenant_id, contact_key)`.

### `conversation_contexts`

One row per tenant, channel, and room key. For iMessage, the room key should be the stable chat ID
or adapter conversation ID, not every transient message thread.

Important columns:

- `tenant_id`
- `channel_id`
- `room_key`
- `display_name`
- structured context fields
- `custom_prompt`
- `notes`
- timestamps

Uniqueness: `(tenant_id, channel_id, room_key)`.

## Version History

Every context mutation is recorded in `context_versions`.

Important columns:

- `context_type`: `contact` or `conversation`
- `context_id`
- `operation`: `create`, `update`, `delete`, `rollback`
- `actor_user_id`
- `before_json`
- `after_json`
- `source`: `human`, `harvest`, `import`, `system`
- `confidence`
- `review_status`: `pending`, `approved`, `rejected`, `superseded`

`ContextHistoryService` can list history, mark entries superseded, and roll a context back to a
previous payload. Harvest/import suggestions should use `source` and `confidence` and remain
reviewable rather than silently applying changes.

## Harvest Suggestions

The CLI can preview current iMessage harvest suggestions:

```bash
bun run --filter @commshub99/cli admin context:harvest --limit 25
```

This emits JSON suggestions with confidence and evidence snippets/row IDs. It does not write or
apply context.

## Future Layers

The next context work should persist harvested suggestions for web review, then pass approved
resolved context bundles to draft generation and approval safeguards.

## Draft context handoff

Draft producers should resolve context before writing a draft and stamp the draft frontmatter with
the context that shaped generation. The local helper is:

```sh
bun run --filter @commshub99/cli admin context:resolve --chat-id 67 --contact-key phone:+15551234567
```

Use the returned JSON to populate these draft frontmatter fields:

- `context_tenant_id`
- `contact_context_ids` as a comma-separated list
- `conversation_context_id`
- `context_version_ids` as a comma-separated list
- `context_tone`
- `context_reply_posture`
- `context_signature`
- `context_allowed_personal_details` as a comma-separated list
- `context_custom_personal_details` as a comma-separated list

When those fields are present, commshub99 treats them as the context used at generation time and
preserves them into the outbox file. When they are missing, the approvals view resolves the current
live contact and conversation context so admins can still see the active rules that apply to the
draft.

Context signatures are resolved from a global tenant value plus contact and conversation context
settings. Each context can inherit the current signature, append a suffix, or override it entirely;
the resolved value is copied into draft metadata so approvals and sends preserve the exact context
marker used for that draft.
