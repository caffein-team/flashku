import kuromoji from "kuromoji";
import path from "path";

// Part of Speech mapping
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

// Kana to Romaji mapping table
const KANA_ROMAJI_MAP: Record<string, string> = {
    "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
    "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
    "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
    "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
    "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
    "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
    "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
    "や": "ya", "ゆ": "yu", "よ": "yo",
    "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
    "わ": "wa", "を": "wo", "ん": "n",
    "が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go",
    "ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo",
    "だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do",
    "ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo",
    "ぱ": "pa", "ぴ": "pi", "ぷ": "pu", "ぺ": "pe", "ぽ": "po",
    "きゃ": "kya", "きゅ": "kyu", "きょ": "kyo",
    "しゃ": "sha", "しゅ": "shu", "しょ": "sho",
    "ちゃ": "cha", "ちゅ": "chu", "ちょ": "cho",
    "にゃ": "nya", "にゅ": "nyu", "にょ": "nyo",
    "ひゃ": "hya", "ひゅ": "hyu", "ひょ": "hyo",
    "みゃ": "mya", "みゅ": "myu", "みょ": "myo",
    "りゃ": "rya", "りゅ": "ryu", "りょ": "ryo",
    "ぎゃ": "gya", "ぎゅ": "gyu", "ぎょ": "gyo",
    "じゃ": "ja", "じゅ": "ju", "じょ": "jo",
    "びゃ": "bya", "びゅ": "byu", "びょ": "byo",
    "ぴゃ": "pya", "ぴゅ": "pyu", "ぴょ": "pyo",
    "っ": "",
};

export function katakanaToHiragana(text: string): string {
    if (!text) return "";
    const result: string[] = [];
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code >= 0x30a1 && code <= 0x30f6) {
            result.push(String.fromCharCode(code - 0x60));
        } else {
            result.push(text[i]);
        }
    }
    return result.join("");
}

export function hiraganaToRomaji(text: string): string {
    if (!text) return "";
    const romaji: string[] = [];
    let i = 0;
    const length = text.length;
    while (i < length) {
        // Check two-character compound kana first (e.g. きゃ)
        if (i + 1 < length && KANA_ROMAJI_MAP[text.slice(i, i + 2)]) {
            romaji.push(KANA_ROMAJI_MAP[text.slice(i, i + 2)]);
            i += 2;
        }
        // Small tsu (sokuon) - double the following consonant
        else if (text[i] === "っ" && i + 1 < length) {
            const nextChar = text[i + 1];
            const nextRomaji = KANA_ROMAJI_MAP[nextChar] || "";
            if (nextRomaji) {
                romaji.push(nextRomaji[0]);
            }
            i += 1;
        } else if (KANA_ROMAJI_MAP[text[i]]) {
            romaji.push(KANA_ROMAJI_MAP[text[i]]);
            i += 1;
        } else {
            romaji.push(text[i]);
            i += 1;
        }
    }
    return romaji.join("");
}

let tokenizerInstance: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null;
let tokenizerInitPromise: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | null = null;

export async function getTokenizer(): Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> {
    if (tokenizerInstance) {
        return tokenizerInstance;
    }
    if (tokenizerInitPromise) {
        return tokenizerInitPromise;
    }

    tokenizerInitPromise = new Promise((resolve, reject) => {
        // Dict path relative to project root or node_modules
        const dicPath = path.resolve(process.cwd(), "node_modules/kuromoji/dict");
        kuromoji.builder({ dicPath }).build((err, tokenizer) => {
            if (err) {
                tokenizerInitPromise = null;
                reject(err);
            } else {
                tokenizerInstance = tokenizer;
                resolve(tokenizer);
            }
        });
    });

    return tokenizerInitPromise;
}

export interface TokenizedPhrase {
    surface_form: string;
    dictionary_form: string;
    reading: string;
    romaji: string;
    romanization: string;
    part_of_speech: string;
    meaning: string | null;
    word_order: number;
}

export async function tokenizeJapaneseLyric(lyricText: string): Promise<TokenizedPhrase[]> {
    if (!lyricText || !lyricText.trim()) {
        return [];
    }

    const tokenizer = await getTokenizer();
    const tokens = tokenizer.tokenize(lyricText);
    const phrases: TokenizedPhrase[] = [];
    let wordOrder = 1;

    for (const token of tokens) {
        const surface = (token.surface_form || "").trim();
        const posPrimary = token.pos || "";
        // Skip pure symbols, whitespace, and punctuation
        if (!surface || posPrimary === "記号") {
            continue;
        }

        const baseForm = token.basic_form && token.basic_form !== "*" ? token.basic_form : surface;
        const rawReading = token.reading && token.reading !== "*" ? token.reading : surface;
        const hiraganaReading = katakanaToHiragana(rawReading);
        const romaji = hiraganaToRomaji(hiraganaReading);
        const posEnglish = POS_MAP[posPrimary] || posPrimary;

        phrases.push({
            surface_form: surface,
            dictionary_form: baseForm,
            reading: hiraganaReading,
            romaji: romaji,
            romanization: romaji,
            part_of_speech: posEnglish,
            meaning: null,
            word_order: wordOrder++,
        });
    }

    return phrases;
}
