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

            phrases.push({
                surface_form: surface,
                dictionary_form: baseForm,
                reading: hiraganaReading,
                romaji: romaji,
                part_of_speech: posEnglish,
                meaning: null,
                word_order: wordOrder++
            });
        }

        results.push(phrases);
    }

    return results;
}
