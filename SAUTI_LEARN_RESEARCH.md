# Sauti Learn — Bilingual Voter Voice Guide (Research & Architecture)

> **Sauti Learn** (from *sauti* = "voice" in Kiswahili) is the bilingual **voice-learning guide** for the
> DeVote Kenya blockchain voting system. A voter interacts with it in **Kiswahili 🇰🇪** or
> **English 🇬🇧**, asking questions about voter registration, the 6 ballots, voting without internet via USSD,
> vote secrecy, and blockchain SMS receipt verification.

---

## 1. Production Scope & Decision (Bilingual: Kiswahili & English)

Following voter research across Kenyan demographics:
1. **Kiswahili** and **English** are Kenya's two official constitutional languages, universally spoken across all 47 counties.
2. Regional/vernacular languages (such as Kikuyu) were tested with local open-source models, but lacked reliable commercial speech APIs and added substantial latency and compute overhead without universal coverage.
3. **Decision:** Deep focus on **Plain Kenyan English** and **Kiswahili Rahisi**, ensuring clear, jargon-free voter communication that works with zero lag across web and phone channels.

---

## 2. Speech & Language Stack

### 2.1 Speech-to-Text (ASR)
- **Groq Whisper (`whisper-large-v3`):** High-speed, multilingual ASR with exceptional accuracy on Kenyan English and Kiswahili.
- **Google Cloud Speech-to-Text:** Native `sw-KE` and `en-KE` BCP-47 recognition.
- **Browser Web Speech API:** On-device `sw-KE` and `en-KE` real-time captioning in Chromium browsers.
- **OpenAI Whisper & Azure Speech:** Reliable failover providers.

### 2.2 Text-to-Speech (TTS)
- **Google Gemini TTS:** Direct audio modality generation for both English and Swahili text.
- **OpenAI TTS:** Natural conversational civic tone.
- **ElevenLabs:** Studio-grade natural narration.
- **Browser SpeechSynthesis:** 100% offline fallback in all modern browsers.

### 2.3 LLM Civic Brain
- **Google Gemini (`gemini-3.8-flash`) & Groq (`llama-3.3-70b-versatile`):** Raced in parallel for sub-second responses.
- **Curated DeVote Knowledge Grounding:** Prevents hallucination, strictly answers only approved civic voting topics.
- **Guaranteed Offline FAQ Mode:** Zero downtime even if all cloud keys or internet connections are down.

---

## 3. Voter Experience Design

1. **One-Tap Voice & Text:**
   - Giant, accessible microphone with live waveform visualizer.
   - Live speech captions displayed in real time as the voter speaks.
   - Spoken audio playback + text answer card + replay/stop buttons.
2. **Interactive Quick Lessons:**
   - 7 step-by-step voter guide cards (Registration, 6 Ballots, USSD Voting, Vote Secrecy, SMS Receipts, Voting Day, Free Help).
   - "Listen to Lesson" button reading each lesson aloud.
3. **Action Shortcuts:**
   - Direct navigation to Voter Registration and Ballot Cast pages.
   - Toll-free hotline assistance (IEBC 0800 221 221, Fraud line 1195).
