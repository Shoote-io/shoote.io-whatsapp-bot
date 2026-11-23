# KAYA Nexus Operator 2.0.0

Refactor of the WhatsApp operator from the supplied source archive.

## What changed

- The WhatsApp webhook is now only the ingress layer. It acknowledges Meta immediately, so AI/media processing cannot make the webhook appear frozen.
- Runtime response delivery is a standalone worker. It starts at process boot and polls `runtime_events` every few seconds. It does not depend on a new WhatsApp message to wake it.
- The delivery query is bounded. It never loads the whole event table.
- Normal pending/accepted events are claimed atomically. Stale `DELIVERY_IN_PROGRESS` rows are recoverable.
- Delivery is confirmed only after Meta returns a WhatsApp message ID.
- If Meta accepts a message but the database confirmation fails, the operator does not blindly resend it, preventing duplicate customer messages.
- Runtime delivery no longer requires an `INNER JOIN` to `clients` during event discovery. The recipient is resolved from an event recipient field when available, then from `machine_id -> clients`.
- Incoming conversations resolve the contact against `clients` before AI generation.
- AI has two explicit conversation modes: customer assistance and prospect/marketing.
- The old duplicated `groq.js` and mixed webhook logic were removed from the runtime path.
- Environment/configuration is centralized.
- A database index migration is included for the delivery queue.

## Required environment

Use the same credentials already used by the previous bot:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WHATSAPP_TOKEN` (or `WHATSAPP_ACCESS_TOKEN`)
- `PHONE_NUMBER_ID` (or `WHATSAPP_PHONE_NUMBER_ID`)
- `VERIFY_TOKEN`
- `GROQ_API_KEY`

Optional:

- `GROQ_MODEL`
- `GROQ_API_URL`
- `RESPONSE_DELIVERY_POLL_MS` (default 3000)
- `RESPONSE_DELIVERY_BATCH_SIZE` (default 25)
- `RESPONSE_DELIVERY_STALE_MS` (default 120000)
- `CONVERSATION_LIMIT` (default 10)
- `COMPANY_NAME`
- `COMPANY_DESCRIPTION`
- `COMPANY_OFFERINGS`
- `COMPANY_TONE`

## Important database assumption

The supplied source proves the operator currently uses:

- `runtime_events`
- `clients`
- `machines`
- `messages`
- `replies`
- `commands`
- `media_logs`

The exact full schema of these tables was not included in the ZIP, so the refactor deliberately avoids inventing new required columns. `delivery_metadata` is treated as optional. The SQL file only adds indexes.

## Runtime flow

WhatsApp -> webhook -> save inbound -> classify command/conversation -> client lookup -> command queue OR AI -> WhatsApp.

Runtime response flow:

runtime_events -> bounded poll -> atomic claim -> recipient resolution -> WhatsApp -> Meta message ID -> mark sent.

The two flows are independent. A customer sending a WhatsApp message is no longer the mechanism that makes runtime responses move.
