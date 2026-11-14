import path from "path";
import fs from "fs";
import { getDB } from "../config/db";

// ---------------------------------------------------------------------------
// JMdict In-Memory Index
// ---------------------------------------------------------------------------
// Loaded once at startup from the bundled JSON file (data/jmdict/).
// Maps each kanji / kana surface form → English glosses string.
// ---------------------------------------------------------------------------

let jmdictIndex: Map<string, string> | null = null;
let jmdictLoading = false;
let jmdictLoadPromise: Promise<void> | null = null;

const JMDICT_JSON_PATH = path.resolve(
    __dirname,
    "../../data/jmdict/jmdict-eng-common-3.6.2.json"
);

function buildJmdictIndex(jsonPath: string): Map<string, string> {
    const raw = fs.readFileSync(jsonPath, "utf8");
    const data = JSON.parse(raw) as {
        version: string;
        words: Array<{
            id: string;
            kanji: Array<{ text: string; common: boolean }>;
            kana: Array<{ text: string; common: boolean }>;
            sense: Array<{ gloss: Array<{ text: string; lang: string }> }>;
        }>;
    };

    const index = new Map<string, string>();

    for (const word of data.words) {
        // Collect top English glosses (up to 4 meanings)
        const glosses = word.sense
            .flatMap((s) => s.gloss.filter((g) => g.lang === "eng").map((g) => g.text))
            .slice(0, 4)
            .join("; ");

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

export async function getJmdictIndex(): Promise<Map<string, string>> {
    if (jmdictIndex) return jmdictIndex;

    if (jmdictLoading && jmdictLoadPromise) {
        await jmdictLoadPromise;
        return jmdictIndex!;
    }

    jmdictLoading = true;
    jmdictLoadPromise = new Promise<void>((resolve, reject) => {
        try {
            if (!fs.existsSync(JMDICT_JSON_PATH)) {
                console.warn(`[JMdict] Dictionary file not found at ${JMDICT_JSON_PATH}. Vocab lookup will be limited.`);
                jmdictIndex = new Map();
                resolve();
                return;
            }

            console.log("[JMdict] Building in-memory index from JSON...");
            const startMs = Date.now();
            jmdictIndex = buildJmdictIndex(JMDICT_JSON_PATH);
            console.log(`[JMdict] Index ready: ${jmdictIndex.size} entries in ${Date.now() - startMs}ms`);
            resolve();
        } catch (err: any) {
            console.error("[JMdict] Failed to build index:", err.message);
            jmdictIndex = new Map();
            resolve(); // Resolve anyway so the app continues
        }
    });

    await jmdictLoadPromise;
    return jmdictIndex!;
}

// ---------------------------------------------------------------------------
// Grammar Particles Fallback (not in JMdict, always needed)
// ---------------------------------------------------------------------------

const GRAMMAR_PARTICLES_ID: Record<string, string> = {
    "は": "partikel penanda topik (adalah / tentang)",
    "が": "partikel penanda subjek",
    "を": "partikel penanda objek penderita",
    "に": "di / ke / pada / untuk (arah, waktu, tujuan)",
    "へ": "menuju ke / ke arah",
    "で": "di / dengan / menggunakan (tempat aktivitas, alat, cara)",
    "と": "dan / bersama / dengan / bahwa",
    "も": "juga / pun",
    "の": "kepemilikan / penjelas kata benda (dari / punya)",
    "から": "dari / sejak / karena / setelah",
    "まで": "sampai / hingga",
    "より": "daripada / lebih dari / sejak",
    "ね": "ya / kan? (penegas rasa simpati / persetujuan)",
    "よ": "lho / tahu! (memberi tahu / penegas informasi)",
    "か": "apakah (partikel penanda tanya)",
    "わ": "lho / kok (penegas lembut feminin)",
    "ぞ": "lho! (penegas tegas maskulin)",
    "ぜ": "ayo / kan! (penegas ajakan / maskulin kasual)",
    "な": "ya / jangan (partikel seru / larangan)",
    "さ": "kan / begitulah (partikel nada bicara kasual)",
    "や": "dan (antara lain) / seperti",
    "だ": "adalah (kopula kasual)",
    "です": "adalah (kopula sopan)",
    "ます": "bentuk sopan kata kerja",
    "た": "penanda bentuk lampau (-sudah / telah)",
    "ない": "tidak / bukan (penanda negatif)",
    "ている": "sedang (penanda sedang berlangsung / status)",
    "てる": "sedang (singkatan kasual dari teiru)",
    "て": "partikel penghubung bentuk -te (lalu / dan)",
    "ば": "jika / kalau (bentuk pengandaian)",
    "たら": "jika / setelah (bentuk pengandaian waktu)",
    "なら": "jika memang / kalau tentang",
    "たい": "ingin / mau (menyatakan keinginan)",
    "せる": "membuat / menyuruh (kausatif)",
    "させる": "membuat / menyuruh (kausatif)",
    "れる": "di- / bisa (pasif / potensial)",
    "られる": "di- / bisa (pasif / potensial)",
};

// ---------------------------------------------------------------------------
// Groq AI Translate: English → Indonesian (single word/phrase)
// ---------------------------------------------------------------------------

async function translateEnToId(englishMeaning: string, japaneseWord: string): Promise<string | null> {
    try {
        // Lazy-load to avoid circular dependency
        const { default: Groq } = await import("groq-sdk");
        const apiKey = (process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "").replace(/^"|"$/g, "").trim();
        if (!apiKey) return null;

        const model = process.env.GROQ_MODEL || process.env.GROK_MODEL || "llama-3.3-70b-versatile";
        const groq = new Groq({ apiKey });

        const completion = await groq.chat.completions.create({
            model,
            messages: [
                {
                    role: "system",
                    content: `You are a Japanese-English-Indonesian translator for a flashcard app.
Given a Japanese word and its English dictionary meaning, provide a concise Indonesian translation.
Output ONLY the Indonesian meaning (1-10 words), no explanations, no extra text.`
                },
                {
                    role: "user",
                    content: `Japanese word: "${japaneseWord}"\nEnglish meaning: "${englishMeaning}"\nIndonesian meaning:`
                }
            ],
            max_tokens: 40,
            temperature: 0.1
        });

        const result = (completion.choices?.[0]?.message?.content || "").trim();
        return result.length > 0 && result.length <= 80 ? result : null;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// MongoDB dictionary_cache helpers
// ---------------------------------------------------------------------------

async function getCachedMeaning(word: string): Promise<string | null> {
    try {
        const db = getDB();
        const cached = await db.collection("dictionary_cache").findOne({ word });
        return cached?.meaning_id || cached?.meaning_en || null;
    } catch {
        return null;
    }
}

async function saveMeaningToCache(word: string, meaningEn: string, meaningId?: string): Promise<void> {
    try {
        const db = getDB();
        await db.collection("dictionary_cache").updateOne(
            { word },
            {
                $set: {
                    word,
                    meaning_en: meaningEn,
                    ...(meaningId ? { meaning_id: meaningId } : {}),
                    updated_at: new Date()
                }
            },
            { upsert: true }
        );
    } catch {
        // Ignore DB errors during cache write
    }
}

// ---------------------------------------------------------------------------
// Main Public API
// ---------------------------------------------------------------------------

/**
 * Looks up the Indonesian meaning of a Japanese phrase using:
 *   1. Grammar particles table (always Indonesian, instant)
 *   2. MongoDB dictionary_cache (previously translated/cached)
 *   3. JMdict in-memory index → English meaning
 *      a. Groq AI translates English → Indonesian (async, may fail)
 *      b. If Groq fails/limit → save English meaning as fallback (not null)
 *      c. Result cached to MongoDB for future lookups
 */
export async function lookupPhraseMeaning(phrase: {
    surface_form?: string;
    dictionary_form?: string;
    reading?: string;
    part_of_speech?: string;
}): Promise<string | null> {
    if (!phrase) return null;

    const dictForm = (phrase.dictionary_form || "").trim();
    const surfaceForm = (phrase.surface_form || "").trim();
    const reading = (phrase.reading || "").trim();

    const candidates = [dictForm, surfaceForm, reading].filter(Boolean);
    if (candidates.length === 0) return null;

    // 1. Grammar particles – instant, always Indonesian
    for (const c of candidates) {
        if (GRAMMAR_PARTICLES_ID[c]) return GRAMMAR_PARTICLES_ID[c];
    }

    // 2. MongoDB dictionary_cache – previous translations
    for (const c of candidates) {
        const cached = await getCachedMeaning(c);
        if (cached) return cached;
    }

    // 3. JMdict index – get English meaning
    const jmdict = await getJmdictIndex();
    let englishMeaning: string | null = null;
    let matchedWord: string = dictForm || surfaceForm;

    for (const c of candidates) {
        const found = jmdict.get(c);
        if (found) {
            englishMeaning = found;
            matchedWord = c;
            break;
        }
    }

    if (!englishMeaning) return null;

    // 3a. Try translating English → Indonesian via Groq AI
    const indonesianMeaning = await translateEnToId(englishMeaning, matchedWord);

    if (indonesianMeaning) {
        // Cache Indonesian result
        await saveMeaningToCache(matchedWord, englishMeaning, indonesianMeaning);
        return indonesianMeaning;
    }

    // 3b. Groq failed / rate-limited → use English meaning as fallback (not null)
    await saveMeaningToCache(matchedWord, englishMeaning);
    return englishMeaning;
}

/**
 * Batch lookup meanings for a collection of phrases.
 * Returns a Map of token → meaning (Indonesian if Groq available, English otherwise).
 */
export async function batchLookupPhraseMeanings(phrases: Array<{
    surface_form?: string;
    dictionary_form?: string;
    reading?: string;
    part_of_speech?: string;
}>): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    if (!phrases || phrases.length === 0) return results;

    // Pre-load JMdict index once for the whole batch
    await getJmdictIndex();

    // Deduplicate by dictionary_form to avoid redundant lookups + translations
    const seen = new Set<string>();
    const uniquePhrases = phrases.filter((p) => {
        const key = p.dictionary_form || p.surface_form || "";
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    for (const p of uniquePhrases) {
        const meaning = await lookupPhraseMeaning(p);
        if (meaning) {
            if (p.dictionary_form) results.set(p.dictionary_form.trim(), meaning);
            if (p.surface_form) results.set(p.surface_form.trim(), meaning);
            if (p.reading) results.set(p.reading.trim(), meaning);
        }
    }

    return results;
}
