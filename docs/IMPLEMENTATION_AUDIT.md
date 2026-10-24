# Implementation audit and operating runbook

Updated 24 October 2026, Asia/Kolkata.

## Deployment boundary

| Component | Verified state |
| --- | --- |
| [n8n workflow FjdX8g9eDzTtx1Dc](https://sanskarwhatsapp.app.n8n.cloud/workflow/FjdX8g9eDzTtx1Dc) | Published on 23 October as **Durable tenant queue and request-only visit handling**, 54 nodes; Published status rechecked on 24 October. |
| [Supabase project](https://supabase.com/dashboard/project/rjcdzlqspauyqzqtmwcq) | Migration 003 and the tenant-specific 004 configuration applied on 23 October. The delivery-reservation retry fix was also applied and verified. |
| Lead-stage compatibility | Migration 005 applied on 24 October; the live constraint includes `appointment` and preserves existing legacy stages. |
| Dashboard and repository | Changes are in the actual localhost checkout `/Users/sanskar/whatspp automation trail/whatsapp-automation-trail`; no commit, push or public deployment. The separate `whatsapp-automation` checkout was not modified. |
| CRM-controlled client upgrade | Migration 006, client/team controls, full catalog/settings UI and updated runtime policy are implemented locally. Live migration/publication is pending browser access; see the [CRM operator guide](CRM_CLIENT_CONTROL.md). |
| External message delivery | No customer or owner test messages were sent by the agent. Real-phone acceptance testing remains necessary. |

The live empty-queue smoke test executed **Find Pending Sessions** successfully through the configured Supabase credential. A database verification query confirmed queue/batch tables, zero unscoped message records at the time of inspection, worker RPC restrictions, and the Amolik-only catalog/owner configuration. This does not establish end-to-end WhatsApp delivery or unlimited reliability.

## Findings and fixes

| Requirement or risk | Implemented correction | Verification |
| --- | --- | --- |
| Lost or duplicate rapid messages | Atomic history plus durable queue insertion; tenant-scoped deduplication; two-second quiet window; chronological batches; one leased batch per session. | Concurrent webhook and claim tests; next-turn preservation and stale-token tests. |
| Retries after a send timeout | Persist AI result before sends; reserve and checkpoint each bubble separately; ambiguous provider acceptance stops in `needs_reconciliation` instead of blind resending. | Real PostgreSQL delivery-state tests, including repeated reservation RPC calls under the same valid claim. |
| Multiple webhook messages/tenants | Iterate every supported inbound text event; ignore status callbacks, echoes, media, and invalid timestamps; quarantine unknown/inactive businesses. | Ingestion and SQL tests. Media transcription is not implemented. |
| Greetings and tiny messages | Social greetings; retain `.`, `?`, `ha`, and short requests; resolve context or ask a short clarification. | Conversation policy tests, including malformed-model fallback. |
| Unwanted visits or bookings | Request detection with negation/cancellation handling; no unsolicited visit invitation; request-only acknowledgment and `pending_human_confirmation`. | Consent/negation tests and idempotent appointment capture. |
| Human handoff | Save lead, pending visit/escalation, and takeover before notification; allow only that batch's acknowledgment; a manual takeover blocks subsequent customer bubbles. | Policy, SQL, and API tests. |
| Long or repetitive output | At most two short bubbles, two-second delay between bubbles, forced smiling emojis removed. | Policy tests and workflow wiring assertions. |
| BHK drift | Persist requested BHK; 2 BHK restricts recommendations to Amolik Heights; ask before broadening. | Preference, negated-BHK, and incompatible-quote tests. |
| Lost project/quoted context | Twenty ordered prior messages; separate provider ID per bubble; quoted lookup restricted to business, session, and customer. | Context, cross-tenant, cross-session, and project-continuity tests. |
| Missing catalog groups | All 16 user-supplied groups are seeded into tenant settings by migration 006; the runtime no longer embeds the fixture. | Catalog and price/amenity tests. Values are the user's supplied source of truth, not live inventory. |
| CRM edits not changing bot behavior | Load catalog, prices, FAQs, products, tone, greetings, handoff text and approved tenant style from current database settings. | Isolated SQL-to-policy tests show the next turn uses a changed price while another tenant remains unchanged. |
| Missing client administration | Scoped, audited server operations create paused clients, manage verified members and verify sender access before activation. | Role, privilege-escalation, last-owner, sender-binding, activation and rollback tests. |
| Lost lead preferences | Merge nonempty fields progressively; preserve prior budget/BHK/location and terminal statuses; retain requested time even if the model fails. | Policy and SQL tests. |
| Tenant access bypass | Explicit memberships in server pages and APIs; RLS and worker-only RPCs; remove self-provisioned admin and unassigned-user fallback access. | API tests and real PostgreSQL permission tests. |
| Browser secret exposure | Allowlisted client props/settings, restricted business columns, server-only credentials and tenant binding. | Client-prop and settings authorization tests. |
| Unsafe manual sends/export | Validate membership and owned conversation; derive recipient; enforce reply window; pause AI before manual sends; require actual Meta message ID; escape CSV formulas. | API tests. Manual webhook deployment remains a prerequisite. |
| Lead stage rejected or hidden | Accept `appointment` in the database; show existing `contacted`, `converted`, and `closed` leads in the board. A stage change does not book a visit. | Migration 005 and database tests against every dashboard stage. |
| Hardcoded n8n secret | Four legacy utility scripts now read `N8N_API_KEY` rather than embedding the exposed key. | Source inspection; historical Git copies still require rotation. |

## Live workflow settings

- GPT-4o-mini, temperature `0.7`, maximum output tokens `1000`, model timeout 60 seconds and one model retry.
- n8n workflow timeout 180 seconds, matching the trial's limit; database claim lease 300 seconds with renewal.
- Recovery every 15 minutes, explicitly chosen by the user: 96 scheduled executions per day even when no messages arrive. Normal inbound processing still uses a two-second quiet window.
- Successful execution payloads and per-node progress snapshots are not saved; failed executions are saved. Database history and delivery checkpoints remain the durable record.
- No automatic retry on WhatsApp send nodes. Safe database RPCs have bounded retries.
- The live model node uses the selected n8n gateway credential. The import file intentionally contains no model secret and is inactive by default. Select the model gateway/credential explicitly after importing.
- Supabase and WhatsApp credential references belong to the existing instance; imports into another instance require remapping and verifying the database URL and phone-number access.

The 180-second execution cap limits one recovery pass; unclaimed sessions remain queued for later passes. A timed-out processing batch is eligible after its lease expires, unless delivery is ambiguous. Recovery can therefore take longer than 15 minutes from the original failure. Keep execution allowance and model gateway credit available; no new billing plan was purchased.

## Owner alerts: known deployment limitation

The user confirmed on 24 October that there is **no approved owner-alert template**. The current owner node sends free-form text to `917250307422`, configured only for the verified Amolik tenant. Outside the owner's own 24-hour customer-service window, an approved template is required; a customer's recent message does not open the owner's window. See [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/).

Until a suitable template is approved and wired into the owner node:

1. Do not rely on WhatsApp owner alerts as the only operational notification. Check saved pending appointment requests and open escalations in Supabase or the deployed CRM.
2. For a controlled test, the owner can first message the business number to open their own service window. This is temporary, not a durable substitute for a template.
3. If the owner send fails, the lead/request/takeover remains persisted. The batch may require reconciliation; do not rerun the entire execution to resend already-delivered customer acknowledgments.
4. Create an appropriate template in WhatsApp Manager, then provide its approved name, language code, and variable order. Meta determines eligibility/category and approval; no template was submitted or approval claimed here.

Suggested draft to review, not an approved template: `A new customer assistance request is ready for review. Reference: {{1}}. Please open your CRM to follow up.` Keep sensitive lead details in the authenticated CRM rather than in a generic alert. If template approval is unsuitable, choose an authorized alternative alert channel before implementing it.

## Migration and import procedure

For this existing schema, migration 003 is the security/queue upgrade, 004 binds the verified Amolik business to its catalog and owner, and 005 repairs stage compatibility for installations that already ran the earlier 003. The current 003 includes the same corrected constraint. These are not blank-database bootstrap scripts.

1. Back up the target database and review its schema before applying elsewhere. Existing UUID primary keys and foreign keys are preserved; upgrades do not delete customer records.
2. Apply 003, then 004 only for the exact verified Amolik tenant, then 005 and 006. SQL transactions fail rather than silently reassigning another tenant. Do not relax 004's identity checks to make it pass on an unrelated project. Deploy 006 before the new CRM API and workflow policy; otherwise the catalog and save functions are unavailable.
3. Do **not** re-run legacy 001/002 on the secured database: older broad grants/policies and self-admin provisioning can reverse the hardening. Do not run the synthetic test fixture in production.
4. Keep the workflow inactive during an import. Use a blank canvas/new draft and avoid appending a second copy to an existing graph. Preserve published history for rollback.
5. Re-select existing Supabase, WhatsApp, and model credentials; check the original trigger webhook identity, two-second pacing, and 15-minute recovery; publish only after reviewing the diff.
6. Do not run historical one-off workflow mutation scripts against this release. `scripts/build-workflow.js` and its embedded modules are the maintained workflow source.

## Dashboard deployment prerequisites

Set the Supabase public URL/anon key and server-only service-role key through the deployment environment, never in client props or Git. Configure `N8N_MANUAL_REPLY_WEBHOOK_URL` and server-only `N8N_WEBHOOK_SECRET` for manual replies.

The separate manual-reply webhook must authenticate `X-Webhook-Secret`, use the matching tenant's WhatsApp sender, await Meta's response, and return JSON containing `messages[0].id`. A generic `workflow started` response is intentionally treated as uncertain delivery. This endpoint was not created or verified as part of the published main AI workflow.

Deploy migration 006 and the dashboard before depending on the new client controls. Client creation and membership changes now use authenticated server APIs, not direct browser table writes. The first platform operator remains a trusted administrative bootstrap. Provider onboarding and token configuration are prerequisites; see [CRM client control](CRM_CLIENT_CONTROL.md).

## Reconciliation and rollback

- If a new message receives no reply, check the conversation's `human_takeover` flag before assuming the webhook failed. On 24 October, the reported test greeting was present in history and its batch completed without delivery because an earlier explicit visit request had correctly paused AI. The earlier acknowledgment bubbles had provider IDs. Resume AI only for the intended conversation with operator authorization, then send a new test message; do not replay the completed visit batch or automatically clear takeover on greetings.
- Inspect `workflow_errors` and batches whose status is `needs_reconciliation` using trusted administrative access. These tables are intentionally unavailable to browser/anonymous roles.
- Read the batch's `delivery_state` and provider response before deciding what happened. A `sent` checkpoint means Meta accepted a message and supplied an ID, not that the recipient read it. Missing acknowledgment after a timeout is unknown, not proof that nothing was sent.
- Never reset a batch or remove checkpoints just to make a retry succeed. Confirm provider outcome first. Preserve successful parts and resolve uncertain parts individually; record the operator's decision. Automatic exactly-once delivery across PostgreSQL and Meta cannot be guaranteed.
- A reconciliation batch blocks later automated work for that session, intentionally preferring no duplicate send over an unverified resend. New inbound text remains durable. A human can continue through an authorized channel while investigating.
- For an emergency stop, unpublish/disable the workflow; retained database messages are not erased. Re-enabling requires checking lease/delivery state rather than replaying all executions.
- Previous published n8n baseline: `515e010c-c1fe-43c0-b446-48ba8fa87836`, **Fix brittle parser and casual conversation handling**. History is a recovery reference, not a recommendation to restore the old unsafe behavior. Review compatibility with hardened permissions before any rollback. Do not roll back security by rerunning legacy migrations.
- Rotate/revoke the previously committed n8n API key through the account settings. Removing it from current files does not revoke it or remove historical copies. Rotation was not performed by the agent.

## Verification commands and results

```sh
npm test
npm run test:db
npm run workflow:check
npm run typecheck
git diff --check
```

The CRM upgrade passed 59 ingestion/policy/API/workflow tests and 23 real-PostgreSQL tests, 82 total. Database tests use a temporary local cluster, synthetic tenants, Unix sockets only, and automatic cleanup. They exercise migration reapplication, concurrent claims, tenant isolation, saved-result recovery, quote context, handoff, delivery checkpoints, dashboard stages and CRM management/settings.

Workflow generation consistency, TypeScript, whitespace checks and targeted ESLint pass. The production build also passes in the actual localhost checkout with its existing environment, without exposing credentials. Unauthenticated HTTP smoke checks return 200 for login/signup and 401 for client mutations. This is not a signed-in visual review or proof of WhatsApp delivery. Existing dependency-audit findings and the Next middleware deprecation warning remain outside this change.

## Real-phone acceptance checklist

Use a consenting test customer and active business sender; do not inject fabricated customer traffic into production.

1. Send `Hi`, then `Kaise ho`: social replies only, matching language, no property pitch or handoff.
2. Send `2 bh chahiye`, then `aur project btao`: Heights 2 BHK only; ask before broadening the requirement.
3. Send `3 BHK`, `Amolik Park`, `Budget 70 lakh` with less than two seconds between fragments: one unified turn after the quiet window. A gap exceeding two seconds may correctly form a second turn.
4. Ask `jaankari chahiye`: retain the last project. Quote an older project reply and ask `Price?`: resolve the quoted project without crossing tenant/session boundaries.
5. Send `.`, `?`, `ha`: brief contextual reply or clarification, no booking consent.
6. Request `Can I visit tomorrow at 5 PM?`: pending request, owner follow-up wording, no confirmed booking, and saved requested time. Verify human takeover suppresses subsequent bot replies.
7. Check any second bubble is separately delivered after about two seconds and each accepted bubble has its own stored WhatsApp ID.
8. Test owner delivery only with a valid owner service window or approved template. Inspect the saved request even if notification fails.
9. After dashboard deployment, verify two distinct tenant memberships cannot view or mutate each other's messages, leads, exports, or settings. Verify manual replies with a real configured webhook.

Do not simulate timeouts, reset delivery checkpoints, or stress concurrency against real customer sessions. Those failure cases are covered by the isolated tests.
