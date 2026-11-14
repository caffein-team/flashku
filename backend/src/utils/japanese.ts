import kuromoji, { Tokenizer } from "kuromoji";
import * as wanakana from "wanakana";
import path from "path";
import { IPhrase } from "../types/song";

// Japanese POS Mapping (MeCab/IPADic -> English)
const POS_MAP: Record<string, string> = {
    "名詞": "Noun",
    "動詞": "Verb",
    "形容詞": "Adjective",
    "副詞": "Adverb",
    "助詞": "Particle",
    "助動詞": "Auxiliary Verb",
    "接続詞": "Conjunction",
    "感動詞": "Interjection",
    "連体詞": "Pre-noun Adjectival",
};

/**
 * Priority weights for each Part of Speech (higher weight = higher priority for vocabulary learning).
 * Scale 1-10:
 * - 10: Verbs & Nouns (Core action & subject/object vocabulary)
 * - 8:  Adjectives (Nuances, emotions, descriptions)
 * - 7:  Adverbs (Degree, manner, frequency)
 * - 5:  Pre-noun Adjectivals (kono, sono, ano)
 * - 4:  Conjunctions (soshite, demo, dakara)
 * - 3:  Auxiliary Verbs (desu, masu, nai, ta)
 * - 2:  Particles (wa, ga, o, ni, de, no - frequent grammatical markers)
 * - 1:  Interjections & others (aa, un, nee - emotional exclamations)
 */
export const POS_WEIGHTS: Record<string, number> = {
    "Verb": 10,
    "Noun": 10,
    "Adjective": 8,
    "Adverb": 7,
    "Pre-noun Adjectival": 5,
    "Conjunction": 4,
    "Auxiliary Verb": 3,
    "Particle": 2,
    "Interjection": 1
};

export function getPhraseWeight(pos?: string | null): number {
    if (!pos) return 1;
    const cleanPos = pos.trim();
    for (const [key, weight] of Object.entries(POS_WEIGHTS)) {
        if (key.toLowerCase() === cleanPos.toLowerCase()) {
            return weight;
        }
    }
    // Check Japanese POS names if passed directly
    if (cleanPos.includes("動詞") && !cleanPos.includes("助動詞")) return 10;
    if (cleanPos.includes("名詞")) return 10;
    if (cleanPos.includes("形容詞")) return 8;
    if (cleanPos.includes("副詞")) return 7;
    if (cleanPos.includes("連体詞")) return 5;
    if (cleanPos.includes("接続詞")) return 4;
    if (cleanPos.includes("助動詞")) return 3;
    if (cleanPos.includes("助詞")) return 2;
    if (cleanPos.includes("感動詞")) return 1;

    return 1;
}

/**
 * Validates whether a phrase is an authentic Japanese linguistic token for flashcard study,
 * rejecting empty strings, standalone punctuation, pure symbols, standalone choonpu marks,
 * and English/Latin words (e.g. "love", "baby", "stay", "yeah").
 * Flashcards will strictly contain Japanese characters (Kanji, Hiragana, or Katakana).
 */
export function isMeaningfulPhrase(phrase?: {
    surface_form?: string;
    dictionary_form?: string;
    part_of_speech?: string;
} | null): boolean {
    if (!phrase) return false;
    const surface = (phrase.surface_form || phrase.dictionary_form || "").trim();
    if (!surface) return false;

    // Reject explicit symbol / punctuation parts of speech
    const pos = (phrase.part_of_speech || "").trim().toLowerCase();
    const invalidPOS = ["symbol", "punctuation", "記号", "補助記号", "unknown"];
    if (invalidPOS.includes(pos)) return false;

    // Strip whitespace and prolonged sound marks (\u30FC)
    const stripped = surface.replace(/[\s\u30FC]/gu, "");
    if (!stripped) return false;

    // Must contain authentic Japanese writing characters:
    // Kanji (\p{Script=Han}), Hiragana (\p{Script=Hiragana}), or Katakana (\p{Script=Katakana}).
    // This strictly excludes English / Latin words ("love", "baby", "stay", "yeah", etc.)
    return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(stripped);
}

/**
 * Checks whether a phrase is a Japanese grammatical particle (助詞),
 * used to exclude particles from vocabulary flashcards.
 */
export function isParticle(phrase?: {
    surface_form?: string;
    dictionary_form?: string;
    part_of_speech?: string;
} | null): boolean {
    if (!phrase) return false;
    const pos = (phrase.part_of_speech || "").trim().toLowerCase();
    if (pos === "particle" || pos === "助詞" || pos.includes("助詞")) {
        return true;
    }

    const surface = (phrase.surface_form || phrase.dictionary_form || "").trim();
    const commonParticles = new Set([
        "は", "が", "を", "に", "で", "の", "も", "へ", "と", "から", "まで", "より",
        "ね", "よ", "か", "わ", "ぞ", "ぜ", "な", "さ", "や", "ば", "て", "けど", "のに"
    ]);
    if (commonParticles.has(surface) && (!pos || pos === "particle" || pos.includes("助詞") || pos === "other")) {
        return true;
    }

    return false;
}

let tokenizerPromise: Promise<Tokenizer<any>> | null = null;

export function getTokenizer(): Promise<Tokenizer<any>> {
    if (!tokenizerPromise) {
        tokenizerPromise = new Promise((resolve, reject) => {
            try {
                const kuromojiMain = require.resolve("kuromoji");
                const dicPath = path.resolve(path.dirname(kuromojiMain), "..", "dict");

                kuromoji.builder({ dicPath }).build((err, tokenizer) => {
                    if (err) {
                        tokenizerPromise = null;
                        return reject(err);
                    }
                    resolve(tokenizer);
                });
            } catch (err) {
                tokenizerPromise = null;
                reject(err);
            }
        });
    }
    return tokenizerPromise;
}

/**
 * Converts Kuromoji tokens into naturally formatted Romaji with appropriate spacing and particle pronunciation.
 */
export function tokensToRomaji(tokens: any[]): string {
    if (!tokens || tokens.length === 0) return "";

    // Group tokens into word/bunsetsu units
    const chunks: any[][] = [];
    let currentChunk: any[] = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const surface = token.surface_form || "";
        const pos = token.pos || "";
        const prev = tokens[i - 1];

        if (!surface) continue;

        // Pure whitespace
        if (/^\s+$/.test(surface)) {
            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [];
            }
            chunks.push([{ surface_form: " ", pos: "SPACE" }]);
            continue;
        }

        // Punctuation
        if (/^[、。，．！？!?.,:;~…\-—'\"“”「」『』()（）\[\]]+$/.test(surface)) {
            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [];
            }
            chunks.push([token]);
            continue;
        }

        // Decide whether to attach to currentChunk or start a new chunk
        let attach = false;
        if (currentChunk.length > 0 && prev) {
            const prevPos = prev.pos;
            const prevSurface = prev.surface_form || "";

            // 1. Prefix attaches to following
            if (prevPos === "接頭詞") {
                attach = true;
            }
            // 2. Suffix attaches to previous
            else if (pos === "接尾") {
                attach = true;
            }
            // 3. Auxiliary verbs (助動詞) attach to previous verb, adjective, or auxiliary
            else if (pos === "助動詞") {
                attach = true;
            }
            // 4. Te/de particle attaching to verb/adjective
            else if (pos === "助詞" && (surface === "て" || surface === "で" || surface === "ちゃ" || surface === "じゃ") && (prevPos === "動詞" || prevPos === "形容詞" || prevPos === "助動詞")) {
                attach = true;
            }
            // 5. Verb followed by verb auxiliary / compound helper (e.g. 食べ + て + いる, 行き + ます)
            else if (pos === "動詞" && (surface === "い" || surface === "いる" || surface === "おる" || surface === "ある" || surface === "おく" || surface === "みる" || surface === "ゆく" || surface === "いく" || surface === "たい" || surface === "ない") && (prevSurface === "て" || prevSurface === "で" || prevPos === "動詞")) {
                attach = true;
            }
            // 6. Phonetic glides (small tsu or trailing n)
            else if (prevSurface.endsWith("っ") || prevSurface.endsWith("ッ")) {
                attach = true;
            }
        }

        if (attach) {
            currentChunk.push(token);
        } else {
            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
            }
            currentChunk = [token];
        }
    }
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    // Convert each chunk to romaji
    const chunkStrings = chunks.map((chunk) => {
        if (chunk.length === 1 && chunk[0].pos === "SPACE") return " ";

        const first = chunk[0];
        // If punctuation, normalize common Japanese punctuation
        if (/^[、。，．！？!?.,:;~…\-—'\"“”「」『』()（）\[\]]+$/.test(first.surface_form)) {
            return first.surface_form
                .replace(/、/g, ", ")
                .replace(/。/g, ".")
                .replace(/！/g, "!")
                .replace(/？/g, "?")
                .replace(/「/g, '"')
                .replace(/」/g, '"')
                .replace(/『/g, '"')
                .replace(/』/g, '"');
        }

        // Check if any token in this chunk has Japanese characters
        const hasJapanese = chunk.some((t) => /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(t.surface_form || ""));
        if (!hasJapanese) {
            return chunk.map((t) => t.surface_form).join("");
        }

        // Build reading for this Japanese chunk
        let readingStr = "";
        for (const t of chunk) {
            const surface = t.surface_form || "";
            const isJa = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(surface);
            if (!isJa) {
                readingStr += surface;
            } else {
                let r = t.reading && t.reading !== "*" ? t.reading : surface;
                if (t.pos === "助詞") {
                    if (surface === "は") r = "ワ";
                    else if (surface === "へ") r = "エ";
                    else if (surface === "を") r = "ヲ";
                }
                readingStr += r;
            }
        }

        const hira = wanakana.toHiragana(readingStr);
        return wanakana.toRomaji(hira);
    });

    // Format output with spacing
    let result = "";
    for (const str of chunkStrings) {
        if (!str) continue;
        if (str === " ") {
            if (!result.endsWith(" ")) result += " ";
            continue;
        }
        if (/^[,.!?]/.test(str)) {
            result = result.trimEnd() + str;
            continue;
        }
        if (/^[\"'\(\[]/.test(str)) {
            if (result.length > 0 && !result.endsWith(" ")) result += " ";
            result += str;
            continue;
        }
        if (/^[\"')\]]/.test(str)) {
            result = result.trimEnd() + str;
            continue;
        }

        if (result.length > 0 && !result.endsWith(" ")) {
            result += " ";
        }
        result += str;
    }

    return result.trim().replace(/\s{2,}/g, " ");
}

/**
 * Converts a single Japanese string/line to romaji.
 */
export async function convertJapaneseTextToRomaji(text: string): Promise<string> {
    if (!text || !text.trim()) return "";
    const tokenizer = await getTokenizer();
    const tokens = tokenizer.tokenize(text);
    return tokensToRomaji(tokens);
}

export interface ITokenizedJapaneseLine {
    romaji: string;
    phrases: IPhrase[];
}

/**
 * Tokenizes multiple lines of Japanese text, returning both line-level Romaji and tokenized vocabulary phrases.
 */
export async function tokenizeJapaneseLyrics(lines: string[]): Promise<ITokenizedJapaneseLine[]> {
    if (!lines || lines.length === 0) return [];

    const tokenizer = await getTokenizer();
    const results: ITokenizedJapaneseLine[] = [];

    for (const lineText of lines) {
        if (!lineText || !lineText.trim()) {
            results.push({ romaji: "", phrases: [] });
            continue;
        }

        const tokens = tokenizer.tokenize(lineText);
        const lineRomaji = tokensToRomaji(tokens);
        const phrases: IPhrase[] = [];
        let wordOrder = 1;

        for (const token of tokens) {
            const surface = (token.surface_form || "").trim();
            const posPrimary = token.pos;

            // Skip empty tokens, Japanese punctuation, and pure symbols
            if (!isMeaningfulPhrase({ surface_form: surface, part_of_speech: posPrimary })) {
                continue;
            }

            const baseForm = token.basic_form && token.basic_form !== "*" ? token.basic_form : surface;
            const rawReading = token.reading && token.reading !== "*" ? token.reading : surface;
            const hiraganaReading = wanakana.toHiragana(rawReading);
            const romaji = wanakana.toRomaji(hiraganaReading);
            const posEnglish = POS_MAP[posPrimary] || posPrimary;
            const weight = getPhraseWeight(posEnglish);

            phrases.push({
                surface_form: surface,
                dictionary_form: baseForm,
                reading: hiraganaReading,
                romaji: romaji,
                part_of_speech: posEnglish,
                weight: weight,
                meaning: null,
                word_order: wordOrder++
            });
        }

        results.push({
            romaji: lineRomaji,
            phrases: phrases
        });
    }

    return results;
}

export async function tokenizeJapaneseBatch(lines: string[]): Promise<IPhrase[][]> {
    const detailed = await tokenizeJapaneseLyrics(lines);
    return detailed.map((d) => d.phrases);
}
