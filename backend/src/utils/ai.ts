import dotenv from "dotenv";
dotenv.config();

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
    const baseUrl = (process.env.GROQ_BASE_URL || process.env.GROK_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");

    return {
        provider: "groq" as const,
        apiKey,
        model,
        baseUrl,
    };
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

    const testUrl = `${config.baseUrl}/models`;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(testUrl, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${config.apiKey}`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
            },
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (response.ok) {
            return {
                is_configured: true,
                is_available: true,
                status: "available",
                model: config.model,
                provider: "groq",
                message: "Groq AI API key aktif dan siap digunakan (Llama 3.3 70B).",
                checked_at: nowIso
            };
        }

        const statusCode = response.status;
        let errMessage = "";
        try {
            const text = await response.text();
            try {
                const errData: any = JSON.parse(text);
                errMessage = errData?.error?.message || errData?.message || text;
            } catch {
                errMessage = text.slice(0, 200);
            }
        } catch {
            errMessage = response.statusText;
        }

        if (statusCode === 401) {
            return {
                is_configured: true,
                is_available: false,
                status: "invalid_key",
                model: config.model,
                provider: "groq",
                message: `Groq API Key tidak valid (HTTP 401): ${errMessage}`,
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
                message: `Batas kuota / rate limit Groq terlampaui (HTTP 429). ${errMessage}`,
                checked_at: nowIso
            };
        } else {
            return {
                is_configured: true,
                is_available: false,
                status: "error",
                model: config.model,
                provider: "groq",
                message: `Groq API mengembalikan HTTP ${statusCode}: ${errMessage}`,
                checked_at: nowIso
            };
        }
    } catch (err: any) {
        return {
            is_configured: true,
            is_available: false,
            status: "network_error",
            model: config.model,
            provider: "groq",
            message: `Koneksi jaringan ke Groq API gagal: ${err.message || err}`,
            checked_at: nowIso
        };
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

    const apiUrl = `${config.baseUrl}/chat/completions`;
    const requestPayload = {
        model: config.model,
        messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: "Lines:\n" + JSON.stringify(indexedLines) }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2
    };

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 35000);

            const response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${config.apiKey}`,
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
                },
                body: JSON.stringify(requestPayload),
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!response.ok) {
                const errText = await response.text();
                console.error(`[Groq AI Error]: HTTP ${response.status} - ${errText.substring(0, 150)}`);
                if (response.status === 429 && attempt === 0) {
                    await new Promise((r) => setTimeout(r, 2000));
                    continue;
                }
                break;
            }

            const data: any = await response.json();
            const content = data?.choices?.[0]?.message?.content || "";
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
            if (attempt === 0) {
                await new Promise((r) => setTimeout(r, 2000));
                continue;
            }
            console.error("[Groq AI Exception]:", err.message || err);
            break;
        }
    }

    return { row_translations: {}, vocabulary_meanings: {} };
}
