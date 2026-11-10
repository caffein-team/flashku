export interface GeminiQuotaStatus {
    is_configured: boolean;
    is_available: boolean;
    status: "available" | "quota_exceeded" | "invalid_key" | "not_configured" | "error" | "network_error" | "unknown";
    model: string;
    message: string;
    checked_at: string;
}

export async function checkGeminiQuotaStatus(): Promise<GeminiQuotaStatus> {
    const rawApiKey = process.env.GEMINI_API_KEY || "";
    const apiKey = rawApiKey.replace(/^["']|["']$/g, "").trim();
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const nowIso = new Date().toISOString();

    if (!apiKey) {
        return {
            is_configured: false,
            is_available: false,
            status: "not_configured",
            model,
            message: "GEMINI_API_KEY belum dikonfigurasi di file .env. Masukkan API key dari Google AI Studio.",
            checked_at: nowIso,
        };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const resp = await fetch(url, {
            headers: { "User-Agent": "AmbacodixApp/1.0" },
            signal: AbortSignal.timeout(8000),
        });

        if (resp.ok) {
            return {
                is_configured: true,
                is_available: true,
                status: "available",
                model,
                message: "Gemini API key aktif dan kuota tersedia.",
                checked_at: nowIso,
            };
        }

        const errBody: any = await resp.json().catch(() => ({}));
        const errMsg = errBody?.error?.message || "";

        if (resp.status === 429) {
            return {
                is_configured: true,
                is_available: false,
                status: "quota_exceeded",
                model,
                message: `Kuota Gemini API telah mencapai batas limit (HTTP 429). ${errMsg}`,
                checked_at: nowIso,
            };
        } else if (resp.status === 400 || resp.status === 403) {
            return {
                is_configured: true,
                is_available: false,
                status: "invalid_key",
                model,
                message: `API key tidak valid atau tidak memiliki izin akses (HTTP ${resp.status}). ${errMsg}`,
                checked_at: nowIso,
            };
        } else {
            return {
                is_configured: true,
                is_available: false,
                status: "error",
                model,
                message: `Gemini API mengembalikan HTTP ${resp.status}: ${errMsg}`,
                checked_at: nowIso,
            };
        }
    } catch (err: any) {
        return {
            is_configured: true,
            is_available: false,
            status: "network_error",
            model,
            message: `Koneksi jaringan ke Gemini API gagal: ${err?.message || err}`,
            checked_at: nowIso,
        };
    }
}

export interface BatchEnrichResult {
    row_translations: Record<string, string>;
    vocabulary_meanings: Record<string, string>;
}

export async function enrichBatchWithGemini(
    batchRows: { id: string; raw_text: string }[],
    targetLanguage: string = "Indonesian"
): Promise<BatchEnrichResult> {
    const rawApiKey = process.env.GEMINI_API_KEY || "";
    const apiKey = rawApiKey.replace(/^["']|["']$/g, "").trim();
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";

    if (!apiKey || batchRows.length === 0) {
        return { row_translations: {}, vocabulary_meanings: {} };
    }

    const indexedLines = batchRows.map((r, idx) => ({ index: idx + 1, text: r.raw_text }));
    const idxToRowId = new Map<number, string>(batchRows.map((r, idx) => [idx + 1, r.id]));

    const systemInstruction =
        `You are an expert Japanese-to-${targetLanguage} translator and language tutor. ` +
        `Given numbered song lyric lines, provide:\n` +
        `1. A natural, poetic yet accurate translation of each numbered lyric line into ${targetLanguage}.\n` +
        `2. A concise, contextual meaning for each key vocabulary word or phrase in ${targetLanguage}.\n` +
        `Output strictly valid JSON with this exact schema:\n` +
        `{\n` +
        `  "lines": [\n` +
        `    {"index": 1, "translation": "..."}\n` +
        `  ],\n` +
        `  "vocabulary": {\n` +
        `    "word": "meaning in ${targetLanguage}"\n` +
        `  }\n` +
        `}`;

    const requestPayload = {
        contents: [
            {
                parts: [
                    { text: systemInstruction },
                    { text: "Lines:\n" + JSON.stringify(indexedLines) },
                ],
            },
        ],
        generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.2,
        },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const resp = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": "AmbacodixApp/1.0",
                },
                body: JSON.stringify(requestPayload),
                signal: AbortSignal.timeout(35000),
            });

            if (!resp.ok) {
                if (resp.status === 503 && attempt === 0) {
                    await new Promise((res) => setTimeout(res, 2000));
                    continue;
                }
                const errText = await resp.text();
                console.error(`Gemini enrichment HTTP ${resp.status}: ${errText.slice(0, 150)}`);
                break;
            }

            const resultJson: any = await resp.json();
            const candidates = resultJson.candidates || [];
            if (candidates.length === 0) {
                return { row_translations: {}, vocabulary_meanings: {} };
            }

            let textContent: string = candidates[0]?.content?.parts?.[0]?.text || "";
            let cleanText = textContent.trim();
            if (cleanText.startsWith("```json")) {
                cleanText = cleanText.substring(7);
            } else if (cleanText.startsWith("```")) {
                cleanText = cleanText.substring(3);
            }
            if (cleanText.endsWith("```")) {
                cleanText = cleanText.substring(0, cleanText.length - 3);
            }
            cleanText = cleanText.trim();

            const parsed = JSON.parse(cleanText);

            const rowTranslations: Record<string, string> = {};
            if (Array.isArray(parsed.lines)) {
                for (const item of parsed.lines) {
                    const rowId = idxToRowId.get(item.index);
                    if (rowId && item.translation) {
                        rowTranslations[rowId] = item.translation;
                    }
                }
            }

            const vocabularyMeanings: Record<string, string> =
                parsed.vocabulary && typeof parsed.vocabulary === "object" ? parsed.vocabulary : {};

            return {
                row_translations: rowTranslations,
                vocabulary_meanings: vocabularyMeanings,
            };
        } catch (err: any) {
            if (attempt === 0) {
                console.warn(`Gemini enrichment call error (${err?.message || err}), retrying once...`);
                await new Promise((res) => setTimeout(res, 2000));
                continue;
            }
            console.error("Gemini enrichment call failed:", err);
            break;
        }
    }

    return { row_translations: {}, vocabulary_meanings: {} };
}
