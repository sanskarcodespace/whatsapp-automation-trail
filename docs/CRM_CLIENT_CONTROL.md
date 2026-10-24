# CRM-controlled multi-client operations

Updated 24 October 2026, Asia/Kolkata.

## Current deployment status

The code is in `/Users/sanskar/whatspp automation trail/whatsapp-automation-trail`, the actual working directory of the server on port 3000. The earlier Desktop clone is not the running CRM. No commit or push has been made.

**The new controls are not fully live yet.** Migration `006_crm_client_control.sql` and the regenerated n8n code must be deployed together. The browser tool still reports “Local browser use is disabled in Work settings”; the installed Supabase CLI has no authenticated access token. These prevent publishing in this session. The existing live workflow has not been replaced by this local upgrade.

The local server can render the new pages, but save/create/verify actions require migration 006. Until then the API deliberately reports a deployment error instead of pretending a save succeeded. Do not claim CRM settings have changed live WhatsApp behavior before updating both components.

## What was wrong

- `catalog_key=amolik` selected an embedded catalog in n8n, so editing prices in the CRM could leave project replies unchanged.
- Several saved fields, including FAQs, products, tone, booking instructions and approved style profiles, never reached the model.
- Greeting and handoff wording was fixed, irrespective of client settings.
- Settings had no supported client-creation or member-management controls. UI edit permissions used the first membership rather than the selected client's role.

## Deploy once

1. Back up the existing database and apply migration 006 after 003–005. It adds service-role-only CRM functions and approved style context. It seeds the user-supplied Amolik catalog only for the exact verified tenant/phone, only if no catalog is already present. Reapplication does not overwrite CRM edits, including an intentionally empty catalog. It does not change automation activity or create user memberships on its own.
2. Verify the existing Amolik catalog has 16 project groups. No customer data or message checkpoints should be removed.
3. In the existing n8n workflow, replace the JavaScript for **Build AI Context** and **Prepare Updates** with the matching code in the regenerated workflow JSON. The policy is embedded in both nodes; updating only one is insufficient. Keep the existing trigger identity, Supabase/WhatsApp/model credentials, model settings and 15-minute recovery. Review and publish once. Alternatively import the complete JSON into an inactive, empty draft; never append a duplicate graph to a live canvas.
4. Refresh the CRM. Saving configuration uses one transaction for business settings, response style and audit entry. Saved settings apply to newly loaded turns. A turn already in progress, or a retry with a persisted result, intentionally retains its earlier snapshot.
5. Use a consenting test chat to verify normal replies, price changes, quoted context and human takeover. Do not replay completed batches or change real prices just to generate a test.

## Manage a client

Open **Settings → Client management**:

- **New client** is available to an existing platform operator. Enter a unique Meta phone number ID, WABA ID, name, timezone and optional owner-alert number. It creates a paused client with an empty catalog and assigns the creating operator to that client only.
- New team members create their own account at `/signup` and verify their email. From the selected client, enter their email and choose Owner, Manager or Agent. The confirmation explains which client's conversations and leads become accessible. The application does not send an invitation automatically.
- Owners and assigned operators manage members. Managers edit business/AI settings and pause automation. Agents cannot change configuration or membership. No role can assign `platform_admin` through this screen, remove its own access, modify another operator, or remove the last owner.
- Correct an unused, paused client's phone/WABA identity before onboarding. Used or connected identities are locked to avoid reassociating existing history with another sender.
- **Pause automation** stops new automated delivery without deleting history. **Enable automation** requires verified connection status and never clears per-conversation human takeover. An existing active legacy client may still display `pending`; do not pause it expecting to resume before completing verification setup.

Open **AI Configuration** for the selected client:

- Edit project names, aliases, BHK configurations, indicative prices, descriptions, status and amenities. Project prices in this catalog override old chat history and general pricing notes.
- Edit services, products, FAQs, opening hours, public contact details and appointment policy.
- Edit tone, English/Hinglish greetings, human-request acknowledgements and response examples. Unsafe custom wording cannot authorize bookings or unsolicited visit pitches. Empty fields explicitly clear old values.
- Set the owner alert number as international digits, without `+` or spaces. Empty disables WhatsApp owner notifications; requests are still saved in the CRM.
- All client data is loaded from Supabase per turn. The shared workflow contains reusable logic, not individual clients' catalogs. No n8n edits are needed for routine client knowledge changes after this upgrade is published.

## One-time provider and account setup

The current workflow uses **one shared WhatsApp sending credential**. Creating a database client does not give that credential access to an arbitrary customer's number. Each customer's WABA/phone must authorize the same Meta app and credential, with the app subscribed to the WABA. See [Meta's official Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=folder-c4f0f9be-ddf1-4d2b-8bdc-d97f00ae4e34).

Configure these once in the CRM's server environment, never in chat, client props, or Git:

| Environment variable | Purpose |
| --- | --- |
| `WHATSAPP_SHARED_ACCESS_TOKEN` | The same authorized shared sender credential used by n8n, with required management/messaging permissions. |
| `WHATSAPP_APP_ID` | The corresponding Meta application ID. |
| `WHATSAPP_GRAPH_VERSION` | A supported, explicitly selected Graph API version in `vNN.N` form. |

**Verify WhatsApp connection** performs read-only checks for phone membership in the WABA, subscription to that app, and Meta's `CONNECTED`/Cloud API registration state. It sends no messages and does not activate automation automatically. It cannot prove successful WhatsApp delivery or that a webhook callback points to the intended n8n workflow; complete a real-phone test. Missing credentials, missing access, provider errors or changed sender identity fail closed. None of these three environment values were configured during this work.

For email signup, enable the intended Supabase email provider/confirmation configuration and allow the deployment's `/auth/callback` redirect. Accounts do not get memberships automatically. `localhost:3000` is only accessible on your own machine; client logins from other computers require an appropriately secured hosted HTTPS deployment and matching redirect configuration.

## Remaining commercial/deployment limits

- Meta Embedded Signup, arbitrary per-client token storage/rotation, automated billing and subscriptions are not implemented. This is client administration, not a complete reseller payment/onboarding product.
- No approved owner-alert template exists. Free-form owner alerts remain subject to the owner's own reply window; the CRM's pending requests remain the dependable record.
- Manual replies still require the separately configured authenticated n8n manual-reply webhook returning Meta's message ID.
- Shared model credentials, app/webhook infrastructure, safety rules, and token management remain operator-managed infrastructure, not editable client knowledge.
- The CRM visual review and a real WhatsApp end-to-end test remain pending browser access. Automated tests are not evidence of delivery to a real phone.

## Verification

All 82 tests pass: 59 ingestion/policy/API/workflow tests and 23 isolated PostgreSQL tests. `npm test` covers API roles, safe settings/catalog input, sender-verification failures, current per-client role selection, price changes between turns, explicit clears, style isolation and existing conversation rules. `npm run test:db` applies the migrations repeatedly to an isolated local PostgreSQL cluster, tests atomic configuration/style updates, member access protections, sender activation, seeded-catalog preservation and real SQL-to-policy price changes. TypeScript, targeted ESLint, workflow generation consistency, production build and unauthenticated HTTP smoke checks also pass. No fabricated client, role assignment or test message was created in production.
