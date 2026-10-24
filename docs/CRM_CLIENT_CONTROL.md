# CRM-controlled multi-client operations

Updated 24 October 2026, Asia/Kolkata.

## Current deployment status

The code is in `/Users/sanskar/whatspp automation trail/whatsapp-automation-trail`, the actual working directory of the server on port 3000. The earlier Desktop clone is not the running CRM. The checkout was at `05d221a` when deployment resumed; this deployment did not create a commit, push, or public CRM deployment.

**The CRM-control integration is now deployed.** On 24 October 2026, migration `006_crm_client_control.sql` completed successfully in Supabase project `rjcdzlqspauyqzqtmwcq`. The existing n8n workflow was published as **CRM-controlled multi-client catalog and behavior**, version `a321394a-b25c-4f37-9eee-23b30d242bce`. Only **Build AI Context** and **Prepare Updates** were replaced, and both pasted code values were checked against the tested generated source. Credentials, trigger identity, wiring and recovery settings were not edited.

The signed-in CRM renders the 16-project catalog and client/team controls. An unchanged configuration was saved successfully through the UI. A read-only live `workflow_context` call returned the CRM catalog and correct 2 BHK price; changing a copy in memory changed the policy result without touching live prices or sending messages. The three CRM functions allow service-role execution and deny direct authenticated-browser execution. Customer message and conversation counts were unchanged by migration.

At 21:30 IST on 24 October, the user's test chat ending 7422 sent `hii`. The workflow replied `Hello! How are you?`, stored a provider message ID and completed its batch in one attempt with no recorded error. The user confirmed receiving that reply. After a resend request, `Amolik Heights 2 BHK price` arrived at 21:40:59 IST. Its two replies at 21:41 quoted the CRM's ₹62.78L–₹63.42L price and matching amenities, with provider IDs and a completed single-attempt batch. The user supplied both received replies. These tests verify greeting and current-catalog replies for this client, not every acceptance case or another client's WhatsApp connection. Live prices were not changed.

**New-number activation still needs setup.** The three server-side Meta environment values below are absent. The existing Amolik client remains active with `pending` connection status and no recorded WABA ID; its used phone identity is intentionally locked. Do not pause it expecting to resume before a verified WABA binding and provider setup are completed. No fabricated client or team access was created during verification.

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
- Signed-in CRM inspection, configuration-save verification and user-confirmed WhatsApp greeting/current-price replies are complete. The broader real-phone acceptance checklist and another client's WhatsApp onboarding remain unverified; automated tests alone do not prove delivery.

## Verification

All 82 tests pass: 59 ingestion/policy/API/workflow tests and 23 isolated PostgreSQL tests. `npm test` covers API roles, safe settings/catalog input, sender-verification failures, current per-client role selection, price changes between turns, explicit clears, style isolation and existing conversation rules. `npm run test:db` applies the migrations repeatedly to an isolated local PostgreSQL cluster, tests atomic configuration/style updates, member access protections, sender activation, seeded-catalog preservation and real SQL-to-policy price changes. TypeScript, targeted ESLint, workflow generation consistency, production build and unauthenticated HTTP smoke checks also pass. No fabricated client, role assignment or test message was created in production.
