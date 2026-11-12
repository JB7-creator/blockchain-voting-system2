/**
 * Sauti Learn - smoke test (no external API keys required)
 * Run: cd sauti-learn-service && node test-sauti.js
 */
const http = require('http');

const PORT = Number(process.env.PORT || 5050);
const TEST_SERVER = process.env.TEST_SERVER === '1';

function req(method, path, body) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const r = http.request(
            {
                hostname: '127.0.0.1',
                port: PORT,
                path,
                method,
                headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
            },
            res => {
                let data = '';
                res.on('data', c => (data += c));
                res.on('end', () => resolve({ status: res.statusCode, body: data }));
            }
        );
        r.on('error', reject);
        if (payload) r.write(payload);
        r.end();
    });
}

async function main() {
    if (TEST_SERVER) {
        console.log('Using already-running server on port', PORT);
    }

    const checks = [];
    const ok = (name, cond, extra = '') => {
        checks.push({ name, pass: Boolean(cond), extra });
        console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ` → ${extra}` : ''}`);
    };

    // 1. health
    const health = await req('GET', '/health');
    ok('GET /health', health.status === 200);

    // 2. languages (English and Kiswahili)
    const langs = await req('GET', '/languages');
    const langJson = JSON.parse(langs.body);
    ok('GET /languages', Array.isArray(langJson) && langJson.length === 2, langJson.map(l => l.code).join(', '));

    // 3. offline FAQ (English)
    const en = await req('POST', '/ask', { question: 'How do I register to vote?', lang: 'en' });
    const enJson = JSON.parse(en.body);
    ok('POST /ask (en) registration', enJson.answer && enJson.answer.length > 25, `provider=${enJson.provider}`);

    // 4. offline FAQ (Kiswahili)
    const sw = await req('POST', '/ask', { question: 'Ninajisajilishaje kupiga kura?', lang: 'sw' });
    const swJson = JSON.parse(sw.body);
    ok('POST /ask (sw) usajili', swJson.answer && swJson.answer.length > 25, `lang=${swJson.lang}`);

    // 5. lesson (USSD-safe length <= 182 chars)
    const lesson = await req('GET', '/lesson?topic=register&lang=sw');
    ok('GET /lesson (sw) <= 182 chars', lesson.status === 200 && lesson.body.length <= 182, `${lesson.body.length} chars`);

    // 6. voice/ask without audio -> 400 validation error
    const bad = await req('POST', '/voice/ask', {});
    ok('POST /voice/ask validation', bad.status === 400);

    const failed = checks.filter(c => !c.pass).length;
    console.log(`\n${failed === 0 ? '✅' : '⚠️'} ${checks.length - failed}/${checks.length} checks passed`);
    if (TEST_SERVER !== true) {
        process.exit(failed === 0 ? 0 : 1);
    }
}

main().catch(err => {
    console.error('Test harness error:', err.message);
    process.exit(1);
});
