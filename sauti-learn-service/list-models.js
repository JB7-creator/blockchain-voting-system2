require('dotenv').config();

const geminiKey = process.env.GEMINI_API_KEY;
const groqKey = process.env.GROQ_API_KEY;

(async () => {
    console.log('=== Gemini models ===');
    try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}&pageSize=100`, {
            signal: AbortSignal.timeout(30000),
        });
        const d = await r.json();
        if (d.models) {
            d.models
                .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
                .slice(0, 40)
                .forEach(m => console.log(' -', m.name.replace('models/', '')));
        } else console.log('ERR', r.status, JSON.stringify(d).slice(0, 300));
    } catch (e) { console.log('FAIL', e.message); }

    console.log('\n=== Groq models ===');
    try {
        const r = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { Authorization: `Bearer ${groqKey}` },
            signal: AbortSignal.timeout(30000),
        });
        const d = await r.json();
        if (d.data) {
            d.data.forEach(m => console.log(' -', m.id, m.active ? '' : '(inactive)'));
        } else console.log('ERR', r.status, JSON.stringify(d).slice(0, 300));
    } catch (e) { console.log('FAIL', e.message); }
})();
