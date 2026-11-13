import { Application, Request, Response, NextFunction } from "express";
import swaggerUi from "swagger-ui-express";
import dotenv from "dotenv";

dotenv.config();

const appUrl = (process.env.APP_URL || process.env.BASE_URL || "").trim().replace(/\/+$/, "");
const port = process.env.PORT || 5000;

const configuredServers: Array<{ url: string; description: string }> = [];

if (appUrl) {
    configuredServers.push({
        url: appUrl,
        description: `Production / Tunnel Server (${appUrl})`
    });
}

configuredServers.push(
    {
        url: "/",
        description: "Auto Relative Path (Same Domain / Tunnel)"
    },
    {
        url: `http://127.0.0.1:${port}`,
        description: `Local Development (http://127.0.0.1:${port})`
    }
);

export const swaggerSpec = {
    openapi: "3.0.0",
    info: {
        title: "Flashku API Documentation",
        version: "1.0.0",
        description: "Dokumentasi REST API Flashku - Pembelajaran Bahasa Jepang berbasis Musik, Lirik Sinkron LRC, dan SRS Flashcard."
    },
    servers: configuredServers,
    components: {
        securitySchemes: {
            BearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
                description: "Masukkan JWT Access Token hasil login (Format: Bearer <token>)"
            }
        },
        schemas: {
            StandardResponse: {
                type: "object",
                properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "Operation completed successfully" },
                    data: { type: "object" }
                }
            },
            ErrorResponse: {
                type: "object",
                properties: {
                    status: { type: "string", example: "fail" },
                    message: { type: "string", example: "Invalid input" },
                    errors: { type: "object" }
                }
            }
        }
    },
    paths: {
        "/api/health": {
            get: {
                tags: ["System"],
                summary: "Health Check",
                responses: {
                    200: { description: "Application running well" }
                }
            }
        },
        "/api/auth/register": {
            post: {
                tags: ["Auth"],
                summary: "Register new user",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["name", "email", "password"],
                                properties: {
                                    name: { type: "string", example: "John Doe" },
                                    email: { type: "string", format: "email", example: "user@example.com" },
                                    password: { type: "string", minLength: 6, example: "password123" }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: "User registered successfully" },
                    400: { description: "Validation error" }
                }
            }
        },
        "/api/auth/login": {
            post: {
                tags: ["Auth"],
                summary: "User login",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["identifier", "password"],
                                properties: {
                                    identifier: { type: "string", example: "user@example.com" },
                                    password: { type: "string", example: "password123" }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: "Login successful, returns JWT token" },
                    400: { description: "Invalid credentials" }
                }
            }
        },
        "/api/auth/verify/send-otp": {
            post: {
                tags: ["Auth"],
                summary: "Send email verification OTP",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["email"],
                                properties: {
                                    email: { type: "string", format: "email", example: "user@example.com" }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: "OTP sent to email" }
                }
            }
        },
        "/api/auth/verify/confirm-otp": {
            post: {
                tags: ["Auth"],
                summary: "Confirm email verification OTP",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["email", "otp"],
                                properties: {
                                    email: { type: "string", format: "email", example: "user@example.com" },
                                    otp: { type: "string", example: "123456" }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: "Email verified successfully" }
                }
            }
        },
        "/api/users/profile": {
            patch: {
                tags: ["Users"],
                summary: "Update current user's profile (name, username)",
                security: [{ BearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    name: { type: "string", example: "John Updated" },
                                    username: { type: "string", example: "flashku_user" }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: "Profile updated successfully" },
                    400: { description: "Validation error or username taken" }
                }
            }
        },
        "/api/users/avatar": {
            post: {
                tags: ["Users"],
                summary: "Upload user avatar image (Max 5MB)",
                security: [{ BearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        "multipart/form-data": {
                            schema: {
                                type: "object",
                                required: ["file"],
                                properties: {
                                    file: { type: "string", format: "binary" }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: "Avatar uploaded successfully" },
                    400: { description: "Invalid file or size exceeded" }
                }
            },
            delete: {
                tags: ["Users"],
                summary: "Delete current user's avatar",
                security: [{ BearerAuth: [] }],
                responses: {
                    200: { description: "Avatar deleted successfully" }
                }
            }
        },
        "/api/users/change-password": {
            post: {
                tags: ["Users"],
                summary: "Change user password",
                security: [{ BearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["current_password", "new_password"],
                                properties: {
                                    current_password: { type: "string", example: "oldpassword123" },
                                    new_password: { type: "string", minLength: 6, example: "newpassword123" }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: "Password changed successfully" },
                    400: { description: "Current password incorrect or validation error" }
                }
            }
        },
        "/api/users/account": {
            delete: {
                tags: ["Users"],
                summary: "Permanently delete account and all user data",
                security: [{ BearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["password"],
                                properties: {
                                    password: { type: "string", example: "password123" }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: "Account successfully deleted" },
                    400: { description: "Password incorrect" }
                }
            }
        },
        "/api/songs/import": {
            post: {
                tags: ["Songs"],
                summary: "Import YouTube song: extracts audio, fetches/parses lyrics & tokenizes Japanese vocabulary",
                security: [{ BearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["youtube_url"],
                                properties: {
                                    youtube_url: { type: "string", example: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
                                    custom_lrc: { type: "string", example: "[00:12.00]Lyric line here" },
                                    custom_title: { type: "string", example: "Song Title" },
                                    custom_artist: { type: "string", example: "Artist Name" },
                                    language: { type: "string", example: "ja" }
                                }
                            }
                        }
                    }
                },
                responses: {
                    201: { description: "Song imported successfully" },
                    400: { description: "Invalid YouTube URL" }
                }
            }
        },
        "/api/songs": {
            get: {
                tags: ["Songs"],
                summary: "List all songs saved in current user's library",
                security: [{ BearerAuth: [] }],
                parameters: [
                    { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
                    { name: "offset", in: "query", schema: { type: "integer", default: 0 } }
                ],
                responses: {
                    200: { description: "List of user songs" }
                }
            }
        },
        "/api/songs/ai/quota": {
            get: {
                tags: ["Songs"],
                summary: "Check AI API quota, key configuration and live availability status",
                security: [{ BearerAuth: [] }],
                responses: {
                    200: { description: "AI API live quota status" }
                }
            }
        },
        "/api/songs/{id}": {
            get: {
                tags: ["Songs"],
                summary: "Get song details including timestamped lyric rows and tokenized phrases",
                security: [{ BearerAuth: [] }],
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } }
                ],
                responses: {
                    200: { description: "Song details with lyrics and phrases" },
                    404: { description: "Song not found" }
                }
            },
            delete: {
                tags: ["Songs"],
                summary: "Remove a song from current user's library and decks",
                security: [{ BearerAuth: [] }],
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } }
                ],
                responses: {
                    200: { description: "Song removed from library successfully" },
                    404: { description: "Song not found in library" }
                }
            }
        },
        "/api/songs/{id}/enrich-ai": {
            post: {
                tags: ["Songs"],
                summary: "Run or re-run AI to translate lyric lines and enrich phrase meanings in context",
                security: [{ BearerAuth: [] }],
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                    { name: "target_language", in: "query", schema: { type: "string", default: "Indonesian" } }
                ],
                responses: {
                    200: { description: "AI translation and contextual meanings applied" }
                }
            }
        },
        "/api/songs/{id}/favorite": {
            post: {
                tags: ["Songs"],
                summary: "Toggle favorite status for a song in user's library",
                security: [{ BearerAuth: [] }],
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } }
                ],
                responses: {
                    200: { description: "Favorite status toggled" }
                }
            }
        },
        "/api/songs/{id}/lyrics": {
            put: {
                tags: ["Songs"],
                summary: "Update or upload manual/custom lyrics (synced LRC or plain text) for a song",
                security: [{ BearerAuth: [] }],
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } }
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    custom_lrc: { type: "string", example: "[00:10.50]Line 1\n[00:15.20]Line 2" },
                                    plain_lyrics: { type: "string", example: "Line 1\nLine 2" }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: "Lyrics updated successfully" }
                }
            }
        },
        "/api/decks": {
            post: {
                tags: ["Decks"],
                summary: "Create a new song deck (collection/playlist) for current user",
                security: [{ BearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["name"],
                                properties: {
                                    name: { type: "string", example: "Anime Openings" },
                                    description: { type: "string", example: "Favorite Japanese anime themes" }
                                }
                            }
                        }
                    }
                },
                responses: {
                    201: { description: "Deck created successfully" }
                }
            },
            get: {
                tags: ["Decks"],
                summary: "List all song decks created by the current user",
                security: [{ BearerAuth: [] }],
                parameters: [
                    { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
                    { name: "offset", in: "query", schema: { type: "integer", default: 0 } }
                ],
                responses: {
                    200: { description: "List of decks" }
                }
            }
        },
        "/api/decks/{id}": {
            get: {
                tags: ["Decks"],
                summary: "Get deck details including all songs grouped inside this deck",
                security: [{ BearerAuth: [] }],
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } }
                ],
                responses: {
                    200: { description: "Deck details with song list" },
                    404: { description: "Deck not found" }
                }
            },
            put: {
                tags: ["Decks"],
                summary: "Update deck name or description",
                security: [{ BearerAuth: [] }],
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } }
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    name: { type: "string", example: "Updated Deck Name" },
                                    description: { type: "string", example: "Updated Description" }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: "Deck updated successfully" }
                }
            },
            delete: {
                tags: ["Decks"],
                summary: "Delete a song deck",
                security: [{ BearerAuth: [] }],
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } }
                ],
                responses: {
                    200: { description: "Deck deleted successfully" }
                }
            }
        },
        "/api/decks/{id}/songs": {
            post: {
                tags: ["Decks"],
                summary: "Add a song into this deck",
                security: [{ BearerAuth: [] }],
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } }
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["song_id"],
                                properties: {
                                    song_id: { type: "string", example: "673000000000000000000000" }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: "Song added to deck successfully" }
                }
            }
        },
        "/api/decks/{id}/songs/{song_id}": {
            delete: {
                tags: ["Decks"],
                summary: "Remove a song from this deck",
                security: [{ BearerAuth: [] }],
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                    { name: "song_id", in: "path", required: true, schema: { type: "string" } }
                ],
                responses: {
                    200: { description: "Song removed from deck successfully" }
                }
            }
        },
        "/api/study/session": {
            post: {
                tags: ["Study & SRS Flashcards"],
                summary: "Create a new flashcard study session with due Japanese phrases",
                security: [{ BearerAuth: [] }],
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    song_id: { type: "string", example: "673000000000000000000000" },
                                    deck_id: { type: "string", example: "673000000000000000000001" },
                                    limit: { type: "integer", default: 20, example: 20 }
                                }
                            }
                        }
                    }
                },
                responses: {
                    201: { description: "Study session created with flashcard phrases" }
                }
            }
        },
        "/api/study/review": {
            post: {
                tags: ["Study & SRS Flashcards"],
                summary: "Submit spaced repetition review rating (again, hard, good, easy) for a phrase",
                security: [{ BearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["session_id", "phrase_id", "rating"],
                                properties: {
                                    session_id: { type: "string", example: "673000000000000000000002" },
                                    phrase_id: { type: "string", example: "p_dQw4w9WgXcQ_1_1" },
                                    rating: {
                                        type: "string",
                                        enum: ["again", "hard", "good", "easy"],
                                        example: "good"
                                    }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: "SRS calculation updated, next review scheduled, XP awarded" }
                }
            }
        }
    }
};

export function setupSwagger(app: Application) {
    app.use("/api/docs", (req: Request, res: Response, next: NextFunction) => {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setHeader("Surrogate-Control", "no-store");
        res.setHeader("CDN-Cache-Control", "no-store");
        res.setHeader("Cloudflare-CDN-Cache-Control", "no-store");
        next();
    });

    const swaggerUiHandler = swaggerUi.setup(swaggerSpec, {
        customSiteTitle: "Flashku API Docs - Swagger UI",
        swaggerOptions: {
            persistAuthorization: true
        }
    });

    app.use("/api/docs", swaggerUi.serve, (req: Request, res: Response, next: NextFunction) => {
        const originalSend = res.send.bind(res);
        res.send = (body: any) => {
            if (typeof body === "string" && body.includes("swagger-ui-init.js")) {
                const cacheBuster = Date.now();
                body = body.replace('src="./swagger-ui-init.js"', `src="./swagger-ui-init.js?v=${cacheBuster}"`);
            }
            return originalSend(body);
        };
        return swaggerUiHandler(req, res, next);
    });
}
