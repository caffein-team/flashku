import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JMDICT_PATH = path.resolve(__dirname, "../data/jmdict/jmdict-eng-common-3.6.2.json");
const raw = JSON.parse(fs.readFileSync(JMDICT_PATH, "utf8"));

// Simulasi pipeline lengkap: build index dengan logik baru
const index = new Map();
const indexCommon = new Set();

for (const word of raw.words) {
    const glosses = word.sense
        .flatMap(s => s.gloss.filter(g => g.lang === "eng").map(g => g.text))
        .slice(0, 1).join("; ");
    if (!glosses) continue;

    for (const k of word.kanji) {
        if (k.common) {
            if (!indexCommon.has(k.text)) { index.set(k.text, glosses); indexCommon.add(k.text); }
        } else {
            if (!index.has(k.text)) index.set(k.text, glosses);
        }
    }
    for (const k of word.kana) {
        if (k.common) {
            if (!indexCommon.has(k.text)) { index.set(k.text, glosses); indexCommon.add(k.text); }
        } else {
            if (!index.has(k.text)) index.set(k.text, glosses);
        }
    }
}

// Simulasi kata dari lirik lagu dengan semua variannya (surface, dict, reading)
// Ini mencerminkan apa yang dikirim kuromoji tokenizer
const simulatedPhrases = [
    // Normal — dict form = surface form
    { surface_form: "愛", dictionary_form: "愛", reading: "あい" },
    { surface_form: "夢", dictionary_form: "夢", reading: "ゆめ" },
    { surface_form: "空", dictionary_form: "空", reading: "そら" },
    { surface_form: "星", dictionary_form: "星", reading: "ほし" },
    { surface_form: "涙", dictionary_form: "涙", reading: "なみだ" },
    { surface_form: "心", dictionary_form: "心", reading: "こころ" },
    { surface_form: "声", dictionary_form: "声", reading: "こえ" },
    { surface_form: "光", dictionary_form: "光", reading: "ひかり" },
    { surface_form: "風", dictionary_form: "風", reading: "かぜ" },
    { surface_form: "花", dictionary_form: "花", reading: "はな" },

    // Kata kerja — surface BERBEDA dari dict form (inflected)
    { surface_form: "泣いて", dictionary_form: "泣く", reading: "ないて" },
    { surface_form: "歌った", dictionary_form: "歌う", reading: "うたった" },
    { surface_form: "信じてた", dictionary_form: "信じる", reading: "しんじてた" },
    { surface_form: "知らない", dictionary_form: "知る", reading: "しらない" },
    { surface_form: "忘れられない", dictionary_form: "忘れる", reading: "わすれられない" },
    { surface_form: "生きていく", dictionary_form: "生きる", reading: "いきていく" },
    { surface_form: "守りたい", dictionary_form: "守る", reading: "まもりたい" },

    // Kata sifat — inflected
    { surface_form: "悲しくて", dictionary_form: "悲しい", reading: "かなしくて" },
    { surface_form: "美しかった", dictionary_form: "美しい", reading: "うつくしかった" },

    // Kata yg hanya ada di kana (tidak ada kanji)
    { surface_form: "ありがとう", dictionary_form: "ありがとう", reading: "ありがとう" },
    { surface_form: "ずっと", dictionary_form: "ずっと", reading: "ずっと" },
    { surface_form: "もう", dictionary_form: "もう", reading: "もう" },

    // Yang benar-benar tidak ada di JMdict
    { surface_form: "てる", dictionary_form: "てる", reading: "てる" },
    { surface_form: "ちゃ", dictionary_form: "ちゃ", reading: "ちゃ" },
];

// Simulasi lookup yang sama persis dengan lookupPhraseMeaning()
function lookupMeaning(phrase) {
    const dictForm = (phrase.dictionary_form || "").trim();
    const surfaceForm = (phrase.surface_form || "").trim();
    const reading = (phrase.reading || "").trim();
    const candidates = [dictForm, surfaceForm, reading].filter(Boolean);

    for (const c of candidates) {
        const found = index.get(c);
        if (found) return { meaning: found, matchedBy: c };
    }
    return null;
}

// Fungsi clean tanda kurung
function cleanGlosses(text) {
    return text
        .replace(/\s*\([^)]*\)/g, "")  // hapus (usu. ...), (distant), dll
        .replace(/\s+/g, " ")
        .trim();
}

console.log("=== Simulasi Lookup Phrase dari Lirik Lagu ===\n");
let found = 0, nullCount = 0;
const nullPhrases = [];

for (const phrase of simulatedPhrases) {
    const result = lookupMeaning(phrase);
    if (result) {
        const cleaned = cleanGlosses(result.meaning);
        const matchedBy = result.matchedBy;
        const hitType = matchedBy === phrase.dictionary_form ? "dict" :
                        matchedBy === phrase.surface_form ? "surface" : "reading";
        console.log(`  ✅ ${phrase.surface_form} [${hitType}: ${matchedBy}] → "${cleaned}"`);
        found++;
    } else {
        console.log(`  ❌ ${phrase.surface_form} (dict: ${phrase.dictionary_form}) → NULL`);
        nullPhrases.push(phrase);
        nullCount++;
    }
}

console.log(`\n=== Summary ===`);
console.log(`  ✅ Found  : ${found}/${simulatedPhrases.length}`);
console.log(`  ❌ Null   : ${nullCount}/${simulatedPhrases.length}`);
if (nullPhrases.length) {
    console.log(`\n  Null phrases:`);
    for (const p of nullPhrases) {
        console.log(`    - surface="${p.surface_form}" dict="${p.dictionary_form}" reading="${p.reading}"`);
    }
}
