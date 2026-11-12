# Sauti Learn - Gikuyu sidecar (Python)

Hosts open Gikuyu models locally. No commercial speech API offers Kikuyu —
this service is what makes "Sauti speaks Gikuyu" possible.

## 1. Install (once)

```bash
pip install fastapi uvicorn torch transformers soundfile numpy
# CPU-only torch is enough:
pip install torch --index-url https://download.pytorch.org/whl/cpu
```

## 2. Run

```bash
python main.py            # http://127.0.0.1:6060
```

First request per endpoint downloads the model from Hugging Face (cached in
`~/.cache/huggingface`). Startup is ~1-2 min on CPU per model.

## 3. Point the Node service at it

`sauti-learn-service/.env`:

```
SIDECAR_URL=http://127.0.0.1:6060
```

The Node service then routes every Gikuyu request through the bridge:
**Kikuyu speech → (this) ASR → English → Gemini/Groq answer → (this) MT back to
Kikuyu → (this) Kikuyu TTS → audio played to the voter.**

## 4. Models (defaults are the verified best; override with env)

| Task | Default | Alternatives |
|---|---|---|
| ASR | `badrex/w2v-bert-2.0-kikuyu-asr` (0.6B, newest & best) | `FarmerlineML/kikuyu_ASR_3.0`, `MaryWambo/whisper-base-kikuyu` (72M, fastest), `facebook/mms-1b-all` (adapter `kik`). *Note: the Node service tries Gemini audio understanding first, so this big download is only a fallback.* |
| TTS (kik) | **`facebook/mms-tts-kik`** — official Meta VITS Kikuyu voice, only 36 MB | `BrianMwangi/African-Kikuyu-TTS` |
| TTS (sw) | `Benjamin-png/swahili-mms-tts-finetuned` (VITS) | `mussacharles60/swahili-tts-female-voice`, `multilingual-tts/VITS-OpenBible-Swahili` |
| TTS (en) | `facebook/mms-tts-eng` (official) | — |
| Translate | `nickdee96/nllb-200-600m-kikuyu-english` (kik↔en) | `MNG-4/nllb-kikuyu-model`, `EthanKotro/kikuyu-english-translator` (77M, small) |

Env overrides: `KIK_ASR_MODEL`, `KIK_TTS_MODEL`, `KIK_MT_MODEL`.

## 5. Troubleshooting

- If a model's processor API differs, try another repo from the table — the
  sidecar is written to work with both CTC ASR and VITS TTS architectures.
- No GPU? Everything runs on CPU; expect 1-5 s per sentence. That's fine for
  the demo; use a GPU box or Hugging Face Inference Endpoints for production.
