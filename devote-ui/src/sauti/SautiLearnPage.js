import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SAUTI_LANGS, copyFor } from './sautiContent';

/**
 * Sauti Learn page - multilingual voice teacher (English / Kiswahili / Gikuyu).
 * Talks to the standalone `sauti-learn-service` (REACT_APP_SAUTI_URL).
 *
 * UX features:
 *  - live interim captions while you speak (browser Web Speech API, EN/SW)
 *  - mic level meter so the mic state is always visible
 *  - thinking indicator with elapsed seconds
 *  - text fallback if the browser can't record or the service is down
 */
const SAUTI_URL = (process.env.REACT_APP_SAUTI_URL || 'http://localhost:5050').replace(/\/$/, '');

// BCP-47 locales the browser can recognize live (Kikuyu is not available in any browser).
const LIVE_ASR_LOCALE = { en: 'en-KE', sw: 'sw-KE', kik: null };

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const SautiLearnPage = ({ onNavigate }) => {
  const [lang, setLang] = useState(() => localStorage.getItem('sautiLang') || 'en');
  const [question, setQuestion] = useState('');
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState('idle'); // idle | recording | thinking | speaking | done | error
  const [serviceUp, setServiceUp] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [liveCaptions, setLiveCaptions] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [voiceNote, setVoiceNote] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioElRef = useRef(null);
  const recognitionRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);
  const thinkTimerRef = useRef(null);

  const copy = copyFor(lang);

  useEffect(() => { localStorage.setItem('sautiLang', lang); }, [lang]);

  // Probe the service once; never block the page on it.
  useEffect(() => {
    let alive = true;
    fetch(`${SAUTI_URL}/health`)
      .then((r) => { if (alive) setServiceUp(r.ok); })
      .catch(() => { if (alive) setServiceUp(false); });
    return () => { alive = false; };
  }, []);

  // Recorder + (for EN/SW) live captions availability
  useEffect(() => {
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    setVoiceSupported(typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined');
    setLiveCaptions(Boolean(SR));
  }, []);

  // Thinking timer
  useEffect(() => {
    if (status === 'thinking') {
      setElapsed(0);
      thinkTimerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else if (thinkTimerRef.current) {
      clearInterval(thinkTimerRef.current);
      thinkTimerRef.current = null;
    }
    return () => { if (thinkTimerRef.current) clearInterval(thinkTimerRef.current); };
  }, [status]);

  const speak = useCallback((text, langCode) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = langCode === 'sw' ? 'sw-KE' : langCode === 'kik' ? 'sw-KE' : 'en-KE';
      utter.onend = () => setStatus('done');
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch (_) { /* ignore */ }
  }, []);

  const playAudio = useCallback((audioBase64, mime) => {
    if (!audioBase64) return;
    try {
      setStatus('speaking');
      if (!audioElRef.current) audioElRef.current = new Audio();
      audioElRef.current.onended = () => setStatus('done');
      audioElRef.current.src = `data:${mime || 'audio/mpeg'};base64,${audioBase64}`;
      audioElRef.current.play().catch(() => setStatus('done'));
    } catch (_) { setStatus('done'); }
  }, []);

  const stopAudio = () => {
    try { audioElRef.current?.pause(); } catch (_) {}
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    setStatus('done');
  };

  /* ── text path ─────────────────────────────────────────────────────────── */
  const askText = async (q) => {
    const trimmed = String(q || '').trim();
    if (!trimmed) return;
    setStatus('thinking');
    setTranscript(trimmed);
    try {
      const res = await fetch(`${SAUTI_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, lang }),
      });
      const data = await res.json().catch(() => ({}));
      setAnswer(data.answer || copy.serviceDown);
      setDegraded(Boolean(data.degraded));
      setStatus('done');
      ttsAndSpeak(data.answer, data.lang || lang);
    } catch (_) {
      setAnswer(copy.serviceDown);
      setStatus('error');
    }
  };

  const ttsAndSpeak = async (text, langCode) => {
    if (!text) return;
    try {
      const res = await fetch(`${SAUTI_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang: langCode }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.audioBase64) { playAudio(data.audioBase64, data.mime); return; }
      }
    } catch (_) { /* fall through to browser voice */ }
    // Server voice unavailable (quota/terms/network) - use the device voice.
    setVoiceNote(true);
    speak(text, langCode);
  };

  /* ── live captions + level meter ───────────────────────────────────────── */
  const startLiveCaptions = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const locale = LIVE_ASR_LOCALE[lang];
    if (!SR || !locale) return; // Kikuyu: no browser support - meter only
    try {
      const rec = new SR();
      rec.lang = locale;
      rec.interimResults = true;
      rec.continuous = true;
      let finalText = '';
      rec.onresult = (e) => {
        let live = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const chunk = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += `${chunk} `;
          else live += chunk;
        }
        setInterim(live);
        if (finalText) setTranscript(finalText.trim());
      };
      rec.onerror = () => { /* keep recording audio; captions are a bonus */ };
      recognitionRef.current = rec;
      rec.start();
    } catch (_) { /* captions unavailable */ }
  };

  const startLevelMeter = (stream) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        rafRef.current = requestAnimationFrame(tick);
      };
      audioCtxRef.current = ctx;
      tick();
    } catch (_) { /* meter is a nice-to-have */ }
  };

  const stopExtras = () => {
    try { recognitionRef.current?.stop(); } catch (_) {}
    recognitionRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { audioCtxRef.current?.close(); } catch (_) {}
    audioCtxRef.current = null;
    setLevel(0);
    setInterim('');
  };

  /* ── voice path ────────────────────────────────────────────────────────── */
  const startRecording = async () => {
    if (!voiceSupported) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stopExtras();
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setStatus('thinking');
        try {
          const audioBase64 = await blobToBase64(blob);
          const res = await fetch(`${SAUTI_URL}/voice/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64, lang }),
          });
          const data = await res.json().catch(() => ({}));
          if (data.transcript) setTranscript(data.transcript);
          setAnswer(data.answer || copy.serviceDown);
          setDegraded(Boolean(data.degraded));
          setStatus('done');
          if (data.tts?.audioBase64) playAudio(data.tts.audioBase64, data.tts.mime);
          else speak(data.answer || '', data.lang || lang);
        } catch (_) {
          setAnswer(copy.serviceDown);
          setStatus('error');
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      startLiveCaptions();
      startLevelMeter(stream);
      setStatus('recording');
    } catch (_) {
      setVoiceSupported(false);
      setStatus('idle');
    }
  };

  const stopRecording = () => {
    try { mediaRecorderRef.current?.stop(); } catch (_) { /* ignore */ }
  };

  /* ── render ────────────────────────────────────────────────────────────── */
  const statusLabel =
    status === 'recording' ? copy.micRecording :
    status === 'thinking' ? `${copy.thinking} (${elapsed}s)` :
    status === 'speaking' ? '🔊 Sauti is speaking…' : '';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-dark-green-gradient text-white">
        <div className="max-w-5xl mx-auto px-4 py-10">
          <h1 className="text-3xl sm:text-4xl font-bold">🔊 {copy.title}</h1>
          <p className="mt-2 text-dark-green-100 max-w-2xl">{copy.subtitle}</p>

          {/* Language chips */}
          <div className="mt-6 flex flex-wrap gap-2">
            {SAUTI_LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  lang === l.code ? 'bg-white text-dark-green-700 shadow' : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!serviceUp && (
        <div className="max-w-5xl mx-auto px-4 mt-4">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
            {copy.serviceDown}
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-8 grid gap-6 lg:grid-cols-3">
        {/* Ask panel */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-soft p-6">
          <div className="flex flex-col items-center gap-4">
            {/* Mic + level ring */}
            <div className="relative">
              <div
                className="absolute inset-0 rounded-full transition-transform"
                style={{
                  transform: `scale(${1 + level * 0.6})`,
                  opacity: status === 'recording' ? 0.25 + level * 0.5 : 0,
                  background: 'radial-gradient(circle, #ef4444 0%, transparent 70%)',
                }}
              />
              <button
                onClick={() => (status === 'recording' ? stopRecording() : startRecording())}
                disabled={!voiceSupported || !serviceUp}
                className={`relative w-28 h-28 rounded-full flex items-center justify-center text-4xl shadow-lg transition-transform ${
                  status === 'recording' ? 'bg-red-500 text-white' : 'bg-dark-green-500 text-white hover:scale-105'
                } ${!voiceSupported || !serviceUp ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={status === 'recording' ? copy.micRecording : copy.micIdle}
              >
                {status === 'recording' ? '⏹' : '🎤'}
              </button>
            </div>

            {/* Level bars */}
            <div className="flex items-end gap-1 h-6" aria-hidden>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="w-1.5 rounded-full bg-dark-green-500 transition-all duration-75"
                  style={{ height: `${6 + (status === 'recording' ? level * 20 * (1 - Math.abs(i - 3) / 6) : 0)}px` }}
                />
              ))}
            </div>

            <p className="text-sm text-gray-500">
              {status === 'recording' ? copy.micRecording : voiceSupported ? copy.micIdle : copy.textOnlyMode}
            </p>
            {status === 'recording' && !liveCaptions && lang === 'kik' && (
              <p className="text-xs text-amber-600">Gĩkũyũ has no live captions in any browser — keep speaking, transcription happens on the server.</p>
            )}
          </div>

          {/* Status line */}
          {statusLabel && (
            <div className="mt-4 text-center">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-600">
                <span className="w-2 h-2 rounded-full bg-dark-green-500 animate-pulse" />
                {statusLabel}
              </span>
            </div>
          )}

          {/* Live interim captions */}
          {(status === 'recording' || interim) && (
            <div className="mt-4 border border-dashed border-gray-300 rounded-xl p-3 min-h-[3rem]">
              <p className="text-xs uppercase tracking-wide text-gray-400">Live captions</p>
              <p className="text-gray-700">
                {transcript && <span>{transcript} </span>}
                <span className="text-gray-400 italic">{interim}</span>
                {!transcript && !interim && <span className="text-gray-400">…</span>}
              </p>
            </div>
          )}

          {/* Text fallback */}
          <form
            className="mt-6 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); askText(question); }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={copy.askPlaceholder}
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dark-green-500"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-dark-green-600 text-white rounded-lg text-sm font-medium hover:bg-dark-green-700 transition-colors"
            >
              ➤
            </button>
          </form>

          {/* Transcript */}
          {transcript && status !== 'recording' && (
            <div className="mt-6">
              <p className="text-xs uppercase tracking-wide text-gray-400">{copy.transcriptLabel}</p>
              <p className="text-gray-700 italic">“{transcript}”</p>
            </div>
          )}

          {/* Answer */}
          {answer && (
            <div className="mt-6 bg-dark-green-50 border border-dark-green-100 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-dark-green-600">{copy.answerLabel}</p>
                  <p className="text-gray-800 mt-1 whitespace-pre-line">{answer}</p>
                  {degraded && <p className="text-xs text-amber-600 mt-2">{copy.degradedKikuyu}</p>}
                  {voiceNote && (
                    <p className="text-xs text-gray-500 mt-2">
                      Server voice busy — switched to your device voice
                      {lang === 'kik' ? ' (device voices do not cover Gĩkũyũ yet — the Python sidecar will)' : ''}.
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => ttsAndSpeak(answer, lang)}
                    title={copy.answerLabel}
                    className="px-3 py-1.5 bg-dark-green-600 text-white rounded-lg text-xs"
                  >
                    🔊
                  </button>
                  <button
                    onClick={stopAudio}
                    title={copy.stopSpeaking}
                    className="px-3 py-1.5 bg-gray-200 rounded-lg text-xs"
                  >
                    ⏹
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Suggestions */}
          {copy.suggestions.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {copy.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => { setQuestion(s); askText(s); }}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lessons + privacy + CTAs */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-soft p-6">
            <h3 className="font-semibold text-gray-800">{copy.lessonsTitle}</h3>
            <ul className="mt-3 space-y-2">
              {copy.lessons.map((lesson) => (
                <li key={lesson.id}>
                  <button
                    onClick={async () => {
                      setStatus('thinking');
                      try {
                        const res = await fetch(`${SAUTI_URL}/lesson/full?topic=${lesson.id}&lang=${lang === 'kik' ? 'sw' : lang}`);
                        const text = await res.text();
                        setAnswer(text || copy.serviceDown);
                        setTranscript('');
                        setStatus('done');
                        ttsAndSpeak(text, lang);
                      } catch (_) {
                        setAnswer(copy.serviceDown);
                        setStatus('error');
                      }
                    }}
                    className="text-left w-full px-3 py-2 rounded-lg hover:bg-dark-green-50 text-sm text-gray-700 transition-colors"
                  >
                    📘 {lesson.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-2xl shadow-soft p-6 space-y-3">
            <button
              onClick={() => onNavigate && onNavigate('registration')}
              className="w-full px-4 py-2.5 bg-dark-green-600 text-white rounded-lg text-sm font-medium hover:bg-dark-green-700 transition-colors"
            >
              {copy.goVote}
            </button>
            <button
              onClick={() => onNavigate && onNavigate('vote')}
              className="w-full px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              {copy.goVote2}
            </button>
          </div>

          <div className="bg-gray-100 rounded-2xl p-4 text-xs text-gray-500">
            🔒 {copy.privacy}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SautiLearnPage;
