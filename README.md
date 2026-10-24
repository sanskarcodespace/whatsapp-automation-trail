# Multi-Tenant WhatsApp AI CRM SaaS

A professional, production-oriented multi-tenant CRM dashboard designed for businesses selling WhatsApp AI automation across independent client organizations.

## Implementation Status

The durable queue workflow and tenant-isolation database changes were published to the existing n8n/Supabase project on 23 October 2026. The 24 October CRM-control upgrade is implemented locally in the checkout serving localhost:3000; migration 006 and the updated workflow still require live deployment. Read [the CRM operator guide](docs/CRM_CLIENT_CONTROL.md) and [the implementation audit](docs/IMPLEMENTATION_AUDIT.md) before using the new controls.

Owner WhatsApp alerts currently use free text. The owner has no approved alert template, so alerts outside the owner's 24-hour customer-service window are not reliable. Visit requests and escalations are saved before attempting the alert; the bot never confirms a booking.

----
## 🌟 Key Features & Capabilities

### 🏢 Multi-Tenant Architecture & Security
- **Tenant Isolation**: Complete data segregation backed by Supabase Row Level Security (RLS) policies and `business_members` join tables.
- **Role-Based Access Control**: `platform_admin`, `owner`, `manager`, and `agent` permissions, always restricted to explicit business memberships; no global admin bypass or automatic membership creation.
- **Client Switcher**: Easily toggle between client businesses with live WhatsApp connection status indicators (`connected`, `pending`, `error`).

### 💬 Real-Time WhatsApp Inbox
- **3-Panel Layout**:
  - **Left Panel**: Conversation threads with unread counts, AI/Human badges, search, and status filters (`all`, `unread`, `human`, `ai`, `open`, `closed`).
  - **Middle Panel**: Chat message stream with clear visual distinctions between inbound customer messages, AI-generated responses, and manual agent replies.
  - **Right Panel**: Customer details drawer, interested services, lead stage, internal agent notes, and live human takeover toggle.
- **Live Supabase Realtime**: Instant message arrival updates without manual refreshing.

### 🤖 AI Control & Human Takeover
- **Pause/Resume AI**: One-click human takeover toggle per conversation. Updates `conversations.human_takeover` and `conversations.status = 'human' | 'bot'`.
- **Client-Controlled Knowledge**: Authorized managers edit each client's catalog, BHK prices, services, products, FAQs, hours, contact details, tone, greetings, handoff acknowledgements and response examples. The CRM-controlled workflow reads these values from Supabase each new turn, with no embedded client catalog.
- **Client Administration**: Platform operators create paused clients; assigned owners/operators manage verified CRM accounts and roles; owners/managers pause automation or enable a verified connection. All writes use authenticated server routes and scoped, audited database functions.
- **WhatsApp Onboarding Boundary**: Clients must authorize their WABA/phone under the shared Meta app and sending credential. CRM verification uses server-only configuration; it is not Embedded Signup, automatic provider approval or a billing system.
- **Durable Conversation Turns**: Two-second quiet-window batching, twenty prior messages, tenant-scoped quoted replies, and separate delivery checkpoints for each reply bubble.

### 🛡️ Secure Manual Replies
- **Server-Side Proxy**: Agents reply directly from the inbox. Messages are authenticated via Supabase session and proxied securely through Next.js API routes (`/api/messages/send`) to n8n webhooks.
- **No Client Credential Exposure**: WhatsApp Cloud API tokens and webhook secrets are strictly held server-side.
- **AI Loop Prevention**: Outbound messages are tagged with `is_manual_reply: true` and `direction: 'outbound'` to prevent the AI bot from re-processing agent replies.
- **Deployment Prerequisite**: Configure a separate authenticated manual-reply webhook that returns Meta's actual `messages[0].id`; a generic asynchronous acknowledgment is not delivery confirmation. This webhook is not included in the main AI workflow.

### 📊 Leads CRM & Kanban Board
- **Visual Lead Pipeline**: Kanban stages include `new`, `contacted`, `interested`, `qualified`, `appointment`, `won`, `converted`, `lost`, `closed`, and `follow_up_required`. A lead stage does not confirm an appointment.
- **Inline Editing**: Quick lead qualification, budget, location, follow-up dates, and internal notes.

### 📅 Appointment Bookings
- **Calendar & List Management**: Manage appointment booking requests captured automatically by the WhatsApp AI bot.
- **Actions**: One-click confirmation, rescheduling, customer note updates, cancellation, and direct link to WhatsApp thread.

### 📇 Customer Directory
- Searchable directory of all customer phone numbers across tenant businesses.
- Quick stats: last active time, message count, lead stage, and active chat shortcut.

### 📥 Chat Export
- Filter by business, date range (24h, 7d, 30d, 90d, 1y), message direction, or intent.
- **UTF-8 BOM CSV**: Formatted with `\uFEFF` ensuring Hindi, Hinglish, emojis, and special characters render flawlessly in Microsoft Excel and Google Sheets without corrupted characters.
- **JSON Export**: Full raw metadata dump for data auditing and ML fine-tuning.

---

## 🏗️ Architecture & Technology Stack

```
[Customer WhatsApp]
       │
       ▼ (Meta Webhook)
[n8n Automation Cloud] (WhatsApp AI Support & Lead Gen)
       │
       ├─► [Supabase PostgreSQL] (Businesses, Conversations, Messages, Leads, Appointments)
       │         ▲
       │         │ (RLS + Realtime)
[Next.js 16 SaaS Dashboard] (CRM App Router + Tailwind CSS)
       │
       ▼ (Server-Side Authenticated Proxy)
[n8n Manual Reply Webhook] ──► [Meta WhatsApp Cloud API]
```

- **Frontend / Fullstack**: Next.js 16 (App Router, Server Components, Route Handlers, TypeScript).
- **Database & Auth**: Supabase (PostgreSQL, Supabase Auth, Row Level Security, Supabase Realtime).
- **Styling**: Tailwind CSS v4, Lucide Icons, Date-fns.
- **Orchestration**: n8n workflows (`WhatsApp AI Support & Lead Gen (Multi-Client)`).

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 20.9+ (the installed Next.js minimum; use a supported Node.js release)
- Supabase project credentials
- n8n instance with the WhatsApp AI Support workflow

### 2. Environment Configuration
Copy `.env.example` to `.env.local` and fill in your Supabase credentials:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

NEXT_PUBLIC_APP_URL=http://localhost:3000
N8N_MANUAL_REPLY_WEBHOOK_URL=https://your-n8n.cloud/webhook/manual-reply
N8N_WEBHOOK_SECRET=your_secret
```

### 3. Database Migration
For the existing project, review and apply these files in **Supabase Dashboard > SQL Editor**, in order:
1. `migrations/003_durable_tenant_queue.sql`
2. `migrations/004_amolik_catalog_configuration.sql` (only the verified Amolik tenant; deliberately rejects other projects)
3. `migrations/005_lead_stage_compatibility.sql`
4. `migrations/006_crm_client_control.sql` (required before the new CRM API and updated workflow)

These are upgrades for the inspected existing schema, not a blank-database bootstrap. Migration 003 changes RLS, grants, constraints, and worker functions; review and back up before using it elsewhere. Do not re-run legacy migrations 001/002 on the secured project: their older grants/policies can undo the security fixes. The test fixture is synthetic and must never be run in production.

The initial platform operator must be provisioned through a trusted administrative process. After migration 006, that operator can create clients and assign verified accounts from Settings. A new account at `/signup` intentionally sees no tenant data until assigned; it cannot create its own admin membership.

### 4. Run Development Server
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to log in and access your multi-tenant CRM.

### 5. Production Build Validation
```bash
npm test
npm run test:db
npm run workflow:check
npm run typecheck
npm run build
npm run start
```

Database tests start an isolated local PostgreSQL cluster. Set `PG_TEST_BIN` to the directory containing `initdb`, `pg_ctl`, and `psql` when it differs from `/opt/homebrew/opt/postgresql@14/bin`. No production credentials are used by these tests.

Edit client knowledge and prices in the CRM, not in `workflows/data/`. That file is now only the historical Amolik seed/test fixture. Shared safety behavior lives in `workflows/lib/`, and wiring in `scripts/build-workflow.js`; regenerate `workflows/whatsapp_multi_client_ai.json` after code changes. Import with the workflow inactive, select existing Supabase/WhatsApp credentials and model gateway credentials, then verify and publish. Importing onto a nonempty n8n canvas appends nodes instead of replacing them.
