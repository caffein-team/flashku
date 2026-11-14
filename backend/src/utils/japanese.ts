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
 * Validates whether a phrase is a meaningful linguistic token for flashcard study,
 * rejecting empty strings, standalone punctuation, pure symbols, or standalone choonpu marks.
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

    // Must contain at least one linguistic letter (Kanji, Hiragana, Katakana, Latin, etc.)
    return /\p{L}/u.test(stripped);
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

export async function tokenizeJapaneseBatch(lines: string[]): Promise<IPhrase[][]> {
    if (!lines || lines.length === 0) return [];

    const tokenizer = await getTokenizer();
    const results: IPhrase[][] = [];

    for (const lineText of lines) {
        if (!lineText || !lineText.trim()) {
            results.push([]);
            continue;
        }

        const tokens = tokenizer.tokenize(lineText);
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

        results.push(phrases);
    }

    return results;
}
