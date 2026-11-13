import dotenv from "dotenv";
import { fetch as undiciFetch, ProxyAgent } from "undici";
dotenv.config();

function getGeminiDispatcher() {
    const proxyUrl = process.env.GEMINI_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (proxyUrl) {
        try {
            return new ProxyAgent(proxyUrl.trim());
        } catch (e: any) {
            console.warn(`[Gemini Proxy Warning] Failed to initialize ProxyAgent (${proxyUrl}): ${e.message}`);
        }
    }
    return undefined;
}

export interface GeminiQuotaStatus {
    is_configured: boolean;
    is_available: boolean;
    status: "available" | "quota_exceeded" | "invalid_key" | "not_configured" | "network_error" | "error" | "unknown";
    model: string;
    message: string;
    checked_at: string;
}

export interface GeminiEnrichResult {
    row_translations: Record<string, string>;
    vocabulary_meanings: Record<string, string>;
}

export async function checkGeminiQuotaStatus(): Promise<GeminiQuotaStatus> {
    const rawKey = process.env.GEMINI_API_KEY || "";
    const apiKey = rawKey.replace(/^"|"$/g, "").trim();
    const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
    const nowIso = new Date().toISOString();

    if (!apiKey) {
        return {
            is_configured: false,
            is_available: false,
            status: "not_configured",
            model: model,
            message: "GEMINI_API_KEY belum dikonfigurasi di file .env. Masukkan API key dari Google AI Studio.",
            checked_at: nowIso
        };
    }

    const baseUrl = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
    const testUrl = `${baseUrl}/models?key=${apiKey}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const dispatcher = getGeminiDispatcher();
        const fetchOptions: any = {
            method: "GET",
            headers: {
                "User-Agent": "FlashkuApp/1.0"
            },
            signal: controller.signal
        };
        if (dispatcher) {
            fetchOptions.dispatcher = dispatcher;
        }

        const response = await undiciFetch(testUrl, fetchOptions);

        clearTimeout(timeout);

        if (response.ok) {
            return {
                is_configured: true,
                is_available: true,
                status: "available",
                model: model,
                message: "Gemini API key aktif dan kuota tersedia.",
                checked_at: nowIso
            };
        }

        const statusCode = response.status;
        let errMessage = "";
        try {
            const errData: any = await response.json();
            errMessage = errData?.error?.message || "";
        } catch {
            errMessage = response.statusText;
        }

        if (statusCode === 429) {
            return {
                is_configured: true,
                is_available: false,
                status: "quota_exceeded",
                model: model,
                message: `Kuota Gemini API telah mencapai batas limit (HTTP 429). ${errMessage}`,
                checked_at: nowIso
            };
        } else if (statusCode === 400 || statusCode === 403) {
            return {
                is_configured: true,
                is_available: false,
                status: "invalid_key",
                model: model,
                message: `API key tidak valid atau tidak memiliki izin akses (HTTP ${statusCode}). ${errMessage}`,
                checked_at: nowIso
            };
        } else {
            return {
                is_configured: true,
                is_available: false,
                status: "error",
                model: model,
                message: `Gemini API mengembalikan HTTP ${statusCode}: ${errMessage}`,
                checked_at: nowIso
            };
        }
    } catch (err: any) {
        const causeMsg = err.cause ? ` (${err.cause.message || err.cause})` : "";
        return {
            is_configured: true,
            is_available: false,
            status: "network_error",
            model: model,
            message: `Koneksi jaringan ke Gemini API gagal: ${err.message || err}${causeMsg}`,
            checked_at: nowIso
        };
    }
}

export async function enrichBatchWithGemini(
    batchRows: { id: string | number; raw_text: string }[],
    targetLanguage: string = "Indonesian"
): Promise<GeminiEnrichResult> {
    const rawKey = process.env.GEMINI_API_KEY || "";
    const apiKey = rawKey.replace(/^"|"$/g, "").trim();
    const model = process.env.GEMINI_MODEL || "gemini-flash-latest";

    if (!apiKey || !batchRows || batchRows.length === 0) {
        return { row_translations: {}, vocabulary_meanings: {} };
    }

    const indexedLines = batchRows.map((r, idx) => ({
        index: idx + 1,
        text: r.raw_text
    }));
    const idxToRowId = new Map<number, string | number>();
    batchRows.forEach((r, idx) => {
        idxToRowId.set(idx + 1, r.id);
    });

    const systemInstruction =
        `You are an expert Japanese-to-${targetLanguage} translator and language tutor.\n` +
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
                    { text: "Lines:\n" + JSON.stringify(indexedLines) }
                ]
            }
        ],
        generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.2
        }
    };

    const baseUrl = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
    const apiUrl = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 35000);

            const dispatcher = getGeminiDispatcher();
            const fetchOptions: any = {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": "FlashkuApp/1.0"
                },
                body: JSON.stringify(requestPayload),
                signal: controller.signal
            };
            if (dispatcher) {
                fetchOptions.dispatcher = dispatcher;
            }

            const response = await undiciFetch(apiUrl, fetchOptions);

            clearTimeout(timeout);

            if (!response.ok) {
                if (response.status === 503 && attempt === 0) {
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    continue;
                }
                const errText = await response.text();
                console.error(`[Gemini Enrichment Error]: HTTP ${response.status} - ${errText.substring(0, 150)}`);
                break;
            }

            const data: any = await response.json();
            const candidate = data?.candidates?.[0];
            const textContent = candidate?.content?.parts?.[0]?.text || "";

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
                    const lineIdx = item.index;
                    const rowId = idxToRowId.get(lineIdx);
                    if (rowId !== undefined) {
                        rowTranslations[String(rowId)] = item.translation || "";
                    }
                }
            }

            const vocabularyMeanings: Record<string, string> =
                parsed.vocabulary && typeof parsed.vocabulary === "object" ? parsed.vocabulary : {};

            return {
                row_translations: rowTranslations,
                vocabulary_meanings: vocabularyMeanings
            };
        } catch (err: any) {
            if (attempt === 0) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
                continue;
            }
            console.error("[Gemini Enrichment Exception]:", err.message || err);
            break;
        }
    }

    return { row_translations: {}, vocabulary_meanings: {} };
}
