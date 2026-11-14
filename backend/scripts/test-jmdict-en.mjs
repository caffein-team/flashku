/**
 * Test: JMdict English meaning lookup
 * Simulasi kata-kata yang umum muncul di lirik lagu Jepang
 * Run: node scripts/test-jmdict-en.mjs
 */
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JMDICT_PATH = path.resolve(__dirname, "../data/jmdict/jmdict-eng-common-3.6.2.json");

// ─── Build Index ──────────────────────────────────────────────────────────────
process.stdout.write("[1] Loading JMdict... ");
const raw = JSON.parse(fs.readFileSync(JMDICT_PATH, "utf8"));
const index = new Map();
const indexFull = new Map(); // stores ALL glosses, not just 4

for (const word of raw.words) {
    const glossesFull = word.sense
        .flatMap(s => s.gloss.filter(g => g.lang === "eng").map(g => g.text));
    const glosses4 = glossesFull.slice(0, 4).join("; ");
    if (!glosses4) continue;

    for (const k of word.kanji) {
        if (!index.has(k.text)) {
            index.set(k.text, glosses4);
            indexFull.set(k.text, glossesFull);
        }
    }
    for (const k of word.kana) {
        if (!index.has(k.text)) {
            index.set(k.text, glosses4);
            indexFull.set(k.text, glossesFull);
        }
    }
}
console.log(`${index.size} entries loaded\n`);

// ─── Test Cases ───────────────────────────────────────────────────────────────
// Format: { input, label, expected_contains }
const tests = [
    // === Kata benda (Noun) ===
    { input: "愛", label: "愛 (love)", expect: "love" },
    { input: "心", label: "心 (heart/mind)", expect: "heart" },
    { input: "夢", label: "夢 (dream)", expect: "dream" },
    { input: "空", label: "空 (sky/empty)", expect: ["sky", "empty", "void"] },
    { input: "星", label: "星 (star)", expect: "star" },
    { input: "涙", label: "涙 (tear/crying)", expect: "tear" },
    { input: "命", label: "命 (life/fate)", expect: ["life", "fate"] },
    { input: "声", label: "声 (voice)", expect: "voice" },
    { input: "光", label: "光 (light)", expect: "light" },
    { input: "風", label: "風 (wind)", expect: "wind" },
    { input: "花", label: "花 (flower)", expect: "flower" },
    { input: "海", label: "海 (sea/ocean)", expect: "sea" },
    { input: "道", label: "道 (road/path)", expect: ["road", "path", "way"] },
    { input: "言葉", label: "言葉 (words)", expect: "word" },
    { input: "時間", label: "時間 (time)", expect: "time" },
    { input: "世界", label: "世界 (world)", expect: "world" },
    { input: "未来", label: "未来 (future)", expect: "future" },
    { input: "過去", label: "過去 (past)", expect: "past" },
    { input: "記憶", label: "記憶 (memory)", expect: "memor" },
    { input: "奇跡", label: "奇跡 (miracle)", expect: "miracle" },

    // === Kata kerja – dictionary form ===
    { input: "泣く", label: "泣く (to cry)", expect: ["cry", "weep"] },
    { input: "歌う", label: "歌う (to sing)", expect: "sing" },
    { input: "走る", label: "走る (to run)", expect: "run" },
    { input: "会う", label: "会う (to meet)", expect: "meet" },
    { input: "信じる", label: "信じる (to believe)", expect: "believ" },
    { input: "忘れる", label: "忘れる (to forget)", expect: "forget" },
    { input: "生きる", label: "生きる (to live)", expect: "live" },
    { input: "守る", label: "守る (to protect)", expect: "protect" },
    { input: "探す", label: "探す (to search)", expect: "search" },
    { input: "願う", label: "願う (to wish)", expect: "wish" },

    // === Kata sifat ===
    { input: "美しい", label: "美しい (beautiful)", expect: "beauti" },
    { input: "悲しい", label: "悲しい (sad)", expect: "sad" },
    { input: "嬉しい", label: "嬉しい (happy)", expect: ["happy", "glad", "joyful"] },
    { input: "強い", label: "強い (strong)", expect: "strong" },
    { input: "儚い", label: "儚い (fleeting)", expect: ["fleeting", "transient", "ephemeral"] },

    // === Kana only (sering di lirik) ===
    { input: "ありがとう", label: "ありがとう (thank you)", expect: "thank" },
    { input: "さようなら", label: "さようなら (goodbye)", expect: "goodbye" },
    { input: "ずっと", label: "ずっと (always/forever)", expect: ["always", "forever", "long"] },
    { input: "もう", label: "もう (already/anymore)", expect: ["already", "anymore", "now"] },
    { input: "まだ", label: "まだ (still/yet)", expect: "still" },

    // === Surface form yang TIDAK ada (inflected) — harusnya tidak ditemukan ===
    { input: "知らない", label: "知らない (inflected – should NOT find)", expect: null },
    { input: "泣いて", label: "泣いて (inflected – should NOT find)", expect: null },
    { input: "信じてた", label: "信じてた (inflected – should NOT find)", expect: null },

    // === Dictionary form dari yang inflected di atas ===
    { input: "知る", label: "知る (dict form of 知らない)", expect: "know" },
];

// ─── Run Tests ────────────────────────────────────────────────────────────────
console.log("=== JMdict English Meaning Test ===\n");
let passed = 0, failed = 0, notFoundExpected = 0, notFoundUnexpected = 0;

for (const { input, label, expect } of tests) {
    const meaning = index.get(input);

    if (expect === null) {
        // Expecting NOT found (inflected forms)
        if (!meaning) {
            console.log(`  ⬜ ${label}\n     → ✅ Correctly not found (inflected form)\n`);
            notFoundExpected++;
        } else {
            console.log(`  ⬜ ${label}\n     → ⚠️  Unexpectedly found: "${meaning}"\n`);
        }
        continue;
    }

    if (!meaning) {
        console.log(`  ❌ ${label}\n     → NOT FOUND in JMdict\n`);
        notFoundUnexpected++;
        failed++;
        continue;
    }

    const meaningLower = meaning.toLowerCase();
    const expects = Array.isArray(expect) ? expect : [expect];
    const matched = expects.some(e => meaningLower.includes(e.toLowerCase()));

    if (matched) {
        console.log(`  ✅ ${label}\n     → "${meaning}"\n`);
        passed++;
    } else {
        console.log(`  ⚠️  ${label}\n     → Got: "${meaning}"\n     → Expected to contain one of: [${expects.join(" | ")}]\n`);
        failed++;
    }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
const total = tests.filter(t => t.expect !== null).length;
console.log("=".repeat(50));
console.log(`TOTAL: ${total} meaningful tests`);
console.log(`  ✅ Passed         : ${passed}`);
console.log(`  ❌ Failed/Wrong   : ${failed}`);
console.log(`  ⬜ Inflected (N/A): ${notFoundExpected}`);
console.log("=".repeat(50));
