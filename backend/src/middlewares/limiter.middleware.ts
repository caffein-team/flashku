import rateLimit from "express-rate-limit";

export function createLimiter(limit: number, windowMs: number = 60 * 1000) {
    return rateLimit({
        windowMs,
        max: limit,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            detail: `Too Many Requests: Rate limit exceeded (${limit} requests per minute)`,
        },
    });
}
