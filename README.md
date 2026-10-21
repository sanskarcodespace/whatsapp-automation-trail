# Multi-Tenant WhatsApp AI CRM SaaS

A professional, production-oriented multi-tenant CRM dashboard designed for businesses selling WhatsApp AI automation across independent client organizations.

---

## 🌟 Key Features & Capabilities

### 🏢 Multi-Tenant Architecture & Security
- **Tenant Isolation**: Complete data segregation backed by Supabase Row Level Security (RLS) policies and `business_members` join tables.
- **Role-Based Access Control**: `platform_admin`, `owner`, `manager`, and `agent` permissions.
- **Client Switcher**: Easily toggle between client businesses with live WhatsApp connection status indicators (`connected`, `pending`, `error`).

### 💬 Real-Time WhatsApp Inbox
- **3-Panel Layout**:
  - **Left Panel**: Conversation threads with unread counts, AI/Human badges, search, and status filters (`all`, `unread`, `human`, `ai`, `open`, `closed`).
  - **Middle Panel**: Chat message stream with clear visual distinctions between inbound customer messages, AI-generated responses, and manual agent replies.
  - **Right Panel**: Customer details drawer, interested services, lead stage, internal agent notes, and live human takeover toggle.
- **Live Supabase Realtime**: Instant message arrival updates without manual refreshing.

### 🤖 AI Control & Human Takeover
- **Pause/Resume AI**: One-click human takeover toggle per conversation. Updates `conversations.human_takeover` and `conversations.status = 'human' | 'bot'`.
- **Bot Persona & Knowledge Base Editor**: Clients can configure their custom system prompts, AI tone, service catalog, price ranges, FAQs, opening hours, and handoff messages directly from the UI.
- **Few-Shot Style Mirroring**: Ingests into `response_style_profiles` for golden few-shot response examples.

### 🛡️ Secure Manual Replies
- **Server-Side Proxy**: Agents reply directly from the inbox. Messages are authenticated via Supabase session and proxied securely through Next.js API routes (`/api/messages/send`) to n8n webhooks.
- **No Client Credential Exposure**: WhatsApp Cloud API tokens and webhook secrets are strictly held server-side.
- **AI Loop Prevention**: Outbound messages are tagged with `is_manual_reply: true` and `direction: 'outbound'` to prevent the AI bot from re-processing agent replies.

### 📊 Leads CRM & Kanban Board
- **Visual Lead Pipeline**: Kanban stages (`new`, `interested`, `qualified`, `appointment`, `won`, `lost`, `follow_up_required`).
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
- Node.js 18.17+ or 20+
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
Apply the SQL migration file in your **Supabase Dashboard > SQL Editor**:
- Open `migrations/001_core_schema.sql`
- Run the script. It is completely safe and additive (creates missing columns, `business_members`, `team_invites`, indexes, and RLS policies).

### 4. Run Development Server
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to log in and access your multi-tenant CRM.

### 5. Production Build Validation
```bash
npm run build
npm run start
```
