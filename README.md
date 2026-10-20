# Cropvision-AI
KrishiVerse 2.0 is an AI-powered agricultural platform featuring CropVision AI for crop disease detection using image classification and Grad-CAM. It integrates farming assistance, weather updates, crop prices, government schemes, market insights, calendars, maps, news, videos, and financial tools to support smarter, sustainable farming.
# KrishiVerse

> **KrishiVerse isn't just an app — it will be a companion for a farmer, which walks with him.**

An offline-first, AI-enabled agricultural advisory platform for small-holder farmers of Tamil Nadu and South India — in their own language, on the phones they already own, even when the network fails.

**Developed by [Deventur](https://deventur.com)** · Repository: [github.com/Mohammed-Fareed-0561/KRISHIVERSE](https://github.com/Mohammed-Fareed-0561/KRISHIVERSE)

---

## Table of Contents

1. [Why KrishiVerse](#why-krishiverse)
2. [Workflow of the Whole System](#workflow-of-the-whole-system)
3. [Features](#features)
4. [Architecture](#architecture)
5. [Tech Stack](#tech-stack)
6. [Models Used](#models-used)
7. [The AI Safety Pipeline](#the-ai-safety-pipeline)
8. [Benchmarks & Metrics](#benchmarks--metrics)
9. [Recent Developments](#recent-developments)
10. [Roadmap — ASAP & Future](#roadmap--asap--future)
11. [Getting Started](#getting-started)
12. [Testing & CI](#testing--ci)
13. [Project Structure](#project-structure)
14. [Frameworks, Models & Repos Used](#frameworks-models--repos-used)
15. [Team & License](#team--license)

---

## Why KrishiVerse

A farmer standing in a paddy field does not have 4G. He has a 2 GB RAM Android phone, a Tamil vocabulary, a sick crop, and one chance to get the dosage right. Existing agricultural apps assume English, assume bandwidth, assume a data plan, and assume the answer is safe to act on.

**The aim of this project:** KrishiVerse isn't just an app — it will be a companion for a farmer, which walks with him. From the first day of sowing to the day of harvest: it answers his questions in his language, diagnoses his crop from a photo, tells him when to spray and when to wait, shows him the nearest shop and the right government scheme, and does **all of that even when the network is gone** — because rural India's connectivity is the assumption we design against, not the exception we handle.

**The pain points we built against:**

- Poor rural connectivity and high data cost → **offline-first PWA, local-first AI, IndexedDB caching**
- English-only advisory content → **Tamil, Tanglish, Hindi + multilingual NLP understanding**
- Dangerous, fabricated pesticide dosages → **a hard ResponseValidator safety gate that every answer, even from a cloud LLM, must pass**
- Fragmented apps for weather, prices, schemes, shops → **one companion, eleven surfaces**
- Disease mis-identification and yield loss → **on-device Crop Doctor with an honest abstention policy**

**Success is defined by the farmer:** lower pesticide cost, fewer wrong dosages, higher yield, and an advisory that still works in a no-network field.

---

## Workflow of the Whole System

KrishiVerse runs as **three cooperating services** on three ports:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  FARMER'S PHONE — PWA (localhost:5173)                                  │
│  React 18 · Zustand · IndexedDB · Service Worker · ONNX Runtime Web    │
│                                                                         │
│  Question / photo / weather request                                     │
│        │                                                                │
│        ▼                                                                │
│  aiRouter ──► connectivity probe (ONLINE / OFFLINE / UNCERTAIN)         │
│        │                                                                │
│        ├─ OFFLINE tier ─► IndexedDBChatbotEngine                        │
│        │                    ├─ AgriculturalNLP (multilingual parse)     │
│        │                    ├─ KB fastSearch (local lexical RAG, ~4 ms) │
│        │                    └─ LocalDecisionEngine (clarify/decide)     │
│        ├─ ON-DEVICE tier (optional) ─► WebLLM/WebGPU small model        │
│        ├─ ONLINE tier ─► POST /api/v1/advisory/ask                      │
│        └─ fallbacks ──► keyword OfflineChatbot / deterministic rules    │
│                                                                         │
│        ▼                                                                │
│  ResponseValidator — FINAL SAFETY AUTHORITY (dosage, provenance,        │
│        │              bounded numbers, offline-never-calls-cloud)       │
│        ▼                                                                │
│  Answer rendered · chat history saved to IndexedDB · outbox queued      │
└───────────────┬─────────────────────────────────────────────────────────┘
                │ (only when online; outbox flushes on reconnect)
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  BACKEND API (localhost:3001) — Node 18+ / Express 4                    │
│  /api/v1: auth · users · onboarding · advisory · weather · crops ·      │
│           decision · sync        |   /api/admin: telemetry, monitoring, │
│                                  |   evaluation, benchmarks, backup,    │
│                                  |   audit, RBAC (4 roles)              │
│                                                                         │
│  AI fallback chain for /advisory/ask:                                   │
│    RAG service (confidence ≥ 0.6) ─► Groq ─► Gemini ─► 503 honest fail  │
│                                                                         │
│  Storage: MongoDB (users, telemetry, audit) · SQLite (sync outbox)      │
└───────────────┬─────────────────────────────────────────────────────────┘
                │ (online tier only, 10 s timeout)
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  RAG SERVICE (localhost:8000) — Python / FastAPI                        │
│  language detect → spell correct → query expand → intent → entity       │
│  → hybrid search (FAISS + all-MiniLM-L6-v2) → rerank → generate         │
└─────────────────────────────────────────────────────────────────────────┘
```

**The end-to-end story of a single question:**

1. The farmer asks in Tamil or Tanglish, types or speaks it (`Web Speech API`, agricultural grammar).
2. `aiRouter` probes connectivity (4 s timeout, 30 s TTL) and picks a tier.
3. Offline: NLP parses the query against 200+ crop/disease aliases, the local KB index answers in ~4 ms, the local decision engine decides whether to answer or clarify.
4. Online: the backend tries the FAISS RAG service first; if its confidence is ≥ 0.6 the retrieved evidence is used, otherwise Groq (`groq/compound-mini`), otherwise Gemini (`gemini-2.5-flash`).
5. **Every answer — local or cloud — passes the ResponseValidator.** An unsourced dosage is blocked; confidence can never be laundered into provenance; offline never calls a cloud decision API.
6. The answer renders with provenance, the chat is persisted to IndexedDB, telemetry (content-free labels only) is batched, and any writes join the outbox until connectivity returns.
7. The admin dashboard at `/admin` observes the same pipeline: production arms, safety invariant runs, evaluation scores, benchmark slots, failures, audit trail.

Writes sync the other way: **outbox write-sync** (`/advisory/sync`, `/users/profile/sync`) with a *server-wins-if-newer* revision rule, so a farmer can onboard and use the app entirely offline.

---

## Features

### Ask AI — the chatbot

A tiered, language-first advisory chatbot, not a single cloud prompt.

- **Tiered routing:** offline KB → optional on-device LLM → online backend → deterministic fallbacks, chosen by a live connectivity probe
- **Multilingual NLP:** `AgriculturalNLP` understands English, हिंदी, தமிழ், मराठी, Bengali, Punjabi and Tanglish queries with 200+ crop/disease aliases
- **Guided help flows:** Crops / Fertilizers / Irrigation / Soil / Weather / Market, each leading into structured flows (`cropIssue`, `fertilizerAdvice`, …)
- **Voice in and voice out:** continuous speech recognition with agricultural grammar + read-aloud TTS
- **Chat history** persisted in IndexedDB, capped at 100 messages, fully offline
- **Honest degradation:** when nothing local matches, it says what it understands instead of inventing an answer

### Crop Doctor — disease detection

- Camera or gallery photo → deterministic **image-quality gate** (8/8 correct, 0 false-blocks) → **on-device EfficientNet-B0 ONNX classifier** running on WASM — no upload required
- Optional cloud cross-verification via Gemini Vision; if it cannot verify, it returns **"Unable to verify"** rather than guessing
- Treatment guidance is screened by the safety gate; rule-based disease engines back it up fully offline
- Results saved to local history (`diseaseDiagnoses`)
- **Honest limit:** the shipped model covers 6 PlantVillage classes (pepper/potato/tomato) and is explicitly **REJECTed for rice** — rice image diagnosis is a Phase-2 build against an expert-labelled dataset

### Weather Recommendations

- 7-day / 5-day forecasts + hourly slots via OpenWeatherMap (through the backend proxy, with mock fallback)
- **Farm-readiness engine:** spray / irrigate / field-work recommendations derived from rain, wind, humidity and temperature — no spraying in rain, no spraying above 20 km/h wind, early/late irrigation above 38 °C, blight-risk warnings from humidity
- Cached in IndexedDB (1 h TTL), background-refreshed every 12 h via service-worker periodic sync, OFFLINE badge when served from cache

### Government Schemes

- PM-KISAN, PMFBY, PMKSY and more — benefits, eligibility checkers, step-by-step application guides, required documents, official links
- Data file cached locally, refreshed every 30 days, readable offline

### Maps

- Leaflet + OpenStreetMap with an **Overpass API** shop discovery query: `shop=agrarian`, garden centres, veterinary, banks, government offices, hardware/equipment dealers
- Distance-sorted results with routing and `tel:` call popups; browser geolocation; offline banner and static seed data when tiles are unavailable

### Helpline

A hardcoded, offline-safe directory of `tel:` links — because in an emergency the app must work with zero network:

| Service | Number |
|---|---|
| Kisan Call Center (24×7) | 1800-180-1551 |
| PM-Kisan helpdesk | 155261 |
| Crop Insurance (PMFBY) | 14447 |
| Agri Clinic & Agri Business Centre | 1800-425-1556 |

### Marketplace

- Browse equipment / seeds / livestock / pesticide listings, publish your own, and chat with sellers — all stored client-side in IndexedDB so it works offline
- Transaction counter persisted locally for the finance surface

### Prices, Finance, News, Calendar, Drone

Mandi prices with LIVE/CACHED/DEMO source badges, trend charts and favorites (6 h cache) · finance calculators · offline-cached news · farming calendar · drone-service info.

### RAG — Retrieval-Augmented Generation

Two independent retrieval stacks, benchmarked against each other:

| | Stack A — frontend, offline | Stack B — backend, online |
|---|---|---|
| Where | `KRISHIVERSE/src/services/ai` in the browser | `backend/rag_service` (FastAPI on :8000) |
| Method | Lexical inverted-index `fastSearch` over KB v2 + alias fusion | Dense vectors: `all-MiniLM-L6-v2` → **FAISS** (`IndexFlatIP`, top_k 5, threshold 0.5) |
| Latency | ~3.6 ms avg | milliseconds–seconds, 10 s timeout |
| Quality | **R@1 0.72 · R@3 1.000 · MRR 0.843** | compared via `npm run eval:joint-rag` |

- Knowledge base **v2: 15,023 records** (23 curated pilot records from TNAU sources + 15,000 quarantined synthetic), stores for crops, symptoms, diseasePests, treatments, concepts and edges
- Provenance is a first-class concept: source priority, quarantine exclusion, "ID prefix never verifies", unsourced dosage blocked
- The backend AI chain uses RAG evidence first and only falls back to LLM generation when retrieval confidence is low
- Ingestion CLI: `npm run kb:ingest`, with a 5-stage deterministic dry-run-first authoritative pipeline

### Offline & PWA

The core architectural promise — **OFF-01..20: 17 measured pass, 0 failed, 3 known gaps**.

- `vite-plugin-pwa` + Workbox, installable manifest, app shortcuts (Ask AI / Weather / Prices)
- IndexedDB (via `idb`) with stores for weather, mandi, schemes, shops, chat, diagnoses, sync queue, the whole KB, farmers and marketplace
- **Outbox write-sync** with batch flush and server-wins conflict resolution
- Periodic background sync (weather + prices, 12 h) and an action-sync queue
- Connectivity contract: probe with 4 s timeout and 30 s TTL; cache TTLs handled by a cache manager; axios interceptor marks failures `isOffline` so every service returns stale cache instead of throwing
- Measured: **19/19 offline queries completed with fetch disabled** (17 with evidence), full set **36/36**
- Deliberately not claimed until measured on real devices: service-worker durability (OFF-18), IndexedDB persistence (OFF-19), telemetry queue drain (OFF-20)

### UI & UX

- **Mobile-first:** fixed 56 px header + 80 px bottom nav, desktop sidebar ≥769 px; 4 main tabs + a "More" bottom sheet (focus-trapped, Escape-to-close)
- **Design system:** CSS custom properties — agrarian green `#2E7D52` / soil brown `#7C5C3E`, 8 pt spacing scale, Baloo 2 headings, Noto Sans + **Noto Sans Tamil** + **Noto Sans Devanagari** body
- **Motion:** framer-motion page transitions, pull-to-refresh, swipe navigation — all respecting `prefers-reduced-motion`
- **Accessibility:** skip link, `.sr-only`, visible `:focus-visible` rings, aria-modal dialogs
- **Voice-first:** speech recognition across 12 Indian language locales + TTS read-aloud
- **Trust surfaces:** Install banner, Offline banner, service-worker update prompt, honest source badges (LIVE / CACHED / DEMO / OFFLINE)

### Admin Dashboard (`/admin`)

An operations surface that never serves farmers — isolated by an import-surface test:

- System health, chatbot/RAG/safety/crop-doctor/language/source panels (30 s polling)
- **AI benchmarks section** (`/admin/benchmarks`): chatbot arms, retrieval, conditional gating A/B, decision, needle, Laya, grounding, safety, ablation
- Evaluation dataset switcher, failure/incident triage, backup drill + verify + restore (RBAC-gated), audit trail, dataset/model/dependency registry
- Farmer adoption analytics — **aggregate only, no PII**, admin accounts excluded server-side
- RBAC: `superadmin · admin · auditor · viewer` with permission scopes (`admin:read`, `admin:ops`, `admin:audit`, `admin:rollback`, …)
- Telemetry: schema-v1 events, batch ≤25, **content-free labels only — no message text, no PII**

### Auth & Onboarding

- Email + password, stateless HS256 JWT, bcrypt cost 12, enumeration-safe verification/reset flows, constant-time code comparison, per-IP and per-email brute-force throttling
- Six-step pilot onboarding wizard (language → region → crops) that works offline and syncs later
- Full audit + telemetry on every auth event

---

## Architecture

```
                    ┌──────────────────────────────┐
   PRESENTATION     │  React 18 PWA (Vite 5)       │  :5173
                    │  routes · Zustand stores ·   │
                    │  i18n (en/ta/hi) · Tailwind  │
                    └──────────────┬───────────────┘
                                   │ axios + JWT interceptor
                    ┌──────────────▼───────────────┐
   APPLICATION      │  Express 4 API               │  :3001
                    │  /api/v1  farmer-facing      │
                    │  /api/admin  RBAC operations  │
                    │  JWT · Joi · helmet · limit  │
                    └───┬───────────────┬──────────┘
                        │               │
        ┌───────────────▼──┐   ┌────────▼────────────┐
   DATA │  MongoDB         │   │  SQLite (node:sqlite)│
        │  users, telemetry│   │  offline sync outbox │
        │  audit, incidents│   └─────────────────────┘
        └──────────────────┘
                        │
                    ┌───▼───────────────────────────┐
   INTELLIGENCE     │  Python RAG service (FastAPI) │  :8000
                    │  all-MiniLM-L6-v2 + FAISS     │
                    └───────────────────────────────┘

   CLIENT-SIDE INTELLIGENCE (always available, even offline)
   aiRouter → AgriculturalNLP → KB fastSearch → LocalDecisionEngine
           → ResponseValidator (final safety authority)
   Crop Doctor: image-quality gate → EfficientNet-B0 ONNX (WASM)
```

**Governing rules:**

1. The **ResponseValidator is the final safety authority** — generators never author facts, they propose them.
2. **No AI provider keys in the frontend** — every cloud call is proxied through the Node backend.
3. **No number without a result file** — unknown = `null`/`skipped` with a `skipReason` and `howToRun`, never invented.
4. **Screening pass rates are never farmer-facing accuracy**, and desktop numbers never become mobile claims.
5. A **critical safety failure ⇒ automatic NO-GO**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18.2, Vite 5, React Router 7, Zustand 4, Tailwind CSS 3, DaisyUI 4, framer-motion |
| PWA / Offline | vite-plugin-pwa + Workbox, custom service workers, `idb` (IndexedDB), outbox sync |
| i18n / Voice | i18next, react-i18next, Web Speech API (recognition + synthesis) |
| Maps | Leaflet 1.9, react-leaflet 4, OpenStreetMap, Overpass API |
| Charts | Chart.js, react-chartjs-2, Recharts |
| On-device ML | ONNX Runtime Web (WASM), `@mlc-ai/web-llm` (WebGPU, optional) |
| Backend | Node 18+ (ESM), Express 4, Mongoose 8, JWT (jsonwebtoken), bcryptjs, Joi, helmet, express-rate-limit, winston, optional Sentry |
| Database | MongoDB (primary), SQLite via `node:sqlite` (sync outbox), IndexedDB (client) |
| RAG service | Python 3.10/3.11, FastAPI 0.109, sentence-transformers 2.3.1, FAISS 1.7.4, uvicorn, pydantic |
| Cloud AI | Groq (`groq/compound-mini`, `llama-3.1-8b-instant`), Google Gemini (`gemini-2.5-flash`) |
| Data APIs | OpenWeatherMap, OpenStreetMap/Overpass |
| Testing | Vitest (frontend, 57 test files), Mocha + Chai + Supertest + mongodb-memory-server (backend, 19 files) |
| CI/CD | GitHub Actions — gitleaks secret scan · backend · frontend · RAG service |

---

## Models Used

| Model | Role | Runtime | Source |
|---|---|---|---|
| **EfficientNet-B0 (PlantVillage)** | Crop Doctor image classification, 6 classes, 32.1 MB + 40.4 MB WASM | On-device, ONNX Runtime Web | `KRISHIVERSE/public/models/efficientnet_b0_plantvillage.onnx` |
| **all-MiniLM-L6-v2** | Dense sentence embeddings (384-d) for the online RAG stack | Backend, sentence-transformers + FAISS | [huggingface.co/sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) |
| **Groq `groq/compound-mini`** | Backend advisory chain (primary online generation) | Groq API, proxied by backend | [groq.com](https://groq.com) |
| **Groq `llama-3.1-8b-instant`** | Frontend-declared live chat model | Groq API, proxied by backend | [groq.com](https://groq.com) |
| **Gemini `gemini-2.5-flash`** | Advisory fallback + Crop Doctor cloud cross-verification | Google Generative AI SDK | [ai.google.dev](https://ai.google.dev) |
| **Mistral (via Ollama)** | Optional fully-local chat LLM | `http://localhost:11434` | [github.com/ollama/ollama](https://github.com/ollama/ollama) |
| **Laya `multilingual`** | Optional decision engine (intent / clarification / candidate selection) — **off by default** | Local sidecar, `POST /v1/systemone` | [github.com/convaiinnovations/laya](https://github.com/convaiinnovations/laya) |
| **Qwen2.5 0.5B / 1.5B / 3B** | Evaluated WebGPU on-device tiers | `@mlc-ai/web-llm` | [huggingface.co/Qwen](https://huggingface.co/Qwen) |
| **Evaluated, not shipped** | Needle 3 (Apache-2.0), `qwen3-1.7b`, `lfm2.5-450m`, `smollm2-135m/360m`, `gemma-3-270m/1b` — all **NEEDS MORE DATA** | — | [github.com/Cactus-Compute/needle3](https://github.com/Cactus-Compute/needle3), Hugging Face |

Deterministic by design: `AgriculturalNLP`, `LocalDecisionEngine`, `ResponseValidator`, `AgriculturalGroundingGuard` and the image-quality guard are **rule-based with zero model calls** — safety and offline behaviour must never depend on a model's mood.

---

## The AI Safety Pipeline

Agricultural advice can kill a crop or a person. KrishiVerse treats safety as an engineering gate, not a prompt:

1. **Provenance before confidence** — a record verified only because its ID *looks* like a source is never verified; unsourced dosage is blocked outright.
2. **ResponseValidator on every answer, including cloud LLM output** — 15 invariants: wrong dose blocked, wrong crop blocked, unsupported schedule/numeric blocked, malformed-output fallback, confidence ≠ provenance, offline never calls Laya.
3. **AgriculturalGroundingGuard** — deterministic claim→evidence matching with verdicts `SUPPORTED / PARTIALLY_SUPPORTED / UNSUPPORTED / CONTRADICTED / HIGH_RISK_UNSUPPORTED / INSUFFICIENT_EVIDENCE`, fully network-free.
4. **Abstention over hallucination** — unknown crop ⇒ `UNKNOWN_CROP`, unverifiable image ⇒ "Unable to verify", no local match ⇒ an honest fallback message.
5. **Quarantine** — synthetic KB records are quarantined (15,000 of them) and excluded from evidence.

**Measured: safety 19/19, grounding 16/16, provenance 7/7, validator cross-check 4/4 (was 3/4).**

---

## Benchmarks & Metrics

Everything below is reproducible: `cd KRISHIVERSE && npm run eval:mobile-ai` (11 suites, seed `20261008`, run metadata includes git SHA + dataset hashes). Results live in `KRISHIVERSE/eval/results/` and `KRISHIVERSE/eval/mobile-ai/results/`.

> **Honest reading rules:** these are *screening pass rates over curated cases*, never farmer-facing accuracy. Benchmark host for all numbers: Windows 10, Intel i7-8650U @1.90 GHz, 16 GB RAM, Node v22. Device arms are deliberately skipped until real hardware is measured.

### Mobile Utility Score (spec §41 — quality 30 / safety 20 / grounding 15 / offline 15 / latency 10 / memory 5 / size 5)

| Profile | Score |
|---|---|
| BEFORE (original stack) | **82.4** |
| Arm A — production baseline (NLP + KB + decision) | **98.6** |
| Arm E — fused KB + RAG (RRF) | **99.4** |

### Chatbot arms (36 rice cases + 4 hard safety cases, EN/TA/Tanglish)

| Arm | Stack | Pass | Latency avg / p95 |
|---|---|---|---|
| A — baseline | rules + AgriculturalNLP + lexical KB + local decision | **1.000** (95) | 13.04 / 94.51 ms |
| B — NLP only | AgriculturalNLP parse | 1.000 (57) | 3.76 / 12.51 ms |
| C — NLP + KB | + production `fastSearch` | 1.000 (86) | 4.39 / 14.21 ms |
| E — fused | KB + RAG via RRF | **1.000** (86) | 5.55 / 17.70 ms |
| G — + Laya | with local decision fallback | 1.000 (95) | 4.95 / 16.32 ms |

Language bands: **EN 317/317 · TA 126/126 · Tanglish 157/157**.

### Ablation (what actually matters)

| Removed | Score | Δ |
|---|---|---|
| — (baseline) | 1.000 | — |
| − AgriculturalNLP | **0.446** | **−0.554** |
| − language ID | 0.891 | −0.109 |
| − decision engine | 0.931 | −0.069 |
| − retrieval | 0.941 | −0.059 |

### Retrieval, safety, grounding, offline

| Suite | Result |
|---|---|
| Retrieval (50-query screen) | **R@1 0.72 · R@3 1.000 · R@5 1.000 · MRR 0.843**, avg 3.62 ms |
| Retrieval (44 curated cases) | R@1 0.727 · R@3 1.000 · MRR 0.848, avg 3.43 ms |
| Safety | **19/19** (15 frozen invariants + 4 rice safety), `criticalSafetyFailure: false` |
| Grounding guard | **16/16** across 9 categories, avg 1.23 ms |
| Provenance regression | **7/7 hard checks** |
| Offline matrix | **OFF-01..20: 17 pass, 0 fail, 3 known gaps**; 19/19 + 36/36 queries with `fetch` disabled |
| Connectivity probe | 7/7 scenarios, 707 ms (4 s timeout) |
| Image-quality gate | 8/8 verdicts, 8/8 flags, **0 false-blocks**, avg 9.51 ms |
| Conditional retrieval gating | −14.3% retrieval calls, **8.62 ms vs 15.71 ms** avg (PILOT) |
| Chatbot eval (screening) | 33/33, avg 14.08 ms, 0 failures |

### Crop Doctor

- **Top-1 0.95 (114/120)**, macro F1 **0.9505**, Wilson 95% CI **[0.895, 0.977]** — 120-image PlantVillage hold-out, 6 classes × 20
- Model 32.1 MB + 40.4 MB WASM runtime; text/rule path avg 0.65 ms
- **REJECT for rice** — no rice disease classes in the model (rice image build = Phase 2)
- Abstention probes: 5/5 correctly abstained

### Footprint & latency (desktop reference)

KB index build 8.4 ms / +1.71 MB heap · simple query 6.61 ms avg (p95 13.90) · complex query 10.27 ms avg (p95 23.98) · ONNX 32.1 MB · WASM 40.4 MB · KB v2 11.0 MB · production bundle 95.9 MB (lazy-loaded routes).

### Decision matrix (15 rows)

**ADOPT 7** — AgriculturalNLP + ResponseValidator pipeline · arm E · lexical fastSearch · ResponseValidator · local decision engine · image-quality gate · connectivity/offline router
**PILOT 2** — conditional retrieval gating · grounding guard
**REJECT 1** — Crop Doctor ONNX for rice
**NEEDS MORE DATA 5** — hybrid alias-RRF · Laya live · Needle 3 · small LLMs · low-end Android profile

**Final rice mobile-AI benchmark verdict: `CONDITIONAL GO`** (`KRISHIVERSE/docs/ai/final-rice-mobile-ai-benchmark-report.md`).

---

## Recent Developments

| Date | Milestone |
|---|---|
| 2026-10-05 | **Initial commit** — offline-first agricultural advisory PWA |
| 2026-10-06 | **Phase 3E.2** — claim audit + first verified dose-bearing activation in the knowledge base |
| 2026-10-08 | **Farmer authentication, onboarding & admin analytics** — email/JWT auth, six-step onboarding, aggregate farmer analytics (no PII) |
| 2026-10-10 | **Mobile AI benchmark suite + admin benchmarks dashboard + response-validation hardening** — 11 benchmark suites, `eval:mobile-ai` pipeline, `/admin/benchmarks` section, benchmark API + tests |

Phase history: **Phase 1** AI audit, Laya evaluation, dose-safety fix → **Phase 2** AgriculturalNLP / intent tuning → **Phase 3A** Crop Doctor pipeline → **Phase 3B** RAG quality, provenance invariants, retrieval benchmark → **Phase 3C/3E.1/3E.2** evidence contracts, authoritative ingestion, verified dose activation → **Phase 1H** quality dashboard → **Mobile AI benchmark (spec §0–§69)** → **Admin benchmarks dashboard**.

Latest test baselines: frontend **216+ passing** across 57 Vitest files · backend **164+ passing** Mocha across 19 files · RAG service Python test scripts in CI.

---

## Roadmap — ASAP & Future

### ASAP (converting CONDITIONAL GO → GO)

- **Measure on real devices** — low-end (2 GB) and mid-range Android arms, replacing the desktop reference numbers; battery/thermal profile
- **Close offline gaps OFF-18/19/20** — service-worker durability, IndexedDB persistence, telemetry queue drain
- **Rice disease image model** — expert-labelled dataset (`docs/cropdoctor/dataset-spec.md`), then train/evaluate a rice-capable classifier; until then Crop Doctor abstains honestly
- **Raise provenance coverage** — currently ~1.3% of KB records carry full provenance; authoritative ingestion of more vetted sources
- **Pilot gating** — conditional retrieval gating and the grounding guard from PILOT toward ADOPT
- **Resolve NEEDS MORE DATA arms** — hybrid alias-RRF, Laya live latency/quality, Needle 3, small-LLM WebGPU tiers
- **Rotate the plaintext API key** that still appears in `docs/architecture/ARCHITECTURE_OVERVIEW.md`

### v2.1 (planned — `plans/2026-05-10_krishiverse-v2.1`)

- Bundle reduction: lazy-route everything, dynamic ML imports, target **< 200 KB gzipped** main bundle
- Complete voice TTS on Ask (Tamil/Hindi/English) + calendar quick action
- PWA install banner with 3-day snooze
- Weather farming-advice layer (rule-based spray/irrigate/harvest rules)
- Offline news cache with "showing cached news" badge
- Real push notifications: rain alerts, mandi price watchlist thresholds, scheme deadline T-3 days
- 3-step onboarding (language → region → crops), already substantially built

### Beyond (v3.0+)

- iOS native shell · Firebase/phone OTP auth · expert-labelled multi-language evaluation datasets · a full rice/pest specialist vision model · drone-service integration · IoT and blockchain integrations · multilingual expansion beyond the current en/ta/hi UI (te/kn/hi speech + NLP already partially covered)

**Explicit non-goals for v2.1:** no iOS native, no blockchain/IoT, no operational transform, no paid SMS.

---

## Getting Started

### Prerequisites

- **Node.js 20+** (backend uses `node:sqlite`, requiring Node ≥ 22.5 for the sync outbox) — [nodejs.org](https://nodejs.org/)
- **Python 3.10/3.11** + pip (for the RAG service) — [python.org](https://python.org/)
- **Git**
- *(Optional)* **Ollama** for fully-local chat — [ollama.ai](https://ollama.ai)

### 1. Clone

```bash
git clone https://github.com/Mohammed-Fareed-0561/KRISHIVERSE.git
cd KRISHIVERSE
```

### 2. Install

```bash
# Frontend
cd KRISHIVERSE && npm install

# Backend
cd ../backend && npm install

# RAG service
cd rag_service
python -m venv venv
venv\Scripts\activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure

```bash
# Frontend
cd KRISHIVERSE && cp .env.example .env

# Backend
cd ../backend && cp .env.example .env
```

| Where | Key variables |
|---|---|
| `KRISHIVERSE/.env` | `VITE_API_BASE=http://localhost:3001/api/v1`, `VITE_GROQ_MODEL`, `VITE_OPENWEATHER_API_KEY`, `VITE_GEMINI_API_KEY`, `VITE_DEFAULT_LANGUAGE=en`, `VITE_ENABLE_LAYA_DECISIONS=false` |
| `backend/.env` | `PORT=3001`, `JWT_SECRET`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENWEATHER_API_KEY`, `RAG_SERVICE_URL=http://localhost:8000`, `MONGODB_URI` (required in production), `ADMIN_EMAIL`/`ADMIN_PASSWORD`, `ALLOWED_ORIGINS` |
| `backend/rag_service/.env` | `EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2`, `VECTOR_STORE_TYPE=faiss`, `TOP_K_RESULTS=5`, `SIMILARITY_THRESHOLD=0.5` |

> No AI provider key is ever placed in the frontend — cloud calls are proxied through the backend. `backend/.env` is git-ignored and CI runs **gitleaks** on every push/PR.

### 4. Run

Easiest — all three services in one script (Windows):

```bat
START_EVERYTHING.bat        (backend :3001 → RAG :8000 → frontend :5173)
```

Or manually in three terminals:

```bash
# 1 — RAG service
cd backend/rag_service && python app.py          # http://localhost:8000/health

# 2 — Backend
cd backend && npm start                          # http://localhost:3001/api/v1/health

# 3 — Frontend
cd KRISHIVERSE && npm run dev                    # http://localhost:5173
```

Without MongoDB configured, the backend boots an in-memory MongoDB in development (production requires `MONGODB_URI`).

### 5. Install as a PWA

Open `http://localhost:5173` on your Android phone (same Wi-Fi, use your machine's IP), tap **Install** — it installs like a native app and keeps working offline.

### Common scripts

| Command | Where | Purpose |
|---|---|---|
| `npm run dev` / `build` / `lint` | `KRISHIVERSE/` | Vite dev, production build, ESLint |
| `npm test` | `KRISHIVERSE/` | Vitest (57 test files) |
| `npm run eval:mobile-ai` | `KRISHIVERSE/` | 11 benchmark suites + required result files |
| `npm run eval:joint-rag` | `KRISHIVERSE/` | Stack A vs Stack B joint RAG A/B |
| `npm run kb:ingest` / `migrate:kb` | `KRISHIVERSE/` | Knowledge-base ingestion / migration |
| `npm run deploy` | `KRISHIVERSE/` | Deploy to GitHub Pages |
| `npm start` / `npm test` | `backend/` | Express server / Mocha suite |
| `python app.py` | `backend/rag_service/` | FastAPI RAG service |

---

## Testing & CI

```bash
cd KRISHIVERSE && npm test        # Vitest — unit, eval, offline, admin isolation
cd backend && npm test            # Mocha + mongodb-memory-server — 19 suites
cd backend/rag_service && python test_query_processor.py && python test_enhanced_rag_engine.py
```

**GitHub Actions** (`.github/workflows/ci.yml`) on every push/PR to `main`/`master`/`develop`:

1. **gitleaks** — secret scanning (fetch-depth 0)
2. **backend** — Node 20, `npm ci` → lint → Mocha (`NODE_ENV=test`)
3. **frontend** — Node 20, `npm ci` → Vitest → production build
4. **rag** — Python 3.11, `pip install -r requirements.txt` → RAG test scripts

Hard regression suites that **fail the build**: provenance (7 checks), safety (7 invariants + validator gate), verified-dosage, authoritative activation, template grounding, admin isolation, telemetry schema.

---

## Project Structure

```
KRISHIVERSE_Project/
├── KRISHIVERSE/                    # Frontend PWA (React 18 + Vite 5)
│   ├── src/
│   │   ├── components/  pages/  hooks/  store/  features/
│   │   ├── services/ai/            # aiRouter, AgriculturalNLP, ResponseValidator,
│   │   │                           # decision engines, ONNX classifier, connectivity
│   │   ├── services/{api,db,offline,sync,telemetry}/
│   │   ├── data/kb/v2/             # knowledge base + manifest
│   │   ├── admin/                  # admin SPA (isolated from farmer runtime)
│   │   ├── i18n/                   # en / ta / hi
│   │   └── styles/  config/  utils/
│   ├── eval/                       # evaluation suites + results/*.json
│   │   └── mobile-ai/              # 11 benchmark suites, adapters, datasets,
│   │                               # grounding/imagequality guards, results/
│   ├── docs/ai/                    # 14 benchmark & architecture reports
│   ├── public/models/              # efficientnet_b0_plantvillage.onnx
│   ├── scripts/                    # kb-ingest, joint-rag-benchmark
│   └── tests/  test/  src/**/__tests__/
├── backend/                        # Node API (:3001)
│   ├── server.js  src/bootstrap.js
│   ├── src/routes/                 # auth, users, weather, advisory, crops, decision
│   ├── src/routes/admin/           # telemetry, monitoring, evaluation, benchmarks, ops
│   ├── src/admin/                  # RBAC, services (backup, audit, registry, …)
│   ├── src/services/               # jwt, credentials, syncStore (SQLite), delivery
│   ├── rag_service/                # Python FastAPI RAG (:8000) — FAISS + MiniLM
│   ├── eval/                       # model training/eval tooling (EfficientNet, latency)
│   └── tests/                      # Mocha suites
├── models/                         # onnx_eval_results.json, vector_store artifacts
├── docs/                           # ~90 docs: architecture, rag, chatbot, crop-doctor,
│                                   # weather, evaluation, knowledge-base, admin, auth, …
├── plans/                          # KrishiVerse v2.1 plan + phase tasks
├── .github/workflows/ci.yml        # gitleaks + backend + frontend + rag
├── START_EVERYTHING.bat            # run all three services
└── README.md                       # ← you are here
```

---

## Frameworks, Models & Repos Used

**This repository**
- [Mohammed-Fareed-0561/KRISHIVERSE](https://github.com/Mohammed-Fareed-0561/KRISHIVERSE) — the KrishiVerse monorepo (frontend PWA, Node backend, Python RAG service, docs, benchmarks)

**Frontend & mobile web**
- [React](https://github.com/facebook/react) · [Vite](https://github.com/vitejs/vite) · [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) · [DaisyUI](https://github.com/saadeghi/daisyui) · [Zustand](https://github.com/pmndrs/zustand) · [React Router](https://github.com/remix-run/react-router) · [framer-motion](https://github.com/framer/motion)
- [Workbox](https://developer.chrome.com/docs/workbox) via [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) · [idb](https://github.com/jakearchibald/idb) (IndexedDB)
- [Leaflet](https://github.com/Leaflet/Leaflet) + [react-leaflet](https://github.com/Leaflet/react-leaflet) (OpenStreetMap tiles, Overpass API)
- [i18next](https://github.com/i18next/i18next) · [Chart.js](https://github.com/chartjs/Chart.js) · [Recharts](https://github.com/recharts-org/recharts)

**On-device & retrieval ML**
- [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) — EfficientNet-B0 PlantVillage inference
- [WebLLM / @mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) — WebGPU small-LLM tiers (optional)
- [sentence-transformers `all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) · [FAISS](https://github.com/facebookresearch/faiss)
- PlantVillage-derived evaluation set (6 classes, 120 images) · model export/eval tooling in `backend/eval/`

**Backend & data**
- [Express](https://github.com/expressjs/express) · [Mongoose/MongoDB](https://github.com/mongodb/mongo) · [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) · [bcryptjs](https://github.com/dcodeIO/bcrypt.js) · [Joi](https://github.com/hapijs/joi) · [helmet](https://github.com/helmetjs/helmet) · [winston](https://github.com/winstonjs/winston) · [Sentry](https://github.com/getsentry/sentry-javascript) (optional)
- [FastAPI](https://github.com/fastapi/fastapi) · [uvicorn](https://github.com/encode/uvicorn) · [pydantic](https://github.com/pydantic/pydantic)

**Cloud AI & data providers**
- [Groq](https://groq.com) · [Google Gemini](https://ai.google.dev) · [Ollama](https://github.com/ollama/ollama) · [OpenWeatherMap](https://openweathermap.org/api) · [OpenStreetMap / Overpass](https://overpass-turbo.eu) · [Laya](https://github.com/convaiinnovations/laya) (optional decision sidecar)

**Tooling & QA**
- [Vitest](https://github.com/vitest-dev/vitest) · [Mocha](https://github.com/mochajs/mocha) · [Chai](https://github.com/chaijs/chai) · [Supertest](https://github.com/ladjs/supertest) · [mongodb-memory-server](https://github.com/typegoose/mongodb-memory-server) · [GitHub Actions](https://github.com/features/actions) · [gitleaks](https://github.com/gitleaks/gitleaks)

**Datasets & knowledge sources**
- PlantVillage (image classification) · TNAU pilot sources (`knowledge/tnau-pilot/`, provenance-tracked) · synthetic KB generation (quarantined, excluded from evidence) · government schemes dataset (`public/data/schemes.json`)

---

## Team & License

**Developed by [Deventur](https://deventur.com)**

KrishiVerse is built for the small-holder farmer — as a companion that walks with him through every season, in his language, on his terms, online or off.

- 🌐 [deventur.com](https://deventur.com)
- 📦 Repository: [github.com/Mohammed-Fareed-0561/KRISHIVERSE](https://github.com/Mohammed-Fareed-0561/KRISHIVERSE)
- 📖 Full documentation index: [`docs/README.md`](docs/README.md) · benchmark reports: [`KRISHIVERSE/docs/ai/`](KRISHIVERSE/docs/ai/)

**License:** MIT

---

> **A note on honesty in this README:** benchmark numbers are screening pass rates over curated, mostly synthetic cases — they are not farmer-facing accuracy. Crop Doctor's shipped model does not cover rice and abstains rather than guesses. Mobile numbers are pending real-device measurement, and three offline behaviours (OFF-18/19/20) are known gaps. Every claim here maps to a result file under `KRISHIVERSE/eval/`.

