/**
 * Test script: Phrase translation pipeline
 * Tests JMdict lookup + AI translate (EN→ID) + cache
 * Run: node scripts/test-translate.mjs
 */
import dotenv from "dotenv";
dotenv.config();
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JMDICT_PATH = path.resolve(__dirname, "../data/jmdict/jmdict-eng-common-3.6.2.json");

// ─── 1. Build JMdict index ───────────────────────────────────────────────────
console.log("\n=== [1] JMdict Index ===");
let jmdictIndex = new Map();
if (fs.existsSync(JMDICT_PATH)) {
    const start = Date.now();
    const raw = JSON.parse(fs.readFileSync(JMDICT_PATH, "utf8"));
    for (const word of raw.words) {
        const glosses = word.sense
            .flatMap(s => s.gloss.filter(g => g.lang === "eng").map(g => g.text))
            .slice(0, 4).join("; ");
        if (!glosses) continue;
        for (const k of word.kanji) if (!jmdictIndex.has(k.text)) jmdictIndex.set(k.text, glosses);
        for (const k of word.kana) if (!jmdictIndex.has(k.text)) jmdictIndex.set(k.text, glosses);
    }
    console.log(`✅ JMdict loaded: ${jmdictIndex.size} entries in ${Date.now() - start}ms`);
} else {
    console.log("❌ JMdict file NOT found at:", JMDICT_PATH);
}

// ─── 2. Test phrase lookup in JMdict ─────────────────────────────────────────
console.log("\n=== [2] JMdict Phrase Lookup ===");
const testPhrases = [
    { word: "愛", label: "愛 (ai - love)" },
    { word: "空", label: "空 (sora - sky)" },
    { word: "泣く", label: "泣く (naku - to cry)" },
    { word: "なく", label: "なく (naku kana)" },
    { word: "心", label: "心 (kokoro - heart)" },
    { word: "夢", label: "夢 (yume - dream)" },
    { word: "星", label: "星 (hoshi - star)" },
    { word: "知らない", label: "知らない (shiranai - don't know)" },
    { word: "ありがとう", label: "ありがとう (arigatou - thank you)" },
    { word: "XYZNOTEXIST", label: "XYZNOTEXIST (not exist)" },
];

const found = [], notFound = [];
for (const { word, label } of testPhrases) {
    const meaning = jmdictIndex.get(word);
    if (meaning) {
        console.log(`  ✅ ${label}\n     → EN: ${meaning}`);
        found.push({ word, meaning });
    } else {
        console.log(`  ❌ ${label} → not found in JMdict`);
        notFound.push(word);
    }
}

// ─── 3. Test Groq AI: EN → ID translation ────────────────────────────────────
console.log("\n=== [3] Groq AI Translation (EN→ID) ===");
const apiKey = (process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "").replace(/^"|"$/g, "").trim();
const model = (process.env.GROQ_MODEL || process.env.GROK_MODEL || "llama-3.3-70b-versatile").replace(/^"|"$/g, "").trim();
const proxyUrl = (process.env.GROQ_PROXY || process.env.AI_PROXY || process.env.HTTPS_PROXY || "").trim();

if (!apiKey) {
    console.log("⚠️  GROQ_API_KEY not set – skipping AI test");
} else {
    console.log(`  Using model  : ${model}`);
    console.log(`  Proxy        : ${proxyUrl || "(none)"}`);

    // Build Groq client (with optional SOCKS5 proxy)
    let groqModule;
    try {
        groqModule = await import("groq-sdk");
    } catch {
        console.log("❌ groq-sdk not installed");
        process.exit(1);
    }
    const Groq = groqModule.default;

    let groqOptions = { apiKey, maxRetries: 1, timeout: 20000 };

    if (proxyUrl) {
        try {
            const { ProxyAgent, Socks5ProxyAgent, fetch: undiciFetch } = await import("undici");
            let dispatcher;
            if (proxyUrl.startsWith("socks5://") || proxyUrl.startsWith("socks://")) {
                dispatcher = new Socks5ProxyAgent(proxyUrl);
            } else {
                dispatcher = new ProxyAgent(proxyUrl);
            }
            const customFetch = (url, init) => undiciFetch(url, { ...init, dispatcher });
            customFetch.Response = globalThis.Response;
            groqOptions.fetch = customFetch;
            console.log(`  ✅ Proxy agent initialized (${proxyUrl})`);
        } catch (e) {
            console.log(`  ⚠️  Proxy init failed: ${e.message}`);
        }
    }

    const groq = new Groq(groqOptions);

    // Test with the found phrases (max 3)
    const toTranslate = found.slice(0, 3);
    for (const { word, meaning } of toTranslate) {
        process.stdout.write(`  Translating "${word}" (${meaning}) → `);
        try {
            const start = Date.now();
            const completion = await groq.chat.completions.create({
                model,
                messages: [
                    {
                        role: "system",
                        content: "You are a Japanese-English-Indonesian translator for a flashcard app.\nGiven a Japanese word and its English dictionary meaning, provide a concise Indonesian translation.\nOutput ONLY the Indonesian meaning (1-10 words), no explanations, no extra text."
                    },
                    {
                        role: "user",
                        content: `Japanese word: "${word}"\nEnglish meaning: "${meaning}"\nIndonesian meaning:`
                    }
                ],
                max_tokens: 40,
                temperature: 0.1
            });
            const result = (completion.choices?.[0]?.message?.content || "").trim();
            const ms = Date.now() - start;
            if (result) {
                console.log(`✅ "${result}" (${ms}ms)`);
            } else {
                console.log(`❌ Empty response (${ms}ms)`);
            }
        } catch (err) {
            const code = err?.status || err?.statusCode || "?";
            console.log(`❌ Error HTTP ${code}: ${err?.message || err}`);
        }
    }

    // ─── 4. Test enrichBatchWithAi (row translations) ─────────────────────
    console.log("\n=== [4] Batch Row Translation (enrichBatchWithAi) ===");
    const testRows = [
        { id: "row-1", raw_text: "愛してるよ、君だけを" },
        { id: "row-2", raw_text: "空に浮かぶ雲のように" },
        { id: "row-3", raw_text: "夢の中で会いましょう" },
    ];
    console.log("  Input rows:", testRows.map(r => `"${r.raw_text}"`).join(", "));

    const indexedLines = testRows.map((r, idx) => ({ index: idx + 1, text: r.raw_text }));
    const systemInstruction =
        `You are an expert Japanese-to-Indonesian song translator.\n` +
        `Translate each numbered Japanese lyric line into natural, poetic Indonesian.\n` +
        `Keep the emotional tone and meaning faithful to the original.\n` +
        `Output strictly valid JSON with this exact schema:\n` +
        `{\n  "lines": [\n    {"index": 1, "translation": "..."}\n  ]\n}`;

    try {
        const start = Date.now();
        const completion = await groq.chat.completions.create({
            model,
            messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: "Input Data (respond strictly in the required JSON schema):\n" + JSON.stringify({ lines: indexedLines }) }
            ],
            response_format: { type: "json_object" },
            max_tokens: 500,
            temperature: 0.1
        });
        const ms = Date.now() - start;
        const content = (completion.choices?.[0]?.message?.content || "").trim();
        const parsed = JSON.parse(content);

        if (Array.isArray(parsed.lines) && parsed.lines.length > 0) {
            console.log(`  ✅ Batch translation OK (${ms}ms):`);
            for (const item of parsed.lines) {
                const original = testRows[item.index - 1]?.raw_text || "?";
                console.log(`     [${item.index}] "${original}"`);
                console.log(`          → "${item.translation}"`);
            }
        } else {
            console.log(`  ❌ Unexpected response structure:`, content.substring(0, 200));
        }
    } catch (err) {
        const code = err?.status || err?.statusCode || "?";
        console.log(`  ❌ Error HTTP ${code}: ${err?.message || err}`);
    }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log("\n=== Summary ===");
console.log(`JMdict: ${jmdictIndex.size} entries loaded`);
console.log(`Phrase lookup: ${found.length}/${testPhrases.length} found`);
if (notFound.length) console.log(`Not found: ${notFound.join(", ")}`);
console.log("");
