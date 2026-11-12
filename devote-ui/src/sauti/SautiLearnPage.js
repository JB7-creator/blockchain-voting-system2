import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SAUTI_LANGS, copyFor } from './sautiContent';

/**
 * Sauti Learn - Bilingual Voter Education Voice Guide (Kiswahili & English)
 * Connects to the standalone `sauti-learn-service` (REACT_APP_SAUTI_URL).
 *
 * Designed for Kenyan voters:
 *  - Native browser Web Speech API live captions (sw-KE / en-KE)
 *  - Animated audio waveform and microphone level visualizer
 *  - Spoken answers via server TTS (Gemini/Groq/OpenAI) with fallback to device voice
 *  - Interactive quick lessons with one-click "Listen to Lesson" audio
 *  - Resilient local FAQ fallback if the microservice is offline
 */

const SAUTI_URL = (process.env.REACT_APP_SAUTI_URL || 'http://localhost:5050').replace(/\/$/, '');

// BCP-47 locales for Chrome, Edge, Safari Web Speech recognition
const LIVE_ASR_LOCALE = {
  sw: 'sw-KE',
  en: 'en-KE',
};

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const SautiLearnPage = ({ onNavigate }) => {
  const [lang, setLang] = useState(() => localStorage.getItem('sautiLang') || 'sw');
  const [question, setQuestion] = useState('');
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState('idle'); // idle | recording | thinking | speaking | done | error
  const [serviceUp, setServiceUp] = useState(true);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState('qa'); // 'qa' | 'lessons'

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioElRef = useRef(null);
  const recognitionRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);
  const thinkTimerRef = useRef(null);

  const copy = copyFor(lang);

  useEffect(() => {
    localStorage.setItem('sautiLang', lang);
  }, [lang]);

  // Check service availability
  useEffect(() => {
    let alive = true;
    fetch(`${SAUTI_URL}/health`)
      .then((r) => {
        if (alive) setServiceUp(r.ok);
      })
      .catch(() => {
        if (alive) setServiceUp(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Web Speech & MediaRecorder capability check
  useEffect(() => {
    const hasMedia = typeof window !== 'undefined' && navigator.mediaDevices && typeof window.MediaRecorder !== 'undefined';
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    setVoiceSupported(Boolean(hasMedia));
  }, []);

  // Timer for active recording / thinking
  useEffect(() => {
    if (status === 'recording' || status === 'thinking') {
      setElapsed(0);
      thinkTimerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else if (thinkTimerRef.current) {
      clearInterval(thinkTimerRef.current);
      thinkTimerRef.current = null;
    }
    return () => {
      if (thinkTimerRef.current) clearInterval(thinkTimerRef.current);
    };
  }, [status]);

  // Device voice speech synthesis fallback
  const speakWithDeviceVoice = useCallback((text, langCode) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = langCode === 'sw' ? 'sw-KE' : 'en-KE';
      utter.rate = 0.95; // slightly slower cadence for clearer civic comprehension
      utter.onend = () => setStatus('done');
      utter.onerror = () => setStatus('done');
      setStatus('speaking');
      window.speechSynthesis.speak(utter);
    } catch (_) {
      setStatus('done');
    }
  }, []);

  // Play audio buffer returned from server
  const playAudio = useCallback((audioBase64, mime) => {
    if (!audioBase64) return;
    try {
      setStatus('speaking');
      if (!audioElRef.current) audioElRef.current = new Audio();
      audioElRef.current.onended = () => setStatus('done');
      audioElRef.current.onerror = () => setStatus('done');
      audioElRef.current.src = `data:${mime || 'audio/mpeg'};base64,${audioBase64}`;
      audioElRef.current.play().catch(() => {
        setStatus('done');
      });
    } catch (_) {
      setStatus('done');
    }
  }, []);

  const stopAudio = () => {
    try {
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current.currentTime = 0;
      }
    } catch (_) {}
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setStatus('done');
  };

  // Text-to-Speech synthesis pipeline
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
        if (data.audioBase64) {
          playAudio(data.audioBase64, data.mime);
          return;
        }
      }
    } catch (_) {
      // Fall through to device voice
    }
    speakWithDeviceVoice(text, langCode);
  };

  // Ask question via text
  const askText = async (q) => {
    const trimmed = String(q || '').trim();
    if (!trimmed) return;
    stopAudio();
    setStatus('thinking');
    setTranscript(trimmed);
    setQuestion('');

    try {
      const res = await fetch(`${SAUTI_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, lang }),
      });
      const data = await res.json().catch(() => ({}));
      const resolvedAnswer = data.answer || getLocalFallbackAnswer(trimmed, lang);
      setAnswer(resolvedAnswer);
      setStatus('done');
      ttsAndSpeak(resolvedAnswer, data.lang || lang);
    } catch (_) {
      // Offline fallback: answer directly from curated lessons
      const fallback = getLocalFallbackAnswer(trimmed, lang);
      setAnswer(fallback);
      setStatus('done');
      ttsAndSpeak(fallback, lang);
    }
  };

  // Local fallback answer if backend is completely unreachable
  const getLocalFallbackAnswer = (q, l) => {
    const qLower = q.toLowerCase();
    const c = copyFor(l);
    if (qLower.includes('usajili') || qLower.includes('jisajili') || qLower.includes('register')) {
      return c.lessons.find((item) => item.id === 'register')?.content;
    }
    if (qLower.includes('nafasi') || qLower.includes('kura 6') || qLower.includes('ballot') || qLower.includes('position')) {
      return c.lessons.find((item) => item.id === 'positions')?.content;
    }
    if (qLower.includes('siri') || qLower.includes('secret') || qLower.includes('private')) {
      return c.lessons.find((item) => item.id === 'secret')?.content;
    }
    if (qLower.includes('ussd') || qLower.includes('mtandao') || qLower.includes('simu ndogo') || qLower.includes('internet')) {
      return c.lessons.find((item) => item.id === 'ussd')?.content;
    }
    if (qLower.includes('hesabiwa') || qLower.includes('risiti') || qLower.includes('counted') || qLower.includes('verify')) {
      return c.lessons.find((item) => item.id === 'verify')?.content;
    }
    if (qLower.includes('siku') || qLower.includes('saa') || qLower.includes('day') || qLower.includes('time')) {
      return c.lessons.find((item) => item.id === 'day')?.content;
    }
    return c.lessons.find((item) => item.id === 'help')?.content || c.subtitle;
  };

  // Start live captions via Web Speech API
  const startLiveCaptions = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const locale = LIVE_ASR_LOCALE[lang] || 'sw-KE';
    if (!SR) return;

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
      rec.onerror = () => {};
      recognitionRef.current = rec;
      rec.start();
    } catch (_) {}
  };

  // Audio level meter
  const startLevelMeter = (stream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        rafRef.current = requestAnimationFrame(tick);
      };
      audioCtxRef.current = ctx;
      tick();
    } catch (_) {}
  };

  const stopExtras = () => {
    try {
      recognitionRef.current?.stop();
    } catch (_) {}
    recognitionRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try {
      audioCtxRef.current?.close();
    } catch (_) {}
    audioCtxRef.current = null;
    setLevel(0);
    setInterim('');
  };

  // Voice recording workflow
  const startRecording = async () => {
    if (!voiceSupported) return;
    stopAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

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
          const finalAnswer = data.answer || copy.serviceDown;
          setAnswer(finalAnswer);
          setStatus('done');

          if (data.tts?.audioBase64) {
            playAudio(data.tts.audioBase64, data.tts.mime);
          } else {
            speakWithDeviceVoice(finalAnswer, data.lang || lang);
          }
        } catch (_) {
          // If server failed, check if we have a live transcript to fall back on
          if (transcript) {
            const fallback = getLocalFallbackAnswer(transcript, lang);
            setAnswer(fallback);
            setStatus('done');
            speakWithDeviceVoice(fallback, lang);
          } else {
            setAnswer(copy.serviceDown);
            setStatus('error');
          }
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
    try {
      mediaRecorderRef.current?.stop();
    } catch (_) {}
  };

  // Play a specific lesson aloud
  const playLessonAudio = (lesson) => {
    stopAudio();
    setAnswer(lesson.content);
    setTranscript(`${copy.lessonsTitle}: ${lesson.label}`);
    ttsAndSpeak(lesson.content, lang);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-emerald-50/20 text-gray-800">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 text-white shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full text-xs font-semibold text-emerald-100 tracking-wide uppercase mb-2">
                <span>🇰🇪 DeVote Kenya</span>
                <span>•</span>
                <span>{copy.tagline}</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                🔊 {copy.title}
              </h1>
              <p className="mt-2 text-emerald-100/90 text-sm sm:text-base max-w-2xl leading-relaxed">
                {copy.subtitle}
              </p>
            </div>

            {/* Language Switcher */}
            <div className="flex flex-col items-start sm:items-end gap-1.5 self-start sm:self-center bg-black/20 p-2 rounded-2xl border border-white/10">
              <span className="text-[11px] text-emerald-200 font-medium px-2">
                {copy.langSwitchLabel}
              </span>
              <div className="flex gap-1.5">
                {SAUTI_LANGS.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => {
                      stopAudio();
                      setLang(l.code);
                    }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm ${
                      lang === l.code
                        ? 'bg-white text-emerald-900 shadow-md scale-105'
                        : 'bg-white/15 text-white hover:bg-white/25 hover:text-white'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-8 flex gap-2 border-b border-white/15 pb-2">
            <button
              onClick={() => setActiveTab('qa')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === 'qa'
                  ? 'bg-white text-emerald-900 shadow'
                  : 'text-white/80 hover:bg-white/10'
              }`}
            >
              🎙️ {lang === 'sw' ? 'Uliza kwa Sauti / Maandishi' : 'Voice & Text Q&A'}
            </button>
            <button
              onClick={() => setActiveTab('lessons')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === 'lessons'
                  ? 'bg-white text-emerald-900 shadow'
                  : 'text-white/80 hover:bg-white/10'
              }`}
            >
              📘 {copy.lessonsTitle}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {!serviceUp && (
          <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 text-xs sm:text-sm flex items-center gap-2 shadow-sm">
            <span>ℹ️</span>
            <span>{copy.serviceDown}</span>
          </div>
        )}
        {activeTab === 'qa' ? (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Interactive Voice & Chat Panel */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 sm:p-8">
                {/* Voice Interaction Zone */}
                <div className="flex flex-col items-center text-center">
                  <div className="relative my-4">
                    {/* Animated Pulse Waves */}
                    {status === 'recording' && (
                      <div
                        className="absolute inset-0 rounded-full bg-red-500/20 animate-ping"
                        style={{ transform: `scale(${1.2 + level * 0.8})` }}
                      />
                    )}
                    {status === 'speaking' && (
                      <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-pulse" />
                    )}

                    {/* Main Mic Button */}
                    <button
                      onClick={() => (status === 'recording' ? stopRecording() : startRecording())}
                      disabled={!voiceSupported}
                      className={`relative w-32 h-32 rounded-full flex flex-col items-center justify-center text-4xl shadow-xl transition-all transform active:scale-95 ${
                        status === 'recording'
                          ? 'bg-gradient-to-tr from-red-600 to-rose-500 text-white shadow-red-200'
                          : status === 'speaking'
                          ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-emerald-200 ring-4 ring-emerald-200'
                          : 'bg-gradient-to-tr from-emerald-700 to-emerald-600 text-white hover:scale-105 shadow-emerald-200'
                      } ${!voiceSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={status === 'recording' ? copy.micRecording : copy.micIdle}
                    >
                      <span>{status === 'recording' ? '⏹' : status === 'speaking' ? '🔊' : '🎤'}</span>
                      <span className="text-[11px] font-bold tracking-wider uppercase mt-1">
                        {status === 'recording' ? `${elapsed}s` : status === 'speaking' ? copy.speaking : 'Sema'}
                      </span>
                    </button>
                  </div>

                  {/* Audio Frequency Bars Visualizer */}
                  <div className="flex items-end justify-center gap-1.5 h-8 mt-2" aria-hidden>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                      <div
                        key={i}
                        className={`w-1.5 rounded-full transition-all duration-75 ${
                          status === 'recording'
                            ? 'bg-red-500'
                            : status === 'speaking'
                            ? 'bg-emerald-500'
                            : 'bg-gray-200'
                        }`}
                        style={{
                          height: `${
                            status === 'recording'
                              ? Math.max(6, level * 32 * (1 - Math.abs(i - 3.5) / 5))
                              : status === 'speaking'
                              ? Math.max(6, 16 + Math.sin(Date.now() / 200 + i) * 10)
                              : 6
                          }px`,
                        }}
                      />
                    ))}
                  </div>

                  <p className="mt-3 text-sm font-medium text-gray-600">
                    {status === 'recording'
                      ? copy.micRecording
                      : status === 'speaking'
                      ? copy.speaking
                      : status === 'thinking'
                      ? `${copy.thinking} (${elapsed}s)`
                      : voiceSupported
                      ? copy.micIdle
                      : copy.textOnlyMode}
                  </p>
                </div>

                {/* Live Captions Stream */}
                {(status === 'recording' || interim) && (
                  <div className="mt-6 bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 text-left">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
                      {copy.liveCaptionsLabel}
                    </p>
                    <p className="mt-1 text-sm sm:text-base text-gray-800">
                      {transcript && <span className="font-medium">{transcript} </span>}
                      <span className="text-amber-800 italic underline decoration-amber-300">{interim}</span>
                    </p>
                  </div>
                )}

                {/* Text Question Input */}
                <form
                  className="mt-6 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    askText(question);
                  }}
                >
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder={copy.askPlaceholder}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm sm:text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all shadow-inner"
                  />
                  <button
                    type="submit"
                    disabled={!question.trim()}
                    className="px-5 py-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5 shadow"
                  >
                    <span>{copy.askButton}</span>
                    <span>➤</span>
                  </button>
                </form>

                {/* User Transcript Display */}
                {transcript && status !== 'recording' && (
                  <div className="mt-6 bg-gray-50 border border-gray-200 rounded-2xl p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      {copy.transcriptLabel}
                    </p>
                    <p className="mt-1 text-sm sm:text-base text-gray-800 font-medium italic">
                      “{transcript}”
                    </p>
                  </div>
                )}

                {/* Sauti Answer Card */}
                {answer && (
                  <div className="mt-4 bg-emerald-50/80 border-2 border-emerald-200 rounded-3xl p-5 sm:p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-xs font-bold uppercase tracking-wide">
                          <span>🔊 {copy.answerLabel}</span>
                        </div>
                        <p className="text-gray-900 text-sm sm:text-base leading-relaxed whitespace-pre-line font-normal">
                          {answer}
                        </p>
                      </div>

                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          onClick={() => ttsAndSpeak(answer, lang)}
                          className="p-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-medium transition-all shadow flex items-center justify-center"
                          title={copy.listenAgain}
                        >
                          🔊
                        </button>
                        {status === 'speaking' && (
                          <button
                            onClick={stopAudio}
                            className="p-2.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-xl text-xs font-medium transition-all flex items-center justify-center"
                            title={copy.stopSpeaking}
                          >
                            ⏹
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Suggestions Chips */}
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                  💡 {copy.suggestionsLabel}
                </p>
                <div className="flex flex-wrap gap-2">
                  {copy.suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        askText(s);
                      }}
                      className="text-left px-3.5 py-2 bg-emerald-50/70 hover:bg-emerald-100 border border-emerald-200/60 rounded-xl text-xs sm:text-sm text-emerald-900 font-medium transition-all hover:scale-[1.01]"
                    >
                      💬 {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Side Column: Quick Lessons & Next Actions */}
            <div className="space-y-6">
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-900 text-base">
                    📘 {copy.lessonsTitle}
                  </h3>
                  <button
                    onClick={() => setActiveTab('lessons')}
                    className="text-xs text-emerald-700 font-semibold hover:underline"
                  >
                    {lang === 'sw' ? 'Tazama yote' : 'View all'} →
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                  {copy.lessonsSubtitle}
                </p>

                <div className="space-y-2">
                  {copy.lessons.slice(0, 5).map((lesson) => (
                    <button
                      key={lesson.id}
                      onClick={() => playLessonAudio(lesson)}
                      className="w-full text-left p-3 rounded-2xl hover:bg-emerald-50 border border-gray-100 hover:border-emerald-200 transition-all group flex items-start gap-3"
                    >
                      <span className="text-xl group-hover:scale-110 transition-transform">{lesson.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 group-hover:text-emerald-900 truncate">
                          {lesson.label}
                        </p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{lesson.desc}</p>
                      </div>
                      <span className="text-xs text-emerald-700 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                        🔊
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Voter Next Actions */}
              <div className="bg-gradient-to-br from-emerald-800 to-teal-900 text-white rounded-3xl shadow-md p-6 space-y-4">
                <h4 className="font-bold text-base">
                  🗳️ {lang === 'sw' ? 'Hatua Yako Ifuatayo' : 'Your Next Step'}
                </h4>
                <p className="text-xs text-emerald-100/90 leading-relaxed">
                  {lang === 'sw'
                    ? 'Uko tayari kupiga kura au kujiandikisha? Chagua hatua hapa chini:'
                    : 'Ready to cast your ballot or register as a voter? Choose your action below:'}
                </p>
                <div className="space-y-2.5 pt-1">
                  <button
                    onClick={() => onNavigate && onNavigate('registration')}
                    className="w-full py-3 bg-white text-emerald-900 hover:bg-emerald-50 rounded-xl text-sm font-bold shadow transition-all"
                  >
                    📝 {copy.goRegister}
                  </button>
                  <button
                    onClick={() => onNavigate && onNavigate('vote')}
                    className="w-full py-3 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold border border-white/20 transition-all"
                  >
                    🗳️ {copy.goVote}
                  </button>
                </div>
              </div>

              {/* Security & Free Help Hotline Banner */}
              <div className="bg-white rounded-3xl border border-gray-200 p-5 space-y-3 text-xs text-gray-600">
                <div className="flex items-center gap-2 text-emerald-800 font-bold">
                  <span>🔒</span>
                  <span>{lang === 'sw' ? 'Usalama na Faragha' : 'Security & Privacy'}</span>
                </div>
                <p className="leading-relaxed">{copy.privacy}</p>
                <hr className="border-gray-100" />
                <div className="flex items-center justify-between text-[11px] font-medium text-gray-500 pt-1">
                  <span>📞 IEBC: 0800 221 221</span>
                  <span>🚨 Fraud: 1195</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Full Lessons Tab */
          <div className="space-y-6">
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                📘 {copy.lessonsTitle}
              </h2>
              <p className="text-sm text-gray-600 mb-6">
                {copy.lessonsSubtitle}
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {copy.lessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className="bg-gray-50/70 border border-gray-200/80 hover:border-emerald-400 rounded-3xl p-5 sm:p-6 transition-all hover:shadow-md flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-3xl">{lesson.icon}</span>
                        <button
                          onClick={() => playLessonAudio(lesson)}
                          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow transition-colors"
                        >
                          <span>🔊</span>
                          <span>{copy.listenLesson}</span>
                        </button>
                      </div>
                      <h4 className="font-bold text-base text-gray-900 mb-2">{lesson.label}</h4>
                      <p className="text-xs text-gray-700 leading-relaxed">{lesson.content}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-200/60 flex items-center justify-between text-xs text-emerald-800 font-semibold">
                      <span>✓ {lang === 'sw' ? 'Mada Rasmi' : 'Verified Topic'}</span>
                      <button
                        onClick={() => {
                          askText(lesson.label);
                          setActiveTab('qa');
                        }}
                        className="hover:underline"
                      >
                        {lang === 'sw' ? 'Uliza Zaidi' : 'Ask More'} →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SautiLearnPage;
