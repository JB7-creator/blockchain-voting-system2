# Sauti Learn Service 🗣️

Multilingual **voice-learning module** for the DeVote Kenya blockchain voting system.
A voter picks **English / Kiswahili / Gĩkũyũ**, speaks a question, and Sauti answers in the
same language with audio — teaching them how to register, what the 6 ballots are, how their
vote lands on Ethereum Sepolia, and how to get help.

This service is **standalone**: it shares no dependencies, no database and no credentials with
the voting gateway (`ussd-gateway/`) or the UI (`devote-ui/`). The only things it ever receives
are *questions* and *audio*. It must **never** receive National IDs, PINs, or wallet addresses.

---

## 1. Quick start (works with zero API keys — offline FAQ mode)

```bash
cd sauti-learn-service
npm install
cp .env.example .env        # optional — leave blank for offline mode
npm start                   # http://localhost:5050
npm test                    # smoke test (needs no keys)
```

Offline mode answers English/Kiswahili questions from a curated DeVote FAQ. Gĩkũyũ audio
requires the sidecar (section 4); without it Gĩkũyũ questions fall back to Kiswahili text
(declared gracefully — no silent failures).

## 2. Providers — verified live configuration (Nov 2026)

Set keys in `.env`; every provider is optional and failures degrade instead of throwing.
The LLM chain is tried **in order**: Gemini → Groq → OpenCode → OpenAI → offline FAQ.

| Capability | English | Kiswahili | Gĩkũyũ |
|---|---|---|---|
| Speech-to-text | Groq `whisper-large-v3` · Google STT `en-KE` · Whisper API · Azure STT `en-KE` | Groq Whisper (`sw`) · Google `sw-KE` | Python sidecar only |
| Text-to-speech | Gemini TTS `gemini-3.8-flash-tts` · Azure · Groq Orpheus | Gemini TTS (speaks Swahili text natively) | sidecar VITS Kikuyu TTS |
| Brain | Gemini `gemini-3.8-flash` · Groq `openai/gpt-oss-120b` | same (both speak Swahili well) | same, via translation bridge |
| IVR audio | Africa's Talking `<Say>` (Kenyan EN/SW) is spoken directly by the gateway | same | sidecar MP3 served to `<Play>` |

**Model IDs change often — refresh them anytime with:**

```bash
node list-models.js          # prints live Gemini + Groq model lists for your keys
```

Notes from live testing:
- Gemini `gemini-2.0-flash` / `gemini-2.5-flash` are **retired** on this account (404) — use `gemini-3.8-flash`.
- Gemini 3.x are *thinking* models: the service sends `thinkingBudget: 0` or answers get clipped.
- Gemini 503 "high demand" is common — the service falls through to `gemini-3.6-flash`, then Groq.
- OpenCode (`OPENCODE_API_KEY` + `OPENCODE_MODEL`) is OpenAI-compatible; set `OPENCODE_MODEL` from
  `curl https://opencode.ai/zen/v1/models -H "Authorization: Bearer <key>"` — it is only called
  when Gemini and Groq both decline, as requested.

## 3. API

```
GET  /health                       status + active providers
GET  /languages                    [{code,label,voiceSupported}]
POST /ask        {question,lang}   {answer,lang,provider,suggestions}
POST /voice/ask  {audioBase64,lang} {transcript,answer,lang,tts:{audioBase64,mime}}
POST /tts        {text,lang}       {audioBase64,mime,provider}
GET  /lesson?topic=&lang=          USSD-safe lesson (<=180 chars)
GET  /lesson/full?topic=&lang=     SMS-length lesson
GET  /topics                       lesson catalogue
GET  /suggestions?lang=            follow-up prompts
```

`lang` ∈ `en` | `sw` | `kik`. Unknown audio/format/keys never produce a 5xx from `/ask`:
the FAQ fallback guarantees an answer. Rate limit: 60 req/min/IP. Audio > `SAUTI_MAX_AUDIO_SECONDS`
(30s) is rejected with 413.

## 4. Gĩkũyũ sidecar (Python FastAPI — separate failure domain)

No commercial API serves Gĩkũyũ, so run one small process that hosts open models:

```bash
# sauti-sidecar/ (create as its own venv)
pip install fastapi uvicorn transformers torch soundfile
```

```python
# sauti-sidecar/main.py (sketch — prototype, tune for your hardware)
from fastapi import FastAPI
from pydantic import BaseModel
import base64, io, torch, soundfile as sf

app = FastAPI()

class AsrIn(BaseModel):
    audioBase64: str
    lang: str = "kik"

class TtsIn(BaseModel):
    text: str
    lang: str = "kik"

class TrIn(BaseModel):
    text: str; frm: str; to: str

_asr = None
def asr_model():
    global _asr
    if _asr is None:
        from transformers import Wav2Vec2ForCTC, AutoProcessor
        name = "badrex/w2v-bert-2.0-kikuyu-asr"   # or: facebook/mms-1b-all (load_adapter("kik"))
        _asr = (Wav2Vec2ForCTC.from_pretrained(name), AutoProcessor.from_pretrained(name))
    return _asr

@app.post("/asr")
def asr(body: AsrIn):
    wav = torch.tensor(sf.read(io.BytesIO(base64.b64decode(body.audioBase64)))[0]).float()
    model, proc = asr_model()
    with torch.no_grad():
        ids = torch.argmax(model(proc(wav, sampling_rate=16000, return_tensors="pt")).logits, dim=-1)[0]
    return {"text": proc.batch_decode(ids)}

_tts = None
def tts_model():
    global _tts
    if _tts is None:
        from transformers import VitsModel, AutoTokenizer          # works for VITS-style repos
        name = "BrianMwangi/African-Kikuyu-TTS"                    # or gateremark/kikuyu-tts-v1
        _tts = (VitsModel.from_pretrained(name), AutoTokenizer.from_pretrained(name))
    return _tts

@app.post("/tts")
def tts(body: TtsIn):
    model, tok = tts_model()
    inputs = tok(body.text, return_tensors="pt")
    with torch.no_grad():
        waveform = model(**inputs).waveform
    buf = io.BytesIO(); sf.write(buf, waveform[0].numpy(), model.config.sampling_rate, format="WAV")
    return {"audioBase64": base64.b64encode(buf.getvalue()).decode(), "mime": "audio/wav"}

_tr = None
def tr_model():
    global _tr
    if _tr is None:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        name = "nickdee96/nllb-200-600m-kikuyu-english"            # kik<->en; swap for kik<->sw if published
        _tr = (AutoModelForSeq2SeqLM.from_pretrained(name), AutoTokenizer.from_pretrained(name))
    return _tr

@app.post("/translate")
def translate(body: TrIn):
    model, tok = tr_model()
    tok.src_lang = body.frm
    out = model.generate(**tok(body.text, return_tensors="pt", padding=True), forced_bos_token_id=tok.convert_tokens_to_ids(body.to))
    return {"text": tok.batch_decode(out, skip_special_tokens=True)[0]}
```

Then in `.env`: `SIDECAR_URL=http://localhost:6060`

> **Model choices verified on Hugging Face (Nov 2026):** Kikuyu ASR — `badrex/w2v-bert-2.0-kikuyu-asr`,
> `FarmerlineML/kikuyu_ASR_3.0`, `DeKUT-DSAIL/tunuh-whisper-base-kikuyu-v1`, or **Meta MMS**
> `facebook/mms-1b-all` (load the `kik` adapter — Gikuyu is in the official MMS coverage table for
> ASR **and** TTS). Kikuyu TTS — `BrianMwangi/African-Kikuyu-TTS`, `gateremark/kikuyu-tts-v1`.
> Translation — `nickdee96/nllb-200-600m-kikuyu-english`, `MNG-4/nllb-kikuyu-model`,
> `gateremark/kikuyu_translategemma_12b_merged`. Corpus (for fine-tuning) —
> `michsethowusu/kikuyu-swahili-sentence-pairs` (220k), `DigiGreen`/`CGIAR KikuyuASR sets.

## 5. Embedding in the rest of the system

- **Web (`devote-ui`)** → page `#sauti` calls `POST /voice/ask` with recorded audio.
- **USSD gateway** → option **6 / Sauti** in the menu calls `GET /lesson` (SMS fallback uses `/lesson/full`).
- **Voice IVR (Africa's Talking)** → `<Record>` posts the recording URL; the gateway downloads it and calls `/voice/ask`; answers are spoken with `<Say>` (EN/SW) or `<Play>` (Gĩkũyũ MP3 from `/tts`).

Every hook in the existing services is behind an env flag (`SAUTI_ENABLED`, default **off**)
so the live voting system is untouched until you explicitly opt in.

## 6. Privacy (Kenya DPA 2019)

Voice is sensitive personal data. Default posture: transcribe in memory, **never persist audio or
transcripts**, never accept ID/PIN/phone from the assistant, and prefer in-region or self-hosted
providers for production. Keep `SAUTI_MAX_AUDIO_SECONDS=30`.

## 7. Deploy

Render (`render.yaml` snippet):

```yaml
  - type: web
    name: sauti-learn-service
    env: node
    plan: free          # upgrade: ML-free endpoints need RAM, not free tier
    rootDir: sauti-learn-service
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: PORT
        value: 5050
```

Rollback = remove the service and unset `SAUTI_ENABLED` in the gateway. Nothing else changes.
