/* End-to-end verification for the Sauti Learn stack: node verify.js */
const SAUTI = 'http://localhost:5050';

const j = async (path, body) => {
    const r = await fetch(SAUTI + path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(180000),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
};

(async () => {
    const h = await j('/health');
    console.log('1. health:', h.data.providers?.llm, 'sidecar:', h.data.providers?.stt?.kikuyuSidecar);

    const t0 = Date.now();
    const tts = await j('/tts', { text: 'Niatia uhota gwika guki?', lang: 'kik' });
    console.log(`2. KIKUYU TTS: status=${tts.status} provider=${tts.data.provider} bytes=${Math.round((tts.data.audioBase64 || '').length * 0.75)} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    const t1 = Date.now();
    const en = await j('/ask', { question: 'How do I register to vote?', lang: 'en' });
    console.log(`3. EN answer: provider=${en.data.provider} in ${((Date.now() - t1) / 1000).toFixed(1)}s -> ${String(en.data.answer).slice(0, 70)}`);

    const t2 = Date.now();
    const sw = await j('/ask', { question: 'Ninajisajilishaje kupiga kura?', lang: 'sw' });
    console.log(`4. SW answer: provider=${sw.data.provider} in ${((Date.now() - t2) / 1000).toFixed(1)}s -> ${String(sw.data.answer).slice(0, 70)}`);

    const t3 = Date.now();
    const kik = await j('/ask', { question: 'Niatia uhota gwika guki?', lang: 'kik' });
    console.log(`5. KIK answer: provider=${kik.data.provider} lang=${kik.data.lang} degraded=${kik.data.degraded} in ${((Date.now() - t3) / 1000).toFixed(1)}s -> ${String(kik.data.answer).slice(0, 70)}`);

    const t4 = Date.now();
    const kikTts = await j('/tts', { text: 'Kura yako ni siri.', lang: 'sw' });
    console.log(`6. SW TTS: provider=${kikTts.data.provider} bytes=${Math.round((kikTts.data.audioBase64 || '').length * 0.75)} in ${((Date.now() - t4) / 1000).toFixed(1)}s`);
})();
