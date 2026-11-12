/* End-to-end verification for the bilingual Sauti Learn stack: node verify.js */
const SAUTI = 'http://localhost:5050';

const j = async (path, body) => {
    const r = await fetch(SAUTI + path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
};

(async () => {
    const h = await j('/health');
    console.log('1. Health check:', h.data.status, 'languages:', h.data.languages, 'providers:', h.data.providers);

    const t1 = Date.now();
    const en = await j('/ask', { question: 'How do I register to vote?', lang: 'en' });
    console.log(`2. EN answer: provider=${en.data.provider} in ${((Date.now() - t1) / 1000).toFixed(1)}s -> ${String(en.data.answer).slice(0, 80)}`);

    const t2 = Date.now();
    const sw = await j('/ask', { question: 'Ninajisajilishaje kupiga kura?', lang: 'sw' });
    console.log(`3. SW answer: provider=${sw.data.provider} in ${((Date.now() - t2) / 1000).toFixed(1)}s -> ${String(sw.data.answer).slice(0, 80)}`);

    const t3 = Date.now();
    const swTts = await j('/tts', { text: 'Kura yako ni siri na iko salama.', lang: 'sw' });
    console.log(`4. SW TTS: provider=${swTts.data.provider} bytes=${Math.round((swTts.data.audioBase64 || '').length * 0.75)} in ${((Date.now() - t3) / 1000).toFixed(1)}s`);
})();
