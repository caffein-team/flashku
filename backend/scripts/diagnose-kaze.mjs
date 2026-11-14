/**
 * Diagnose: Cari semua entry JMdict yang mengklaim kanji "風"
 * Run: node scripts/diagnose-kaze.mjs
 */
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JMDICT_PATH = path.resolve(__dirname, "../data/jmdict/jmdict-eng-common-3.6.2.json");

const raw = JSON.parse(fs.readFileSync(JMDICT_PATH, "utf8"));

// Cari semua entry yang punya kanji "風" atau kana "かぜ" / "かふう"
console.log("=== All JMdict entries containing kanji 風 ===\n");
let count = 0;
for (const word of raw.words) {
    const hasKanji = word.kanji.some(k => k.text === "風");
    const hasKana  = word.kana.some(k => k.text === "かぜ" || k.text === "ふう" || k.text === "かざ");
    if (!hasKanji && !hasKana) continue;

    const kanji = word.kanji.map(k => `${k.text}${k.common ? "(c)":""}`).join(", ") || "(none)";
    const kana  = word.kana.map(k => `${k.text}${k.common ? "(c)":""}`).join(", ");
    const glosses = word.sense
        .flatMap(s => s.gloss.filter(g => g.lang === "eng").map(g => g.text))
        .slice(0, 5).join("; ");

    console.log(`  ID: ${word.id}`);
    console.log(`  Kanji: ${kanji}`);
    console.log(`  Kana : ${kana}`);
    console.log(`  EN   : ${glosses}`);
    console.log();
    count++;
    if (count >= 10) { console.log("  ... (truncated)"); break; }
}

// Cek apa yang sebenarnya tersimpan di index untuk "風"
console.log("=== Current index value for 風 ===");
const index = new Map();
for (const word of raw.words) {
    const glosses = word.sense
        .flatMap(s => s.gloss.filter(g => g.lang === "eng").map(g => g.text))
        .slice(0, 4).join("; ");
    if (!glosses) continue;
    for (const k of word.kanji) {
        if (!index.has(k.text)) index.set(k.text, { glosses, wordId: word.id });
    }
    for (const k of word.kana) {
        if (!index.has(k.text)) index.set(k.text, { glosses, wordId: word.id });
    }
}
const kazeEntry = index.get("風");
console.log(`  Stored: "${kazeEntry?.glosses}"`);
console.log(`  From word ID: ${kazeEntry?.wordId}`);

// Check kata apa yang word ID itu
const winner = raw.words.find(w => w.id === kazeEntry?.wordId);
console.log(`  Word kanji: ${winner?.kanji.map(k=>k.text).join(", ")}`);
console.log(`  Word kana : ${winner?.kana.map(k=>k.text).join(", ")}`);
