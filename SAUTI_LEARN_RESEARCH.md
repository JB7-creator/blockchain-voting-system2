# Sauti Learn — Research & Zero-Regression Integration Plan

> **Sauti Learn** (from *sauti* = "voice" in Kiswahili) is a proposed **voice-learning module** for the
> DeVote Kenya blockchain voting system. A voter initializes it, then **talks to it in English,
> Kiswahili, or Gĩkũyũ** and it teaches them about the voting process (registration, positions,
> verification, dates, how ballots land on-chain, etc.), then guides them back into the voting flow.

---

## 1. What exists today (baseline the integration must not break)

| Component | Stack | Role |
|---|---|---|
| `contracts/voting.sol` | Solidity 0.8.20 + Hardhat | Position-based voting on Ethereum **Sepolia**, `CONTRACT_ADDRESS = 0xc1dd…4931E` |
| `ussd-gateway/` | Node + Express + ethers v6 + Africa’s Talking | USSD menu (EN/SW), Voice IVR (DTMF only), Firestore voter store, async on-chain settlement, SMS receipts |
| `devote-ui/` | React 19 + CRA + ethers v6 + Firebase | Wallet connect, registration, voting dashboard, results |
| Deploy | Render (`render.yaml`, gateway only) + Netlify (UI) | Free tier |

**Hard constraints derived from the baseline:**
1. The `Voting.sol` contract is **deployed and live** — no migration, no ABI change, no new wallet flows.
2. Africa’s Talking credentials, Firestore project, relayer key and voter PIN logic are **working** — do not touch them.
3. USSD responses are **≤182 chars per screen** and the session is stateless per request — any new branch must respect that.
4. The UI is CRA + Tailwind with hash-routing (`#about`, `#vote`, …) — new pages must be additive.

---

## 2. Product definition (MVP scope)

**Sauti Learn = a multilingual, voice-first civic-education assistant.**

- **User initializes** it (USSD option, hotline menu option, or web page) and picks a language:
  `1 English · 2 Kiswahili · 3 Gĩkũyũ`.
- They **speak a question** ("How do I vote?", "Ninawezaje kupiga kura?", "Ndĩkũhota gwĩkĩra kura atĩa?").
- Sauti **transcribes → answers in the same language → speaks back** (audio on IVR/web; SMS text fallback on USSD).
- It answers from a **curated, factual DeVote FAQ** (never invented policy) and can **deep-link** the user into Registration/Vote.
- Optional: a **lesson-completion record** in a *new* Firestore collection (`sautiProgress`) — **no contract change** (on-chain badges are explicitly out of scope for v1; a badge would require a contract upgrade and new wallet transactions, i.e. regression risk).

**Explicitly out of scope for v1:** voice-driven voting (a voter must not cast a ballot by voice alone —
that breaks the ID+PIN gate and the existing settlement path), PII collection, on-chain writes.

---

## 3. Kenya tool landscape — verified research (Nov 2026)

### 3.1 Speech-to-Text (ASR)

| Tool | en-KE | sw-KE | Kikuyu | Notes |
|---|---|---|---|---|
| **Azure AI Speech** (`en-KE`, `sw-KE` locales, real-time + fast transcription + custom speech) | ✅ verified | ✅ verified (`sw-KE`) | ❌ not supported | Best managed accuracy for Kenyan EN/SW; custom speech can add candidate names/phrases. 5 free hours/mo starter. |
| **Google Cloud Speech-to-Text (Chirp)** | ✅ | ✅ (`sw-KE`) | ❌ | Cheap per-15s pricing, strong Swahili. |
| **OpenAI Whisper API** (`whisper-1`, $0.006/min) | ✅ | ✅ (very good, many accents) | ⚠️ weak | Simplest API; good fallback. |
| **Meta MMS `facebook/mms-1b-all`** (open, 1162 langs) | ✅ | ✅ (`swa`) | ✅ **verified `kik` (Gikuyu) row in MMS coverage: ASR + TTS + LID** | The only *zero-license-fee* model covering Kikuyu. Run adapter `kik`. |
| **Community Kikuyu ASR on Hugging Face** | — | — | ✅ | `badrex/w2v-bert-2.0-kikuyu-asr` (0.6B, Nov 2025, SOTA-ish), `FarmerlineML/kikuyu_ASR_3.0`, `DeKUT-DSAIL/tunuh-whisper-base-kikuyu-v1`, `MaryWambo/whisper-base-kikuyu*`. |
| **Browser Web Speech API** | ✅ | ⚠️ varies | ❌ | Free, on-device, zero-latency pre-check in the React page; great degraded mode. |

**Decision:** *Managed* path (Azure or Google) for EN/SW + **small Python sidecar** hosting MMS-`kik`/Wav2Vec2-BERT-Kikuyu for Gĩkũyũ. Self-hosting Kikuyu is required because **no commercial API offers it**.

### 3.2 Text-to-Speech (TTS)

| Tool | en-KE | sw-KE | Kikuyu | Notes |
|---|---|---|---|---|
| **Azure neural TTS** | ✅ | ✅ (`sw-KE` voices) | ❌ | Natural voices; stream to IVR via `<Play>` of a hosted mp3, or speak on web. |
| **Africa’s Talking `<Say>`** | ✅ | ✅ Kenyan voices incl. Swahili | ❌ | Already integrated in gateway; simplest IVR audio with no new infra. |
| **Google Cloud TTS** | ✅ | ✅ | ❌ | |
| **ElevenLabs (multilingual v2)** | ✅ | ✅ supports Swahili | ⚠️ cloning possible | Premium quality/cost; usable for branded voice. |
| **Open-source Kikuyu TTS (Hugging Face)** | — | — | ✅ | `BrianMwangi/African-Kikuyu-TTS`, `gateremark/kikuyu-tts-v1` (VITS-style ~36M params) — run in the same Python sidecar. |
| **Browser `speechSynthesis`** | ✅ | ⚠️ | ❌ | Free fallback on the web page. |

**Decision:** Azure/Google + AT `<Say>` for EN/SW; Kikuyu TTS from the open models in the sidecar (short pre-generated answer cache makes even a slow TTS acceptable).

### 3.3 Conversational LLM (the "brain")

| Tool | Swahili | Kikuyu | Kenya-relevant notes |
|---|---|---|---|
| **Google Gemini (2.x Flash)** | ✅ excellent multilingual training | ⚠️ some understanding | Best price/quality for Swahili; Google Cloud has Africa footholds; supports function calling for FAQ retrieval. |
| **OpenAI GPT-4o-mini / 4o** | ✅ good | ⚠️ | Widely used; data leaves region — note DPA §28–31 cross-border transfer. |
| **Anthropic Claude Haiku** | ✅ good | ⚠️ | Strong instruction-following for FAQ-grounded answers. |
| **Kikuyu-capable LLMs (HF)** | — | ✅ | `karanjaxyz/TinyLlama-1.1B-Kikuyu-LoRA`, `karanjaxyz/kikuyu-Llama-3.2-3B-lora`, `MNG-4/nllb-kikuyu-model`, translations via `nickdee96/nllb-200-600m-kikuyu-english`, `gateremark/kikuyu_translategemma_12b_merged`, 220k-row `michsethowusu/kikuyu-swahili-sentence-pairs`. |

**Decision — translation-bridge architecture** (industry standard for low-resource languages):
1. ASR (Kikuyu) → **NLLB/Translategemma fine-tune** → Swahili/English.
2. LLM generates a **short, grounded** answer in English (or directly in Swahili).
3. Answer is translated back to Kikuyu and rendered with Kikuyu TTS.
This keeps the answer *correct* (LLM operates in a language it knows) while sounding local.

### 3.4 Telephony capture (Africa’s Talking)

The gateway already uses AT Voice (`<Say>`, `<GetDigits>`). Sauti adds only:
- `<Record maxLength="30" finishOnKey="#" callbackUrl="...">` — AT posts the **recording URL** back to our webhook.
- `<Play url="https://.../answer.mp3">` — plays sidecar/Azure-generated audio.

No new telephony vendor, no new SIM/USSD shortcode — **zero incremental telco integration work**.

### 3.5 Compliance (Kenya Data Protection Act, 2019)

- Voice is **biometric-adjacent personal data** in Kenya (sensitive personal data).
- v1 rule: **transcribe in memory, never store raw audio, never send ID/PIN/county to any LLM, no transcripts retained** unless the user opts in.
- Prefer in-region processing (Azure/Google Africa regions — verify current regional availability) or the self-hosted sidecar for the Kikuyu path; publish a one-page privacy note in EN/SW/KIK (included in the module).

---

## 4. Architecture (why this shape = no regression)

```
                 ┌────────────────────────────┐
   React (SPA) ──┤  sauti-learn-service  :5050 │◄── USSD/Voice hooks (flag-gated,
   (mic/audio)   │  Node + Express           │     additive) inside ussd-gateway:5000
        ▲        │  /ask  /voice/ask  /tts   │
        │        └───────┬───────────────────┘
   AT IVR ── /voice ────┤ (optional proxy route in gateway)
   (Record→URL)          │
                         ▼
        ┌──────────────────────────────────────────┐
        │  ASR:  Azure/Google (en,sw) │ MMS-kik ⃗    │
        │  LLM:  Gemini/GPT (grounded FAQ)          │
        │  TTS:  Azure/Say (en,sw) │ Kikuyu TTS    │
        └──────────────┬───────────────────────────┘
                       ▼
        Python sidecar (FastAPI, optional) :6060
        /asr(kik) /tts(kik) /translate  — HF models only
```

**Rules that guarantee no regression:**
1. **Separate deployable.** `sauti-learn-service/` has its own `package.json`, `.env`, lockfile — nothing is added to the root or gateway dependency trees. Render gets a *second, independent* service (or run it locally in dev).
2. **Flag-gated additive hooks only.** Every change to existing files is wrapped in `SAUTI_ENABLED` (default `false`). Flip the flag to enable, flip back to roll back — no code change needed.
3. **No contract, no ABI, no Firestore schema change.** New Firestore *collection* `sautiProgress` only (additive). No new wallet keys, no relayer usage.
4. **USSD changes are new branches, never edits to existing branches** — menu option `6` appended to the welcome string; invalid-input handling mirrors the existing pattern. Existing branches 1–5 byte-identical when the flag is off.
5. **Failure isolation.** Every Sauti call uses the project's existing `withTimeout()` pattern and a static bilingual FAQ fallback. If Azure/Gemini/sidecar are down, the voter sees a text lesson — the voting flow is never blocked.
6. **Offline demo mode.** With no API keys at all, `/ask` answers from the curated FAQ — the whole demo works on a plane.
7. **PII firewall.** The prompt is system-prompt-locked: *never ask for or accept National ID, PIN, or phone number; refuse political-partisan questions; answer only DeVote process questions.*

---

## 5. Rollout plan (phased, each independently shippable)

| Phase | Deliverable | Risk |
|---|---|---|
| **0** | Research doc + scaffold (`sauti-learn-service/`) in **offline FAQ mode** | None — new folder |
| **1** | Web page `#sauti` in `devote-ui` (text + mic, flag-gated) — uses `/ask` (text LLM) | Low — additive route/component |
| **2** | USSD option 6 → bilingual FAQ by SMS (uses existing `smsClient`) | Low — additive branch, gated |
| **3** | IVR: `<Record>` → ASR → LLM → TTS loop (EN/SW, Azure/AT) | Medium — new callback route, flag-gated |
| **4** | Kikuyu: sidecar + MMS/W2V-BERT ASR + Kikuyu TTS + translation bridge | Medium — separate process, own failure domain |
| **5** | Progress records (`sautiProgress`), analytics, tune prompts with real transcripts (opt-in) | Low |

---

## 6. Cost sketch (indicative — verify on vendor pricing pages, prices drift)

| Item | Approx cost | Mitigation |
|---|---|---|
| Azure STT (en-KE/sw-KE) | ~$1/audio-hour std, 5 h/mo free | cap recording to 20–30 s |
| Gemini/GPT-4o-mini generation | cents per session | short answers, cache identical questions |
| Azure neural TTS | ~$15–16 / 1M chars | cache TTS per FAQ question |
| Kikuyu sidecar (self-host) | ~$10–20/mo small VM, or HF Inference Endpoint | only boot it for Kikuyu requests; cold-cache to pre-generated clips |
| AT Voice | existing usage | same channel, no new number |

---

## 7. Test & rollback story

- `sauti-learn-service/test-sauti.js` — offline FAQ, all 3 languages, `kik` fallback to Swahili.
- Gateway regression: existing `test-ussd.js` flow (menu 1–5) must produce **identical** responses with the flag on and off; add `test-ussd-sauti.js` for option 6.
- UI: header link hidden when `REACT_APP_SAUTI_ENABLED=false`; page renders even if service unreachable.
- Rollback: unset `SAUTI_ENABLED` / remove Render service — voters never notice.

---

## 8. Recommendation (one paragraph)

Build **Sauti Learn as a standalone microservice** (`sauti-learn-service`) speaking **Gemini/GPT-4o-mini** for the conversation, **Azure AI Speech (`en-KE`/`sw-KE`)** for Kenyan English/Swahili ASR+TTS, and a **small self-hosted Python sidecar with Meta MMS `kik` + open Kikuyu TTS** for Gĩkũyũ, wired into the three existing channels through **flag-gated, additive hooks** (web page `#sauti`, USSD option 6, AT Voice `<Record>`/`<Play>` IVR loop). Keep all identity, PIN, wallet, and contract flows exactly as they are. This is the lowest-cost path to full three-language voice support with **zero regression risk** to the live voting system.
