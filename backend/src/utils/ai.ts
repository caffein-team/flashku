import dotenv from "dotenv";
dotenv.config();
import Groq from "groq-sdk";

export interface AiQuotaStatus {
    is_configured: boolean;
    is_available: boolean;
    status: "available" | "quota_exceeded" | "invalid_key" | "not_configured" | "network_error" | "error" | "unknown";
    model: string;
    message: string;
    checked_at: string;
    provider: "groq";
}

export interface AiEnrichResult {
    row_translations: Record<string, string>;
    vocabulary_meanings: Record<string, string>;
}

function getAiConfig() {
    const apiKey = (process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "").replace(/^"|"$/g, "").trim();
    const model = process.env.GROQ_MODEL || process.env.GROK_MODEL || "llama-3.3-70b-versatile";
    const baseUrl = (process.env.GROQ_BASE_URL || process.env.GROK_BASE_URL || "").replace(/\/+$/, "").trim();

    return {
        provider: "groq" as const,
        apiKey,
        model,
        baseUrl: baseUrl || undefined,
    };
}

function getGroqClient(apiKey: string, baseUrl?: string): Groq {
    return new Groq({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
        maxRetries: 2,
        timeout: 25000
    });
}

export async function checkAiQuotaStatus(): Promise<AiQuotaStatus> {
    const config = getAiConfig();
    const nowIso = new Date().toISOString();

    if (!config.apiKey) {
        return {
            is_configured: false,
            is_available: false,
            status: "not_configured",
            model: config.model,
            provider: "groq",
            message: "GROQ_API_KEY belum dikonfigurasi di file .env. Masukkan API key dari https://console.groq.com/keys",
            checked_at: nowIso
        };
    }

    try {
        const groq = getGroqClient(config.apiKey, config.baseUrl);
        await groq.models.list();

        return {
            is_configured: true,
            is_available: true,
            status: "available",
            model: config.model,
            provider: "groq",
            message: `Groq AI API key aktif dan siap digunakan (${config.model}).`,
            checked_at: nowIso
        };
    } catch (err: any) {
        const statusCode = err?.status || err?.statusCode;
        const errMessage = err?.message || String(err);

        if (statusCode === 401) {
            return {
                is_configured: true,
                is_available: false,
                status: "invalid_key",
                model: config.model,
                provider: "groq",
                message: `Groq API Key tidak valid (HTTP 401). Silakan periksa GROQ_API_KEY di .env.`,
                checked_at: nowIso
            };
        } else if (statusCode === 403) {
            return {
                is_configured: true,
                is_available: false,
                status: "error",
                model: config.model,
                provider: "groq",
                message: `Akses ditolak Groq (HTTP 403 Forbidden): ${errMessage}`,
                checked_at: nowIso
            };
        } else if (statusCode === 429) {
            return {
                is_configured: true,
                is_available: false,
                status: "quota_exceeded",
                model: config.model,
                provider: "groq",
                message: `Batas kuota / rate limit Groq terlampaui (HTTP 429).`,
                checked_at: nowIso
            };
        } else {
            return {
                is_configured: true,
                is_available: false,
                status: statusCode ? "error" : "network_error",
                model: config.model,
                provider: "groq",
                message: statusCode
                    ? `Groq API mengembalikan HTTP ${statusCode}: ${errMessage}`
                    : `Koneksi jaringan ke Groq API gagal: ${errMessage}`,
                checked_at: nowIso
            };
        }
    }
}

export async function enrichBatchWithAi(
    batchRows: { id: string | number; raw_text: string }[],
    targetLanguage: string = "Indonesian"
): Promise<AiEnrichResult> {
    const config = getAiConfig();

    if (!config.apiKey || !batchRows || batchRows.length === 0) {
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

    try {
        const groq = getGroqClient(config.apiKey, config.baseUrl);
        const completion = await groq.chat.completions.create({
            model: config.model,
            messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: "Lines:\n" + JSON.stringify(indexedLines) }
            ],
            response_format: { type: "json_object" },
            temperature: 0.2
        });

        const content = completion.choices?.[0]?.message?.content || "";
        let cleanText = content.trim();
        if (cleanText.startsWith("```json")) cleanText = cleanText.substring(7);
        else if (cleanText.startsWith("```")) cleanText = cleanText.substring(3);
        if (cleanText.endsWith("```")) cleanText = cleanText.substring(0, cleanText.length - 3);

        const parsed = JSON.parse(cleanText.trim());
        const rowTranslations: Record<string, string> = {};

        if (Array.isArray(parsed.lines)) {
            for (const item of parsed.lines) {
                const rowId = idxToRowId.get(item.index);
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
        console.error("[Groq AI Exception]:", err.message || err);
        return { row_translations: {}, vocabulary_meanings: {} };
    }
}
