/* Compare TTS voices: node tts-compare.js */
const SAUTI = 'http://localhost:5050';
const SIDECAR = 'http://127.0.0.1:6060';

const post = async (url, body) => {
    const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(240000),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
};

(async () => {
    const swText = 'Kura yako ni muamala kwenye blockchain ya Sepolia.';

    console.log('— Gemini TTS (natural, quota permitting) —');
    const g = await post(`${SAUTI}/tts`, { text: swText, lang: 'sw' });
    console.log(`  provider=${g.data.provider || 'none'} bytes=${Math.round((g.data.audioBase64 || '').length * 0.75)}`);

    const enText = 'Your vote is a transaction on the Sepolia blockchain.';
    const ge = await post(`${SAUTI}/tts`, { text: enText, lang: 'en' });
    console.log(`  EN provider=${ge.data.provider || 'none'} bytes=${Math.round((ge.data.audioBase64 || '').length * 0.75)}`);
})();
