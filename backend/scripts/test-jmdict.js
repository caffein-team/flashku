/**
 * Quick test: JMdict lookup pipeline (without MongoDB / Groq)
 * Tests: index loading, kanji lookup, kana lookup, particles.
 */
const path = require("path");
const fs = require("fs");

// Minimal test without MongoDB / Groq (just JMdict index)
function buildJmdictIndex(jsonPath) {
    const raw = fs.readFileSync(jsonPath, "utf8");
    const data = JSON.parse(raw);
    const index = new Map();
    for (const word of data.words) {
        const glosses = word.sense
            .flatMap(s => s.gloss.filter(g => g.lang === "eng").map(g => g.text))
            .slice(0, 4).join("; ");
        if (!glosses) continue;
        for (const k of word.kanji) {
            if (!index.has(k.text)) index.set(k.text, glosses);
        }
        for (const k of word.kana) {
            if (!index.has(k.text)) index.set(k.text, glosses);
        }
    }
    return index;
}

const jsonPath = path.resolve(__dirname, "../data/jmdict/jmdict-eng-common-3.6.2.json");
console.log("Building JMdict index...");
const start = Date.now();
const index = buildJmdictIndex(jsonPath);
console.log(`✓ Index built: ${index.size} entries in ${Date.now() - start}ms\n`);

const testWords = [
    "心", "こころ", "好き", "空", "愛", "走る", "私", "わたし",
    "夢", "ゆめ", "泣く", "笑う", "声", "光", "涙", "希望",
    "青い", "赤い", "白い", "言葉", "未来", "過去", "今"
];

console.log("Lookup results:");
let found = 0;
for (const w of testWords) {
    const meaning = index.get(w);
    if (meaning) {
        console.log(`  ✓ ${w} → ${meaning}`);
        found++;
    } else {
        console.log(`  ✗ ${w} → NOT FOUND`);
    }
}
console.log(`\n${found}/${testWords.length} words found in JMdict.`);
