import dotenv from "dotenv";
dotenv.config();
import Groq from "groq-sdk";
import { ProxyAgent, Socks5ProxyAgent, Dispatcher, fetch as undiciFetch } from "undici";

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
    const proxyUrl = (process.env.GROQ_PROXY || process.env.AI_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "").trim();

    return {
        provider: "groq" as const,
        apiKey,
        model,
        baseUrl: baseUrl || undefined,
        proxyUrl: proxyUrl || undefined,
    };
}

function getGroqClient(apiKey: string, baseUrl?: string, proxyUrl?: string): Groq {
    let dispatcher: Dispatcher | undefined;
    if (proxyUrl) {
        try {
            const cleanUrl = proxyUrl.trim();
            if (cleanUrl.startsWith("socks5://") || cleanUrl.startsWith("socks5h://") || cleanUrl.startsWith("socks://")) {
                dispatcher = new Socks5ProxyAgent(cleanUrl.replace(/^socks5h:\/\//, "socks5://"));
            } else {
                dispatcher = new ProxyAgent(cleanUrl);
            }
        } catch (e: any) {
            console.warn(`[Groq Proxy Warning] Failed to initialize ProxyAgent (${proxyUrl}): ${e.message}`);
        }
    }

    const customFetch = dispatcher
        ? ((url: any, init: any) => undiciFetch(url, { ...init, dispatcher }))
        : undefined;
    if (customFetch) {
        (customFetch as any).Response = (globalThis as any).Response;
    }

    return new Groq({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
        maxRetries: 2,
        timeout: 25000,
        ...(customFetch ? { fetch: customFetch as any } : {})
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
        const groq = getGroqClient(config.apiKey, config.baseUrl, config.proxyUrl);
        // Test actual inference availability with a minimal 1-token prompt for the target model
        await groq.chat.completions.create({
            model: config.model,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1
        });

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
        const rawMessage = err?.error?.error?.message || err?.error?.message || err?.message || String(err);
        const errMessage = typeof rawMessage === "string" ? rawMessage.replace(/^\d{3}\s*/, "").trim() : String(rawMessage);

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
                message: `Akses model ${config.model} ditolak Groq (HTTP 403 Forbidden): ${errMessage}. Periksa Model Permissions di Groq Console (console.groq.com).`,
                checked_at: nowIso
            };
        } else if (statusCode === 429) {
            return {
                is_configured: true,
                is_available: false,
                status: "quota_exceeded",
                model: config.model,
                provider: "groq",
                message: `Batas kuota / rate limit Groq terlampaui (HTTP 429): ${errMessage}`,
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
        `You are an expert Japanese-to-${targetLanguage} song translator.\n` +
        `Translate each numbered Japanese lyric line into natural, poetic ${targetLanguage}.\n` +
        `Keep the emotional tone and meaning faithful to the original.\n` +
        `Output strictly valid JSON with this exact schema:\n` +
        `{\n` +
        `  "lines": [\n` +
        `    {"index": 1, "translation": "..."}\n` +
        `  ]\n` +
        `}`;

    const userPayload = { lines: indexedLines };

    const groq = getGroqClient(config.apiKey, config.baseUrl, config.proxyUrl);
    let attempts = 0;
    const maxAttempts = 3;
    let completion: any = null;
    let currentModel = config.model;
    let useJsonMode = true;

    // Allocate sufficient output tokens so structured JSON is never cut off midway
    const maxOutputTokens = Math.min(Math.max(batchRows.length * 150 + 300, 650), 1000);

    while (attempts < maxAttempts) {
        attempts++;
        try {
            const requestOptions: any = {
                model: currentModel,
                messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: "Input Data (respond strictly in the required JSON schema):\n" + JSON.stringify(userPayload) }
                ],
                max_tokens: maxOutputTokens,
                temperature: 0.1
            };

            if (useJsonMode) {
                requestOptions.response_format = { type: "json_object" };
            }

            completion = await groq.chat.completions.create(requestOptions);
            break;
        } catch (err: any) {
            const isRateLimit = err?.status === 429 || err?.statusCode === 429 || String(err).includes("429");
            const isJsonFailed = err?.status === 400 || err?.code === "json_validate_failed" || String(err).includes("json_validate_failed") || String(err).includes("Failed to validate JSON");

            if ((isRateLimit || isJsonFailed) && attempts < maxAttempts) {
                const rawMessage = err?.error?.error?.message || err?.error?.message || err?.message || String(err);

                // If current model failed validation or hit rate limits, switch model to high-capacity Llama models
                const fallbackModels = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
                const nextFallback = fallbackModels.find((m) => m !== currentModel);

                if (isJsonFailed) {
                    console.warn(`[Groq AI JSON Error] 400 json_validate_failed on ${currentModel}. Retrying with model ${nextFallback || currentModel} and flexible format...`);
                    if (nextFallback) currentModel = nextFallback;
                    useJsonMode = false; // Fallback to prompt-guided JSON parsing if strict json_object failed
                    await new Promise((resolve) => setTimeout(resolve, 800));
                    continue;
                }

                if (isRateLimit) {
                    if (nextFallback) {
                        console.warn(`[Groq AI Rate Limit] 429 received on ${currentModel}. Switching fallback model to ${nextFallback}...`);
                        currentModel = nextFallback;
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                        continue;
                    }

                    const match = String(rawMessage).match(/try again in ([\d.]+)s/i);
                    const waitMs = match
                        ? Math.min(Math.ceil(parseFloat(match[1]) * 1000) + 1500, 35000)
                        : attempts * 4000;

                    console.warn(`[Groq AI Rate Limit] 429 received, waiting ${waitMs}ms before retry (attempt ${attempts}/${maxAttempts})...`);
                    await new Promise((resolve) => setTimeout(resolve, waitMs));
                    continue;
                }
            }

            console.error("[Groq AI Exception]:", err?.status || err?.statusCode || "", err?.message || err);
            return { row_translations: {}, vocabulary_meanings: {} };
        }
    }

    try {
        const content = completion?.choices?.[0]?.message?.content || "";
        let cleanText = content.trim();
        if (cleanText.startsWith("```json")) cleanText = cleanText.substring(7);
        else if (cleanText.startsWith("```")) cleanText = cleanText.substring(3);
        if (cleanText.endsWith("```")) cleanText = cleanText.substring(0, cleanText.length - 3);
        cleanText = cleanText.trim();

        // Extract JSON object if surrounded by extra text or tags
        const firstBrace = cleanText.indexOf("{");
        const lastBrace = cleanText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanText = cleanText.substring(firstBrace, lastBrace + 1);
        }

        const parsed = JSON.parse(cleanText);
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

export interface DifficultyDecision {
    difficulty: "easy" | "medium" | "hard";
    target_weight_min: number;
    target_weight_max: number;
    reasoning: string;
    source: "ai" | "heuristic" | "session_history_fallback";
}

/**
 * Instant heuristic calculation of flashcard difficulty based on student's reviews today.
 * Fallback when AI service is unavailable, slow, or rate-limited.
 */
export function calculateDifficultyHeuristic(summary: {
    userLevel: number;
    totalReviewsToday: number;
    ratingsToday: Record<string, number>;
    recentRatings: string[];
    lastRating?: string | null;
}): DifficultyDecision {
    const { userLevel, recentRatings, lastRating } = summary;

    // If user struggled on recent card(s) (rated 'again' or 'hard')
    if (lastRating === "again" || (recentRatings.length >= 2 && recentRatings.slice(-2).includes("again"))) {
        return {
            difficulty: "easy",
            target_weight_min: 1,
            target_weight_max: 6,
            reasoning: "Pengguna baru saja mengalami kesulitan (rating 'again'). Tingkat kesulitan diturunkan ke frasa dasar untuk memperkuat pemahaman.",
            source: "heuristic"
        };
    }

    if (lastRating === "hard") {
        return {
            difficulty: "easy",
            target_weight_min: 2,
            target_weight_max: 7,
            reasoning: "Pengguna menandai kartu terakhir 'hard'. Menurunkan tingkat kesulitan ke kosakata yang lebih sederhana agar tidak kewalahan.",
            source: "heuristic"
        };
    }

    // Check streak of easy / good
    const recentEasyCount = recentRatings.filter((r) => r === "easy").length;
    const recentGoodCount = recentRatings.filter((r) => r === "good").length;

    if (recentEasyCount >= 2 || (lastRating === "easy" && recentGoodCount + recentEasyCount >= 3)) {
        return {
            difficulty: "hard",
            target_weight_min: 8,
            target_weight_max: 10,
            reasoning: "Pengguna konsisten menjawab 'easy' hari ini. Tingkat kesulitan dinaikkan ke kosakata berbobot tinggi (Noun & Verb kompleks).",
            source: "heuristic"
        };
    }

    if (lastRating === "good") {
        return {
            difficulty: "medium",
            target_weight_min: 5,
            target_weight_max: 9,
            reasoning: "Performa pengguna stabil (rating 'good'). Menyajikan kosakata menengah yang seimbang.",
            source: "heuristic"
        };
    }

    // Baseline based on user's current level
    if (userLevel >= 4) {
        return {
            difficulty: "hard",
            target_weight_min: 7,
            target_weight_max: 10,
            reasoning: `Menyesuaikan Level ${userLevel}: menyajikan kosakata berbobot tinggi.`,
            source: "heuristic"
        };
    } else if (userLevel >= 2) {
        return {
            difficulty: "medium",
            target_weight_min: 4,
            target_weight_max: 8,
            reasoning: `Menyesuaikan Level ${userLevel}: menyajikan kosakata umum tingkat menengah.`,
            source: "heuristic"
        };
    }

    return {
        difficulty: "easy",
        target_weight_min: 1,
        target_weight_max: 6,
        reasoning: "Tingkat pemula: menyajikan kosakata dasar yang mudah dipelajari.",
        source: "heuristic"
    };
}

/**
 * Asks Groq AI to evaluate student's review performance today and adjust difficulty for the next card.
 * Uses a 3-second timeout and seamlessly falls back to the deterministic heuristic.
 */
export async function decideDifficultyWithAi(summary: {
    userLevel: number;
    totalReviewsToday: number;
    ratingsToday: Record<string, number>;
    recentRatings: string[];
    lastRating?: string | null;
}): Promise<DifficultyDecision> {
    const config = getAiConfig();
    const fallback = calculateDifficultyHeuristic(summary);

    if (!config.apiKey) {
        return fallback;
    }

    const systemPrompt =
        "You are Flashku's adaptive Japanese learning difficulty AI.\n" +
        "Analyze the student's flashcard review performance today and decide the optimal difficulty for the NEXT flashcard.\n" +
        "Rules:\n" +
        "- If user recently rated 'again' or 'hard', DECREASE difficulty to 'easy' (min_weight: 1-2, max_weight: 5-7) so they don't get overwhelmed.\n" +
        "- If user recently rated 'easy' or consecutive 'good', INCREASE difficulty to 'hard' (min_weight: 8, max_weight: 10) to challenge them.\n" +
        "- If performance is balanced or normal, maintain 'medium' (min_weight: 5, max_weight: 8).\n" +
        "- Output strictly valid JSON with keys:\n" +
        '  "difficulty": "easy" | "medium" | "hard",\n' +
        '  "target_weight_min": number (1-10),\n' +
        '  "target_weight_max": number (1-10),\n' +
        '  "reasoning": "1 short sentence in Indonesian explaining the decision based on today\'s reviews"\n';

    const userPrompt =
        "Input Data for difficulty decision (respond in JSON format):\n" +
        JSON.stringify({
            user_level: summary.userLevel,
            total_reviews_today: summary.totalReviewsToday,
            ratings_breakdown_today: summary.ratingsToday,
            recent_ratings_order: summary.recentRatings,
            last_rating: summary.lastRating || null
        });

    try {
        const groq = getGroqClient(config.apiKey, config.baseUrl, config.proxyUrl);

        // Limit timeout to 3000ms so study session responses stay snappy
        const aiPromise = groq.chat.completions.create({
            model: config.model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
            max_tokens: 250,
            temperature: 0.2
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("AI difficulty decision timeout")), 3000)
        );

        const completion = await Promise.race([aiPromise, timeoutPromise]);
        const content = completion?.choices?.[0]?.message?.content || "";
        let cleanText = content.trim();
        const firstBrace = cleanText.indexOf("{");
        const lastBrace = cleanText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanText = cleanText.substring(firstBrace, lastBrace + 1);
        }

        const parsed = JSON.parse(cleanText);
        if (
            parsed.difficulty &&
            typeof parsed.target_weight_min === "number" &&
            typeof parsed.target_weight_max === "number"
        ) {
            const validDifficulty = ["easy", "medium", "hard"].includes(parsed.difficulty)
                ? (parsed.difficulty as "easy" | "medium" | "hard")
                : fallback.difficulty;

            return {
                difficulty: validDifficulty,
                target_weight_min: Math.max(1, Math.min(10, parsed.target_weight_min)),
                target_weight_max: Math.max(1, Math.min(10, parsed.target_weight_max)),
                reasoning:
                    typeof parsed.reasoning === "string" && parsed.reasoning.trim()
                        ? parsed.reasoning.trim()
                        : fallback.reasoning,
                source: "ai"
            };
        }
        return fallback;
    } catch (err: any) {
        console.warn(`[AI Difficulty Decision Notice]: ${err?.message || err}. Using heuristic.`);
        return fallback;
    }
}
