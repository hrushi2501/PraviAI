# Pravi AI — Sovereign Fixed-Asset Governance & Statutory Accountability

[![Live Production](https://img.shields.io/badge/Production-Live%20on%20Vercel-success?style=for-the-badge&logo=vercel)](https://praviai.vercel.app)
[![Next.js 15](https://img.shields.io/badge/Next.js-15%20App%20Router-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%20Mode-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)
[![Bun](https://img.shields.io/badge/Runtime-Bun-f472b6?style=for-the-badge&logo=bun)](https://bun.sh)
[![PostgreSQL](https://img.shields.io/badge/Database-Supabase%20Postgres-3ecf8e?style=for-the-badge&logo=supabase)](https://supabase.com)
[![Biome](https://img.shields.io/badge/Linter-Biome-yellow?style=for-the-badge&logo=biome)](https://biomejs.dev)

> **Pravi** is a sovereign, tamper-evident public fixed-asset management and statutory condition governance system engineered for Indian municipal corporations, urban development authorities, and state public works departments (modeled on the Government of Gujarat administrative hierarchy).

Unlike commercial enterprise SaaS asset trackers that rely on subjective health scores and unenforced honor systems, **Pravi** enforces constitutional and statutory segregation of duties: **no officer can verify, inspect, approve maintenance on, or decommission an asset or transaction they personally created or manage.**

- **Live Production URL**: [https://praviai.vercel.app](https://praviai.vercel.app)
- **Production Health Check**: [https://praviai.vercel.app/api/health](https://praviai.vercel.app/api/health)
- **Repository**: [https://github.com/hrushi2501/PraviAI](https://github.com/hrushi2501/PraviAI)

---

## 🏛 The Statutory Public Accountability Problem

Public infrastructure management in Indian municipalities suffers from three structural vulnerabilities:

1. **Maker-Checker Collusion**: The junior technical officer who catalogs or repairs a bridge, road, or water treatment plant is often the same official who self-approves the baseline inspection report.
2. **Fabricated Health Percentages**: Legacy systems invent arbitrary single-number metrics (e.g. *"Bridge is 84.7% healthy"*) that obscure critical component-level structural failures.
3. **Unaccounted Restoration Backlog**: Deferred maintenance liabilities are rarely tracked as statutory financial liabilities, leaving taxpayers blindsided when critical infrastructure fails catastrophically.
4. **Disconnected Citizen Grievances**: Citizens report infrastructure hazards in local languages (Gujarati, Hindi), but municipal work orders require manual, lossy translation and lack GPS or duplicate validation.

---

## 🛡️ Pravi's Core Innovations

### 1. The "Four-Eyes" Governance Principle

Pravi enforces statutory separation of duties at the database and application levels:

- **Maker Cannot Be Checker**: If an officer creates an asset draft or submits an inspection, the system rejects any attempt by that same officer (or their immediate subordinate) to verify or certify it.
- **Cryptographic Audit Trail**: Every lifecycle transition is recorded in an immutable, append-only PostgreSQL ledger with actor identity, timestamp, and before/after diff snapshots.

### 2. Paired Condition Observations

Pravi outlaws fake single-number aggregate health percentages. Instead, it maintains **True Paired Condition Observations**:

- **First Approved Baseline**: The certified condition of each critical sub-component at initial commissioning.
- **Latest Approved Observation**: The most recent certified field inspection rating (`Good`, `Fair`, `Poor`, `Critical`).
- **Defect Lineage**: Clear statutory degradation tracking over time with component-level photo evidence.

### 3. Exact Restoration Backlog Accounting

When an asset component drops below statutory standards, Pravi calculates the **Restoration Backlog (in INR)** based on standard departmental schedule of rates (SoR). This quantifies exact capital repair liability across divisions and districts.

### 4. Multilingual Citizen Grievance AI

Citizens can report damaged roads, leaking pipelines, or failing bridges via:

- **Voice Audio**: Multilingual audio recording in Gujarati, Hindi, and English, transcribed in real time via **Deepgram Nova-3**.
- **Geotagged Photo Evidence**: Camera uploads parsed for GPS metadata and stored securely on Cloudinary CDN.
- **Spatial & Semantic Deduplication**: Powered by **Supabase pgvector**, Pravi computes cosine similarity on complaint narratives and pairs it with 100m geo-bounding to automatically link or deduplicate grievance reports against known municipal assets.

### 5. Smooth Continuous Canvas Geospatial Engine

A custom cursor-pivot continuous zooming map engine with sub-pixel inertia momentum, allowing engineers to visualize thousands of distributed assets across Gujarat without tiling lag or browser stutter.

---

## 🗺 System Architecture

```text
                                   PRAVI AI ARCHITECTURE
                                              │
              ┌───────────────────────────────┴───────────────────────────────┐
              │                                                               │
     [PRESENTATION TIER]                                             [AI & ASYNC PIPELINES]
   Next.js 15 App Router                                             Deepgram Nova-3 (STT)
   Tailwind CSS v4 + shadcn/ui                                       Deepgram Aura (TTS)
   TanStack Table & React Query                                      Cloudinary Evidence CDN
   Continuous Canvas Map Engine                                      Upstash Redis (Locks & Rates)
              │                                                      Upstash QStash (Workflows)
              │                                                               │
              ▼                                                               ▼
   [SECURITY & EDGE BOUNDARY] ────────────────────────────────► [APPLICATION CORE SERVICES]
   Vercel Global Edge Network                                   Server Actions & Route Handlers
   Next.js Edge Proxy Guard                                     Domain Entities & Repositories
   Clerk RBAC & Session JWT                                     Four-Eyes Governance Validator
              │                                                               │
              └───────────────────────────────┬───────────────────────────────┘
                                              │
                                              ▼
                                 [SOVEREIGN PERSISTENCE TIER]
                                  Supabase PostgreSQL Engine
                                              │
                   ┌──────────────────────────┴──────────────────────────┐
                   │                                                     │
         [DUAL POOL CONNECTION]                                [DATABASE STORED PROCS]
      DATABASE_RUNTIME_URL (Pooler)                       asset_manager Schema Definers
      DATABASE_IDENTITY_URL (Direct)                      pgvector Cosine Similarity
      Drizzle ORM Type-Safe Layer                         Immutable Audit Transaction Ledger
```

---

## 🏛 Administrative Hierarchy Model

Pravi natively mirrors the administrative structure of the Government of Gujarat:

```text
State of Gujarat
 ├── Department: Roads & Buildings (R&B)
 │    ├── Circle / Region: Ahmedabad Circle
 │    │    ├── Division: Ahmedabad City Division
 │    │    │    └── Subdivision: Ellisbridge PWD Section
 │    │    └── Division: Sanand Industrial Division
 │    └── Circle / Region: Vadodara Circle
 ├── Department: Urban Development & Urban Housing (UDD)
 │    └── Ahmedabad Municipal Corporation (AMC)
 ├── Department: Water Resources & Irrigation
 └── Department: Health & Family Welfare
```

---

## 🚀 Key Workspaces & UI Features

| Workspace | Route | Key Capabilities |
| :--- | :--- | :--- |
| **Executive Dashboard** | `/app/dashboard` | Drillable statutory metric cards, financial restoration backlog totals, and tabbed Attention Queue (*Critical*, *Poor*, *Reviews*, *Grievances*). |
| **Asset Register** | `/app/assets` | Multi-factor filtering (Registration, Lifecycle, Availability), presets (*All*, *Awaiting Verification*, *My Drafts*, *Verified*), sortable headers, column visibility dropdown, page-size control (10/20/50/100), and CSV export. |
| **Asset Detail Workspace** | `/app/assets/[id]` | Sticky tab navigation (*Overview*, *Inspections*, *Restoration Works*, *Grievances*, *Evidence*, *Audit Log*), hotkeys (`Alt+1` to `Alt+6`), quick action bar with statutory gates, and Paired Component Observations breakdown. |
| **Operational Queues** | `/app/inspections` / `/app/maintenance` | Searchable inspection and work-order queues, status preset chips (*Awaiting Review*, *In Progress*, *Completed*), and mobile-responsive layouts. |
| **Grievance Resolution** | `/app/complaints` | Citizen complaint triaging, audio playback with Deepgram transcriptions, expandable narrative views, and searchable Asset Linker dropdown. |
| **Sovereign Asset Map** | `/app/map` | Geospatial GIS inspection layer with continuous cursor-pivot zoom and cluster filtering. |
| **Universal Navigation** | *Global* | Universal Command Palette (`⌘K` / `Ctrl+K`), Keyboard Shortcuts Overlay (`?`), and dynamic contextual breadcrumbs. |

---

## 🛠 Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Framework**: [Next.js 15](https://nextjs.org) (App Router, Server Actions, React Server Components)
- **Language**: [TypeScript](https://www.typescriptlang.org) (Strict mode)
- **Database**: [Supabase PostgreSQL](https://supabase.com) with [pgvector](https://github.com/pgvector/pgvector)
- **ORM**: [Drizzle ORM](https://orm.drizzle.team) & Drizzle Kit
- **Authentication**: [Clerk Core 3](https://clerk.com) (RBAC claims, `<Show when="...">`, server `auth()`)
- **Styling & Components**: [Tailwind CSS v4](https://tailwindcss.com), [shadcn/ui](https://ui.shadcn.com), [Lucide React](https://lucide.dev)
- **Server State & Tables**: [TanStack React Query](https://tanstack.com/query), [TanStack Table](https://tanstack.com/table)
- **Voice AI**: [Deepgram](https://deepgram.com) (Nova-3 Speech-to-Text, Aura Text-to-Speech)
- **Media & Evidence CDN**: [Cloudinary](https://cloudinary.com)
- **Cache & Message Queue**: [Upstash Redis](https://upstash.com) & [Upstash QStash](https://upstash.com)
- **Code Quality**: [Biome](https://biomejs.dev) (Linter + Formatter)
- **Testing**: [Vitest](https://vitest.dev) & [Playwright](https://playwright.dev)
- **Deployment**: [Vercel](https://vercel.com) (Production Edge)

---

## 💻 Quick Start & Local Setup

### Prerequisites

- [Bun](https://bun.sh) (v1.1+ recommended)
- A [Supabase](https://supabase.com) project with PostgreSQL
- A [Clerk](https://clerk.com) application

### 1. Clone & Install

```bash
git clone https://github.com/hrushi2501/PraviAI.git
cd PraviAI
bun install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and populate the required keys:

```bash
cp .env.example .env.local
```

Key environment variables:

```env
# Database
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
DATABASE_RUNTIME_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
DATABASE_IDENTITY_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Media & Evidence (Cloudinary)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Voice AI (Deepgram)
DEEPGRAM_API_KEY=...

# Cache & Queues (Upstash)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
QSTASH_TOKEN=...
```

### 3. Database Schema Push

```bash
bun run db:push
```

### 4. Run Development Server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing & Code Quality

Pravi enforces strict code hygiene with zero tolerance for formatting or type errors:

```bash
# Run Biome lint, format, and import checks
bun run check

# Auto-format codebase with Biome
bun run format

# Strict TypeScript compilation check
bun run typecheck

# Run unit tests via Vitest
bun run test

# Run Playwright end-to-end smoke tests
bun run test:e2e
```

---

## 🚢 Production Deployment

The canonical production deployment is automated on **Vercel**:

- **Production URL**: [https://praviai.vercel.app](https://praviai.vercel.app)
- **Health API**: [https://praviai.vercel.app/api/health](https://praviai.vercel.app/api/health)
- **Framework Preset**: Next.js (App Router, Turbopack)

To deploy your own instance:

```bash
bunx vercel deploy --prod
```

---

## 🔮 Assumptions & Future Scope

### Core Assumptions

- **Verified Official Identities**: The governance model assumes officers authenticate through state-level identity federations (e.g., Parichay / Jan Samarth SSO), where official postings, administrative boundaries (Divisions/Subdivisions), and authorization tiers are cryptographically pinned to prevent jurisdictional overlap.
- **Standard Schedule of Rates (SoR)**: Financial restoration backlog accounting assumes integration with standardized departmental Schedule of Rates (e.g., Gujarat R&B / CPWD SoR), using component decomposition (piers, abutments, surfacing, expansion joints) rather than arbitrary lump sums.
- **Field Capture Integrity**: Mobile field inspections rely on device GPS and camera timestamp metadata to guarantee proof-of-presence during statutory physical observations.

### Future Scope & Roadmap

- **State Grievance Federation (SWAGAT & CPGRAMS Integration)**: In future iterations, Pravi will expose a bidirectional statutory webhook bridge with State Grievance platforms (such as Gujarat's **SWAGAT** Online Redressal System and national **CPGRAMS**). Citizen complaints lodged via CM Helplines, district collectorate portals, or WhatsApp municipal bots will automatically ingest into Pravi's geospatial-vector triage engine, attach to the corresponding asset record, and feed certified completion certificates back to the state portal upon Four-Eyes verification.
- **Automated Computer Vision & Drone Photogrammetry**: Pipeline integration for vehicle-mounted LiDAR and drone photogrammetry to automatically detect surface defects, spalling, and crack widths, matching them directly to component observation trees.
- **Predictive Asset Deterioration Curves**: Machine learning forecasting based on historical paired observations, traffic loads, and environmental stress factors to anticipate critical degradation milestones years before structural failure occurs.
- **Treasury & Escrow Milestone Linking**: Direct integration with Integrated Financial Management Systems (IFMS) to lock contractor milestone disbursements until independent Four-Eyes field inspections certify restoration work.

---

## 📜 Canonical Agent Guidelines

All AI coding agents operating in this repository adhere to the rules defined in [AGENTS.md](AGENTS.md).

- Agents consult domain skills in `skills/` and durable knowledge in `knowledge/`.
- All PRs and commits must pass `bun run check && bun run typecheck && bun run test`.

---

## 📄 License

Proprietary sovereign asset governance framework engineered for public sector evaluation. All rights reserved.
