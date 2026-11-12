"""
Sauti Learn - Gikuyu sidecar (Python / FastAPI)
================================================
The ONLY piece that can speak Gikuyu: no commercial API offers it, so this
process hosts open models locally and exposes them to the Node service
(sauti-learn-service) over HTTP.

Routes
  POST /asr        {audioBase64, lang}       -> {text}      Kikuyu speech -> text
  POST /tts        {text, lang}              -> {audioBase64, mime}   Kikuyu text -> speech
  POST /translate  {text, from, to}          -> {text}      kik <-> en bridge
  GET  /health                                 -> {status, models}

First request per endpoint downloads the model from Hugging Face (cached after).
All model IDs are overridable via env vars.

Verified models (Hugging Face, Nov 2026):
  ASR   badrex/w2v-bert-2.0-kikuyu-asr (0.6B, newest, best) | FarmerlineML/kikuyu_ASR_3.0
        MaryWambo/whisper-base-kikuyu (72M, fastest) | facebook/mms-1b-all (adapter "kik")
  TTS   BrianMwangi/African-Kikuyu-TTS (VITS) | gateremark/kikuyu-tts-v1 | MMS adapter "kik"
  MT    nickdee96/nllb-200-600m-kikuyu-english (kik<->en, NLLB-200 based)
"""

import base64
import io
import os
import sys
import tempfile
import traceback

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Sauti Learn Gikuyu Sidecar")

KIK_ASR_MODEL = os.getenv("KIK_ASR_MODEL", "badrex/w2v-bert-2.0-kikuyu-asr")
KIK_TTS_MODEL = os.getenv("KIK_TTS_MODEL", "facebook/mms-tts-kik")   # official Meta VITS model, 36MB
SWA_TTS_MODEL = os.getenv("SWA_TTS_MODEL", "Benjamin-png/swahili-mms-tts-finetuned")
ENG_TTS_MODEL = os.getenv("ENG_TTS_MODEL", "facebook/mms-tts-eng")  # official Meta English VITS
KIK_MT_MODEL = os.getenv("KIK_MT_MODEL", "nickdee96/nllb-200-600m-kikuyu-english")

_asr = None
_tts = None        # kik
_swa_tts = None    # sw
_eng_tts = None    # en
_mt = None


# ── ASR ────────────────────────────────────────────────────────────────────
def load_asr():
    global _asr
    if _asr is None:
        import torch
        from transformers import AutoModelForCTC, AutoProcessor

        name = KIK_ASR_MODEL
        print(f"[sidecar] loading ASR {name} ...", flush=True)
        if name.startswith("facebook/mms-1b-all"):
            # MMS needs the language adapter loaded for "kik"
            processor = AutoProcessor.from_pretrained(name)
            processor.tokenizer.set_target_lang("kik")
            model = AutoModelForCTC.from_pretrained(name)
            model.load_adapter("kik")
        else:
            processor = AutoProcessor.from_pretrained(name)
            model = AutoModelForCTC.from_pretrained(name)
        model.eval()
        _asr = (model, processor, torch)
        print("[sidecar] ASR ready", flush=True)
    return _asr


@app.post("/asr")
def asr(body: dict):
    try:
        audio_b64 = body.get("audioBase64", "")
        if not audio_b64:
            return {"text": ""}
        import soundfile as sf

        model, processor, torch = load_asr()
        audio, sr = sf.read(io.BytesIO(base64.b64decode(audio_b64)), dtype="float32")
        # Resample to 16k if needed
        if sr != 16000:
            import numpy as np
            try:
                import scipy.signal as sps
                audio = sps.resample_poly(audio, 16000, sr).astype("float32")
            except Exception:
                audio = np.interp(
                    np.linspace(0, len(audio), int(len(audio) * 16000 / sr), endpoint=False),
                    np.arange(len(audio)), audio
                ).astype("float32")
        if audio.ndim > 1:
            audio = audio.mean(axis=1)

        inputs = processor(audio, sampling_rate=16000, return_tensors="pt")
        with torch.no_grad():
            logits = model(**inputs).logits
        ids = torch.argmax(logits, dim=-1)[0]
        text = processor.batch_decode(ids)
        return {"text": text}
    except Exception as e:
        traceback.print_exc()
        return {"text": "", "error": str(e)}


# ── TTS ────────────────────────────────────────────────────────────────────
def load_tts():
    global _tts
    if _tts is None:
        print(f"[sidecar] loading TTS {KIK_TTS_MODEL} ...", flush=True)
        _tts = load_vits(KIK_TTS_MODEL)
        print("[sidecar] TTS ready", flush=True)
    return _tts


class TtsIn(BaseModel):
    text: str
    lang: str = "kik"
    model: str = ""          # optional per-request override (A/B test voices)


def load_vits(name):
    """Load a standalone VITS repo (MMS-TTS per-language models and fine-tunes)."""
    from transformers import VitsModel, VitsTokenizer

    model = VitsModel.from_pretrained(name)
    processor = VitsTokenizer.from_pretrained(name)
    model.eval()
    return model, processor


def synth_vits(model, processor, text):
    import io

    import soundfile as sf
    import torch

    inputs = processor(text=text, return_tensors="pt")
    with torch.no_grad():
        waveform = model(**inputs).waveform[0].cpu().numpy()
    sr = getattr(model.config, "sampling_rate", 16000)
    buf = io.BytesIO()
    sf.write(buf, waveform, sr, format="WAV")
    return base64.b64encode(buf.getvalue()).decode(), "audio/wav"


def load_swa():
    global _swa_tts
    if _swa_tts is None:
        print(f"[sidecar] loading SWA TTS {SWA_TTS_MODEL} ...", flush=True)
        _swa_tts = load_vits(SWA_TTS_MODEL)
        print("[sidecar] SWA TTS ready", flush=True)
    return _swa_tts


def load_eng():
    global _eng_tts
    if _eng_tts is None:
        print(f"[sidecar] loading ENG TTS {ENG_TTS_MODEL} ...", flush=True)
        _eng_tts = load_vits(ENG_TTS_MODEL)
        print("[sidecar] ENG TTS ready", flush=True)
    return _eng_tts


@app.post("/tts")
def tts(body: TtsIn):
    try:
        # Optional per-request model override so voices can be A/B tested
        # without restarting the sidecar: {"text": "...", "lang": "kik", "model": "..."}
        override = None
        if isinstance(body, dict):
            override = body.get("model")
        else:
            override = getattr(body, "model", None)

        if override:
            model, processor = load_vits(override)
            audio, mime = synth_vits(model, processor, body.text)
            return {"audioBase64": audio, "mime": mime, "model": override}

        lang = (body.lang or "kik").lower()
        if lang == "sw":
            audio, mime = synth_vits(*load_swa(), body.text)
            return {"audioBase64": audio, "mime": mime, "model": SWA_TTS_MODEL}
        if lang == "en":
            audio, mime = synth_vits(*load_eng(), body.text)
            return {"audioBase64": audio, "mime": mime, "model": ENG_TTS_MODEL}
        audio, mime = synth_vits(*load_tts(), body.text)
        return {"audioBase64": audio, "mime": mime, "model": KIK_TTS_MODEL}
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e), "audioBase64": None}


# ── Translation bridge kik <-> en ──────────────────────────────────────────
def load_mt():
    global _mt
    if _mt is None:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        name = KIK_MT_MODEL
        print(f"[sidecar] loading MT {name} ...", flush=True)
        tok = AutoTokenizer.from_pretrained(name)
        model = AutoModelForSeq2SeqLM.from_pretrained(name)
        _mt = (model, tok)
        print("[sidecar] MT ready", flush=True)
    return _mt


class TrIn(BaseModel):
    text: str
    frm: str = "kik"
    to: str = "en"


@app.post("/translate")
def translate(body: TrIn):
    try:
        model, tok = load_mt()
        # NLLB-style fine-tunes accept BCP-47-ish language codes
        src = {"kik": "kik_Latn", "en": "eng_Latn", "sw": "swh_Latn"}.get(body.frm, body.frm)
        tgt = {"kik": "kik_Latn", "en": "eng_Latn", "sw": "swh_Latn"}.get(body.to, body.to)
        try:
            tok.src_lang = src
        except Exception:
            pass
        enc = tok(body.text, return_tensors="pt", padding=True, truncation=True, max_length=256)
        forced = None
        try:
            forced = tok.convert_tokens_to_ids(tgt)
        except Exception:
            forced = None
        import torch

        with torch.no_grad():
            gen = model.generate(
                **enc,
                forced_bos_token_id=forced,
                max_new_tokens=128,
                num_beams=2,
            )
        out = tok.batch_decode(gen, skip_special_tokens=True)
        return {"text": out[0]}
    except Exception as e:
        traceback.print_exc()
        return {"text": "", "error": str(e)}


@app.get("/health")
def health():
    return {
        "status": "Sauti Gikuyu sidecar up",
        "models": {"asr": KIK_ASR_MODEL, "tts": KIK_TTS_MODEL, "mt": KIK_MT_MODEL},
        "loaded": {"asr": _asr is not None, "tts": _tts is not None, "mt": _mt is not None},
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 6060))
    print(f"[sidecar] starting on http://127.0.0.1:{port}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
