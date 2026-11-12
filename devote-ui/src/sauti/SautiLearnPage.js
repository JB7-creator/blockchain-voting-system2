import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SAUTI_LANGS, copyFor } from './sautiContent';

/**
 * Clean SVG Vector Icons (No AI emojis)
 */
const Icons = {
  Mic: ({ className = "w-6 h-6" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-14 0m14 0a7 7 0 00-7-7m7 7v4a3 3 0 01-3 3H7a3 3 0 01-3-3v-4m14 0h2m-16 0H3m8 8v3m0 0h-3m3 0h3" />
    </svg>
  ),
  Stop: ({ className = "w-6 h-6" }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  ),
  Speaker: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    </svg>
  ),
  Mute: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
    </svg>
  ),
  Send: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  ),
  Phone: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  Shield: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Document: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  Ballot: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  ),
  Receipt: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12l2-1 2 1 2-1 2 1 2-1 2 1 2-1v-12a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  Clock: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Help: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  Book: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  Sparkles: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
  Check: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  Info: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

function renderTopicIcon(iconName, className = "w-5 h-5") {
  switch (iconName) {
    case 'register': return <Icons.Document className={className} />;
    case 'positions': return <Icons.Ballot className={className} />;
    case 'ussd': return <Icons.Phone className={className} />;
    case 'secret': return <Icons.Shield className={className} />;
    case 'verify': return <Icons.Receipt className={className} />;
    case 'day': return <Icons.Clock className={className} />;
    case 'help': return <Icons.Help className={className} />;
    default: return <Icons.Book className={className} />;
  }
}

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
      utter.rate = 0.95;
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
      const fallback = getLocalFallbackAnswer(trimmed, lang);
      setAnswer(fallback);
      setStatus('done');
      ttsAndSpeak(fallback, lang);
    }
  };

  // Local fallback answer if backend is unreachable
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
    if (qLower.includes('ussd') || qLower.includes('mtandao') || qLower.includes('simu') || qLower.includes('internet') || qLower.includes('384')) {
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

  const playLessonAudio = (lesson) => {
    stopAudio();
    setAnswer(lesson.content);
    setTranscript(`${copy.lessonsTitle}: ${lesson.label}`);
    ttsAndSpeak(lesson.content, lang);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-emerald-50/20 to-gray-50 text-gray-800">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 text-white shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-xs font-semibold text-emerald-200 uppercase tracking-wide mb-2.5">
                <span>DeVote Kenya</span>
                <span className="w-1 h-1 rounded-full bg-emerald-400" />
                <span>USSD *384*41484#</span>
                <span className="w-1 h-1 rounded-full bg-emerald-400" />
                <span>{copy.tagline}</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight flex items-center gap-3">
                <Icons.Speaker className="w-8 h-8 text-emerald-300" />
                <span>{copy.title}</span>
              </h1>
              <p className="mt-2 text-emerald-100 text-sm sm:text-base max-w-2xl leading-relaxed">
                {copy.subtitle}
              </p>
            </div>

            {/* Language Switcher */}
            <div className="flex flex-col items-start sm:items-end gap-1.5 self-start sm:self-center bg-black/25 p-2 rounded-2xl border border-white/10">
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
                    className={`px-4 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                      lang === l.code
                        ? 'bg-white text-emerald-900 shadow-md font-bold'
                        : 'bg-white/15 text-white hover:bg-white/25'
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
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                activeTab === 'qa'
                  ? 'bg-white text-emerald-900 shadow'
                  : 'text-white/80 hover:bg-white/10'
              }`}
            >
              <Icons.Mic className="w-4 h-4" />
              <span>{lang === 'sw' ? 'Uliza kwa Sauti na Maandishi' : 'Voice & Text Q&A'}</span>
            </button>
            <button
              onClick={() => setActiveTab('lessons')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                activeTab === 'lessons'
                  ? 'bg-white text-emerald-900 shadow'
                  : 'text-white/80 hover:bg-white/10'
              }`}
            >
              <Icons.Book className="w-4 h-4" />
              <span>{copy.lessonsTitle}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {!serviceUp && (
          <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 text-xs sm:text-sm flex items-center gap-2.5 shadow-sm">
            <Icons.Info className="w-5 h-5 text-amber-700 shrink-0" />
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
                      className={`relative w-32 h-32 rounded-full flex flex-col items-center justify-center text-white shadow-xl transition-all transform active:scale-95 ${
                        status === 'recording'
                          ? 'bg-gradient-to-tr from-red-600 to-rose-500 shadow-red-200'
                          : status === 'speaking'
                          ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-emerald-200 ring-4 ring-emerald-200'
                          : 'bg-gradient-to-tr from-emerald-700 to-emerald-600 hover:scale-105 shadow-emerald-200'
                      } ${!voiceSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={status === 'recording' ? copy.micRecording : copy.micIdle}
                    >
                      {status === 'recording' ? (
                        <Icons.Stop className="w-10 h-10" />
                      ) : status === 'speaking' ? (
                        <Icons.Speaker className="w-10 h-10" />
                      ) : (
                        <Icons.Mic className="w-10 h-10" />
                      )}
                      <span className="text-[11px] font-bold tracking-wider uppercase mt-1">
                        {status === 'recording' ? `${elapsed}s` : status === 'speaking' ? copy.speaking : (lang === 'sw' ? 'Sema Sasa' : 'Speak')}
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
                    <Icons.Send className="w-4 h-4" />
                  </button>
                </form>

                {/* User Transcript Display */}
                {transcript && status !== 'recording' && (
                  <div className="mt-6 bg-gray-50 border border-gray-200 rounded-2xl p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      {copy.transcriptLabel}
                    </p>
                    <p className="mt-1 text-sm sm:text-base text-gray-800 font-medium italic">
                      "{transcript}"
                    </p>
                  </div>
                )}

                {/* Sauti Answer Card */}
                {answer && (
                  <div className="mt-4 bg-emerald-50/80 border-2 border-emerald-200 rounded-3xl p-5 sm:p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-700 text-white text-xs font-bold uppercase tracking-wide">
                          <Icons.Speaker className="w-3.5 h-3.5" />
                          <span>{copy.answerLabel}</span>
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
                          <Icons.Speaker className="w-4 h-4" />
                        </button>
                        {status === 'speaking' && (
                          <button
                            onClick={stopAudio}
                            className="p-2.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-xl text-xs font-medium transition-all flex items-center justify-center"
                            title={copy.stopSpeaking}
                          >
                            <Icons.Mute className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Suggestions Chips */}
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                  <Icons.Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>{copy.suggestionsLabel}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {copy.suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        askText(s);
                      }}
                      className="text-left px-3.5 py-2 bg-emerald-50/70 hover:bg-emerald-100 border border-emerald-200/60 rounded-xl text-xs sm:text-sm text-emerald-900 font-medium transition-all hover:scale-[1.01]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Side Column: Quick Lessons & Next Actions */}
            <div className="space-y-6">
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                    <Icons.Book className="w-5 h-5 text-emerald-700" />
                    <span>{copy.lessonsTitle}</span>
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
                      <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100 transition-colors">
                        {renderTopicIcon(lesson.icon, "w-4 h-4")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 group-hover:text-emerald-900 truncate">
                          {lesson.label}
                        </p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{lesson.desc}</p>
                      </div>
                      <span className="p-1 text-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Icons.Speaker className="w-4 h-4" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Voter Next Actions */}
              <div className="bg-gradient-to-br from-emerald-800 to-teal-900 text-white rounded-3xl shadow-md p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Icons.Ballot className="w-5 h-5 text-emerald-300" />
                  <h4 className="font-bold text-base">
                    {lang === 'sw' ? 'Hatua Yako Ifuatayo' : 'Your Next Step'}
                  </h4>
                </div>
                <p className="text-xs text-emerald-100 leading-relaxed">
                  {lang === 'sw'
                    ? 'Uko tayari kupiga kura au kujiandikisha? Chagua hatua au piga USSD *384*41484#:'
                    : 'Ready to cast your ballot or register? Choose below or dial USSD *384*41484#:'}
                </p>
                <div className="space-y-2.5 pt-1">
                  <button
                    onClick={() => onNavigate && onNavigate('registration')}
                    className="w-full py-3 bg-white text-emerald-900 hover:bg-emerald-50 rounded-xl text-sm font-bold shadow transition-all flex items-center justify-center gap-2"
                  >
                    <Icons.Document className="w-4 h-4" />
                    <span>{copy.goRegister}</span>
                  </button>
                  <button
                    onClick={() => onNavigate && onNavigate('vote')}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold border border-white/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Icons.Ballot className="w-4 h-4" />
                    <span>{copy.goVote}</span>
                  </button>
                </div>
              </div>

              {/* USSD & Security Card */}
              <div className="bg-white rounded-3xl border border-gray-200 p-5 space-y-3 text-xs text-gray-600">
                <div className="flex items-center gap-2 text-emerald-800 font-bold">
                  <Icons.Shield className="w-4 h-4" />
                  <span>{lang === 'sw' ? 'Usalama na Faragha' : 'Security & Privacy'}</span>
                </div>
                <p className="leading-relaxed">{copy.privacy}</p>
                <hr className="border-gray-100" />
                <div className="space-y-1.5 text-[11px] font-medium text-gray-700">
                  <div className="flex items-center justify-between">
                    <span>USSD Dial Code:</span>
                    <span className="font-bold text-emerald-800 font-mono">*384*41484#</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Online Portal:</span>
                    <span className="font-bold text-emerald-800">blockchainelectionsystem.netlify.app</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 text-gray-500">
                    <span>IEBC Toll-Free: 0800 221 221</span>
                    <span>Fraud Line: 1195</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Full Lessons Tab */
          <div className="space-y-6">
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2.5">
                <Icons.Book className="w-6 h-6 text-emerald-700" />
                <span>{copy.lessonsTitle}</span>
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
                        <div className="p-2.5 rounded-2xl bg-emerald-100 text-emerald-800">
                          {renderTopicIcon(lesson.icon, "w-6 h-6")}
                        </div>
                        <button
                          onClick={() => playLessonAudio(lesson)}
                          className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow transition-colors"
                        >
                          <Icons.Speaker className="w-4 h-4" />
                          <span>{copy.listenLesson}</span>
                        </button>
                      </div>
                      <h4 className="font-bold text-base text-gray-900 mb-2">{lesson.label}</h4>
                      <p className="text-xs text-gray-700 leading-relaxed">{lesson.content}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-200/60 flex items-center justify-between text-xs text-emerald-800 font-semibold">
                      <span className="flex items-center gap-1">
                        <Icons.Check className="w-3.5 h-3.5" />
                        <span>{lang === 'sw' ? 'Mada Rasmi' : 'Official Guide'}</span>
                      </span>
                      <button
                        onClick={() => {
                          askText(lesson.label);
                          setActiveTab('qa');
                        }}
                        className="hover:underline flex items-center gap-1"
                      >
                        <span>{lang === 'sw' ? 'Uliza Zaidi' : 'Ask More'}</span>
                        <Icons.Send className="w-3 h-3" />
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
