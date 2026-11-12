# Sauti Learn Service 🗣️

Bilingual **voice-learning microservice** for the DeVote Kenya blockchain voting system.
Voters pick **Kiswahili 🇰🇪** or **English 🇬🇧**, ask a question via voice or text, and Sauti answers with clear, friendly audio guidance.

Sauti Learn teaches voters:
- How to register to vote (National ID, wallet link, admin verification)
- The 6 leadership ballots (President, Governor, Senator, Woman Rep, MP, MCA)
- How to vote from simple feature phones via USSD without internet
- Why their vote is 100% secret and safe
- How to verify on-chain ballots with instant SMS receipts
- Voting day checklist and polling hours (6:00 AM - 5:00 PM)
- Official toll-free support (IEBC 0800 221 221, Fraud 1195)

This service is **standalone**: it shares no database or private voter credentials with the voting gateway or UI. It must **never** receive or store National IDs, PINs, or wallet private keys.

---

## 1. Quick Start (Works out-of-the-box with offline FAQ mode)

```bash
cd sauti-learn-service
npm install
npm test                    # runs automated test suite
npm start                   # starts server at http://localhost:5050
```

Offline mode answers English and Kiswahili voter questions instantly from the curated DeVote FAQ even with zero API keys or no internet connection.

---

## 2. Speech & AI Providers

Set keys in `.env`. Providers degrade gracefully:
- **STT (Speech-to-Text):** Groq Whisper (`whisper-large-v3`, fast & accurate for Swahili and English) → Google Cloud STT (`sw-KE` / `en-KE`) → OpenAI Whisper → Gemini Audio → Azure STT (`sw-KE` / `en-KE`).
- **TTS (Text-to-Speech):** ElevenLabs → OpenAI TTS → Gemini TTS (speaks Swahili and English natively via raw PCM) → Groq Orpheus → Azure Neural TTS → Google Cloud TTS → Browser SpeechSynthesis.
- **LLM Brain:** Gemini `gemini-3.8-flash` & Groq `llama-3.3-70b-versatile` (raced in parallel for sub-second responses) → OpenAI `gpt-4o-mini` → Curated Offline FAQ.

---

## 3. API Endpoints

```
GET  /health                       service status + active providers
GET  /languages                    [{code, label, voiceSupported}]
POST /ask        {question,lang}   {answer, lang, provider, suggestions}
POST /voice/ask  {audioBase64,lang} {transcript, answer, lang, tts:{audioBase64,mime}}
POST /tts        {text,lang}       {audioBase64, mime, provider}
GET  /lesson?topic=&lang=          USSD-safe lesson (<=182 chars)
GET  /lesson/full?topic=&lang=     Full lesson (SMS-length)
GET  /topics                       topic list
GET  /suggestions?lang=            suggested questions
```

`lang` ∈ `en` | `sw`.
Rate limit: 60 requests/min per IP. Audio payloads are capped at 30 seconds.
