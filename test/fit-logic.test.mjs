// Standalone logic test for meguminFitToContext.
// Extracts the real function source from the extension and runs it with mocks.
// Run: node test/fit-logic.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'src', 'engine', 'injection.js'), 'utf8');

// Grab the helper + the fit function (from the CONTEXT FIT banner to the handlePromptInjection export).
const start = src.indexOf('// ── CONTEXT FIT');
const end = src.indexOf('export async function handlePromptInjection');
if (start < 0 || end < 0) throw new Error('Could not locate fit functions in source');
let fitSrc = src.slice(start, end).replace(/^export /gm, '');

// Count tokens the way a real API roughly would: ~4 chars per token, min 1 per non-empty string.
function makeTokenizer(counter) {
    return async (str) => {
        counter.calls++;
        return str ? Math.max(1, Math.ceil(str.length / 4)) : 0;
    };
}

function buildEnv({ budget, charToToken = 4, oaiSettings = null, apiFetch = null }) {
    const counter = { calls: 0 };
    let budgetValue = budget;

    const getMaxPromptTokens = () => budgetValue;
    const getTokenCountAsync = async (str) => {
        counter.calls++;
        return str ? Math.max(1, Math.ceil(str.length / charToToken)) : 0;
    };
    const toasts = [];
    const toastr = { info: (m) => toasts.push(m), warn: (m) => toasts.push(m), error: (m) => toasts.push(m) };
    const warns = [];
    const consoleMock = {
        info: () => { }, log: () => { }, debug: () => { }, error: () => { },
        warn: (...a) => { warns.push(a.join(' ')); },
    };
    const oai_settings = oaiSettings ?? { custom_url: null, reverse_proxy: null, azure_base_url: null };
    const fetch = apiFetch ?? (async () => { throw new Error('network stub'); });

    // Compile the two functions with the env stubs in scope.
    const factory = new Function(
        'getMaxPromptTokens', 'getTokenCountAsync', 'oai_settings', 'fetch', 'toastr', 'console',
        fitSrc + `
        return { meguminFitToContext, meguminFitContentToText };
        `
    );
    const { meguminFitToContext } = factory(getMaxPromptTokens, getTokenCountAsync, oai_settings, fetch, toastr, consoleMock);
    return { meguminFitToContext, counter, toasts, warns };
}

const msg = (role, chars, name = role) => ({ role, name, mes: 'x'.repeat(chars), content: 'x'.repeat(chars) });
const sys = (chars) => msg('system', chars, 'system');
const usr = (chars) => msg('user', chars, 'User');
const asst = (chars) => msg('assistant', chars, 'Char');

let failures = 0;
function check(label, cond, extra = '') {
    if (cond) { console.log(`  PASS  ${label}`); }
    else { failures++; console.log(`  FAIL  ${label}  ${extra}`); }
}

// ---------------------------------------------------------------------------
console.log('Case 1: small prompt, plenty of budget -> untouched, zero tokenizer calls');
{
    const { meguminFitToContext, counter } = buildEnv({ budget: 45000 });
    const messages = [sys(2000), usr(300), asst(400), usr(300)];
    await meguminFitToContext(messages, false);
    check('message count unchanged', messages.length === 4, `got ${messages.length}`);
    check('no tokenizer calls (cheap gate)', counter.calls === 0, `calls=${counter.calls}`);
}

// ---------------------------------------------------------------------------
console.log('Case 2: dryRun -> untouched, zero tokenizer calls');
{
    const { meguminFitToContext, counter } = buildEnv({ budget: 45000 });
    const messages = [sys(2000), usr(5000), asst(5000)];
    await meguminFitToContext(messages, true);
    check('message count unchanged', messages.length === 3, `got ${messages.length}`);
    check('no tokenizer calls', counter.calls === 0, `calls=${counter.calls}`);
}

// ---------------------------------------------------------------------------
console.log('Case 3: over budget -> oldest user/assistant removed, system + last user kept');
{
    // budget 4000 tokens. System 8k chars (2k tok) + 10 msgs x 800 chars (200 tok each = 2000)
    // + role overhead ~11*4=44 => ~4044 > 3850 target. Must trim oldest, keep last user.
    const { meguminFitToContext, toasts } = buildEnv({ budget: 4000 });
    const messages = [sys(8000)];
    for (let i = 0; i < 10; i++) {
        messages.push(i % 2 === 0 ? usr(800) : asst(800));
    }
    const before = messages.length;
    const lastUser = messages.filter(m => m.role === 'user').pop();
    const tailAssistant = messages[messages.length - 1]; // assistant after the last user
    await meguminFitToContext(messages, false);
    const idx = messages.indexOf(lastUser);
    check('some messages removed', messages.length < before, `before=${before} after=${messages.length}`);
    check('system prompt kept (index 0)', messages[0].role === 'system');
    check('last user message kept', idx >= 0, 'lastUser missing');
    check('nothing after last user was dropped', idx + 2 === messages.length && messages[messages.length - 1] === tailAssistant,
        `lastUser at ${idx}/${messages.length - 1}`);
    check('toast shown', toasts.length >= 1, `toasts=${JSON.stringify(toasts)}`);
}

// ---------------------------------------------------------------------------
console.log('Case 4: fixed prompt alone exceeds budget -> nothing removable, warns');
{
    const { meguminFitToContext, warns } = buildEnv({ budget: 1000 });
    // system 8000 chars -> 2000 tokens > 850 target; only one tiny user after it.
    const messages = [sys(8000), usr(100), asst(100)];
    await meguminFitToContext(messages, false);
    check('kept the protected tail', messages.includes(messages.filter(m=>m.role==="user").pop()));
    check('warn logged', warns.length >= 1, `warns=${JSON.stringify(warns)}`);
}

// ---------------------------------------------------------------------------
console.log('Case 5: multimodal content arrays survive the content extraction');
{
    const fitSrcHelper = true;
    const { meguminFitToContext } = buildEnv({ budget: 45000 });
    const messages = [
        sys(2000),
        { role: 'user', content: [
            { type: 'text', text: 'hello world' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
        ] },
    ];
    await meguminFitToContext(messages, false);
    check('multimodal message preserved', messages[1].content[0].text === 'hello world');
    check('no crash on array content', messages.length === 2);
}

// ---------------------------------------------------------------------------
console.log('Case 6: CJK-heavy prompt (1 char ~ 1 token) is NOT let through by the cheap gate');
{
    // charToToken=1: 30k chars = 30k tokens > target 24850, must actually trim.
    const { meguminFitToContext, counter } = buildEnv({ budget: 25000, charToToken: 1 });
    const messages = [sys(4000)];
    for (let i = 0; i < 25; i++) messages.push(i % 2 === 0 ? usr(1000) : asst(1000)); // ~29k chars
    const before = messages.length;
    await meguminFitToContext(messages, false);
    check('tokenizer actually consulted', counter.calls >= 1, `calls=${counter.calls}`);
    check('trimmed the CJK overload', messages.length < before, `before=${before} after=${messages.length}`);
}

// ---------------------------------------------------------------------------
console.log('Case 7: API /tokenize path (when available) — exact count, client counter untouched');
{
    const fetchCalls = [];
    const apiFetch = async (url, opts) => {
        fetchCalls.push(url);
        const body = JSON.parse(opts.body);
        // The "model's" real tokenizer is denser than the client's 4 chars/token: 3 chars/token.
        return {
            ok: true,
            status: 200,
            json: async () => ({ tokens: new Array(Math.max(1, Math.ceil(body.content.length / 3))).fill(0) }),
        };
    };
    const { meguminFitToContext, counter, toasts } = buildEnv({
        budget: 4000,
        oaiSettings: { custom_url: 'https://api.example.com/v1', reverse_proxy: null, azure_base_url: null },
        apiFetch,
    });
    const messages = [sys(8000)];
    for (let i = 0; i < 10; i++) messages.push(i % 2 === 0 ? usr(800) : asst(800));
    const before = messages.length;
    const lastUser = messages.filter(m => m.role === 'user').pop();
    await meguminFitToContext(messages, false);
    check('used the API base with /tokenize', fetchCalls[0] === 'https://api.example.com/tokenize', `urls=${JSON.stringify(fetchCalls)}`);
    check('client tokenizer never called', counter.calls === 0, `calls=${counter.calls}`);
    check('trimmed to the exact budget', messages.length < before && messages.indexOf(lastUser) >= 0,
        `before=${before} after=${messages.length}`);
    check('toast shown', toasts.length >= 1, `toasts=${JSON.stringify(toasts)}`);
}

// ---------------------------------------------------------------------------
console.log('Case 8: API /tokenize unavailable -> falls back to the client counter with the wide margin');
{
    const { meguminFitToContext, counter } = buildEnv({
        budget: 4000,
        oaiSettings: { custom_url: 'https://api.example.com/v1', reverse_proxy: null, azure_base_url: null },
        apiFetch: async () => { throw new TypeError('fetch failed'); },
    });
    const messages = [sys(8000)];
    for (let i = 0; i < 10; i++) messages.push(i % 2 === 0 ? usr(800) : asst(800));
    const before = messages.length;
    await meguminFitToContext(messages, false);
    check('client tokenizer consulted (fallback)', counter.calls >= 1, `calls=${counter.calls}`);
    check('still trims', messages.length < before, `before=${before} after=${messages.length}`);
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
