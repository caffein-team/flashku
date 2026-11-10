import swaggerJsdoc from "swagger-jsdoc";

// URL server diambil dari env agar otomatis menyesuaikan antara local dan production.
// Set APP_URL=https://api.flashku.com di environment production.
const serverUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;
const isProduction = process.env.NODE_ENV === "production";

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: "3.0.3",
        info: {
            title: "Flashku API",
            version: "1.0.0",
            description:
                "REST API untuk aplikasi Flashku — belajar bahasa Jepang lewat lirik lagu dengan metode SRS (Spaced Repetition System).",
            contact: {
                name: "Flashku Team",
            },
        },
        servers: isProduction
            ? [{ url: serverUrl, description: "Production server" }]
            : [
                  { url: serverUrl, description: "Production server" },
                  { url: `http://localhost:${process.env.PORT || 5000}`, description: "Local development server" },
              ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                    description: "Masukkan Access Token JWT yang diperoleh dari endpoint /api/auth/login",
                },
            },
            schemas: {
                // ─── Auth ───────────────────────────────────────────────
                RegisterRequest: {
                    type: "object",
                    required: ["email", "username", "password"],
                    properties: {
                        email: { type: "string", format: "email", example: "user@example.com" },
                        username: { type: "string", example: "tanaka_taro" },
                        password: { type: "string", minLength: 8, example: "P@ssw0rd!" },
                    },
                },
                LoginRequest: {
                    type: "object",
                    required: ["email", "password"],
                    properties: {
                        email: { type: "string", format: "email", example: "user@example.com" },
                        password: { type: "string", example: "P@ssw0rd!" },
                    },
                },
                RefreshRequest: {
                    type: "object",
                    required: ["refresh_token"],
                    properties: {
                        refresh_token: { type: "string", example: "eyJhbGc..." },
                    },
                },
                ForgotPasswordRequest: {
                    type: "object",
                    required: ["email"],
                    properties: {
                        email: { type: "string", format: "email", example: "user@example.com" },
                    },
                },
                ResetPasswordRequest: {
                    type: "object",
                    required: ["email", "otp", "new_password"],
                    properties: {
                        email: { type: "string", format: "email", example: "user@example.com" },
                        otp: { type: "string", example: "123456" },
                        new_password: { type: "string", minLength: 8, example: "NewP@ss1" },
                    },
                },
                AuthResponse: {
                    type: "object",
                    properties: {
                        access_token: { type: "string", example: "eyJhbGc..." },
                        refresh_token: { type: "string", example: "eyJhbGc..." },
                        token_type: { type: "string", example: "bearer" },
                    },
                },
                // ─── User ───────────────────────────────────────────────
                UserProfile: {
                    type: "object",
                    properties: {
                        id: { type: "string", format: "uuid" },
                        email: { type: "string", format: "email" },
                        username: { type: "string" },
                        display_name: { type: "string", nullable: true },
                        avatar_url: { type: "string", nullable: true },
                        created_at: { type: "string", format: "date-time" },
                    },
                },
                UpdateProfileRequest: {
                    type: "object",
                    properties: {
                        username: { type: "string", example: "new_username" },
                        display_name: { type: "string", example: "Taro Tanaka" },
                    },
                },
                ChangePasswordRequest: {
                    type: "object",
                    required: ["current_password", "new_password"],
                    properties: {
                        current_password: { type: "string", example: "OldP@ss1" },
                        new_password: { type: "string", minLength: 8, example: "NewP@ss1" },
                    },
                },
                // ─── Song ───────────────────────────────────────────────
                Song: {
                    type: "object",
                    properties: {
                        id: { type: "string", format: "uuid" },
                        youtube_url: { type: "string", format: "uri" },
                        youtube_id: { type: "string", example: "dQw4w9WgXcQ" },
                        title: { type: "string", example: "Lemon" },
                        artist: { type: "string", example: "Kenshi Yonezu" },
                        thumbnail_url: { type: "string", nullable: true },
                        audio_url: { type: "string", nullable: true },
                        lyrics_raw: { type: "string", nullable: true },
                        lyrics_rows: {
                            type: "array",
                            items: { $ref: "#/components/schemas/LyricRow" },
                        },
                        is_favorite: { type: "boolean" },
                        created_at: { type: "string", format: "date-time" },
                    },
                },
                LyricRow: {
                    type: "object",
                    properties: {
                        time_ms: { type: "number", nullable: true },
                        original: { type: "string", example: "レモン" },
                        hiragana: { type: "string", example: "れもん" },
                        romaji: { type: "string", example: "remon" },
                        translation: { type: "string", nullable: true, example: "Lemon" },
                    },
                },
                ImportSongRequest: {
                    type: "object",
                    required: ["youtube_url"],
                    properties: {
                        youtube_url: {
                            type: "string",
                            format: "uri",
                            example: "https://www.youtube.com/watch?v=SX_ViT4Ra7k",
                        },
                    },
                },
                UpdateLyricsRequest: {
                    type: "object",
                    required: ["lyrics_raw"],
                    properties: {
                        lyrics_raw: {
                            type: "string",
                            example: "[00:10.00] レモン\n[00:12.50] 夢じゃないと言い切れた",
                        },
                    },
                },
                // ─── Deck ───────────────────────────────────────────────
                Deck: {
                    type: "object",
                    properties: {
                        id: { type: "string", format: "uuid" },
                        name: { type: "string", example: "Lagu Favorit" },
                        description: { type: "string", nullable: true },
                        song_count: { type: "integer", example: 5 },
                        created_at: { type: "string", format: "date-time" },
                    },
                },
                CreateDeckRequest: {
                    type: "object",
                    required: ["name"],
                    properties: {
                        name: { type: "string", example: "Lagu Favorit" },
                        description: { type: "string", example: "Koleksi lagu-lagu yang sering didengar" },
                    },
                },
                AddSongToDeckRequest: {
                    type: "object",
                    required: ["song_id"],
                    properties: {
                        song_id: { type: "string", format: "uuid" },
                    },
                },
                // ─── Study ──────────────────────────────────────────────
                StudySession: {
                    type: "object",
                    properties: {
                        id: { type: "string", format: "uuid" },
                        deck_id: { type: "string", format: "uuid" },
                        cards: {
                            type: "array",
                            items: { $ref: "#/components/schemas/StudyCard" },
                        },
                        created_at: { type: "string", format: "date-time" },
                    },
                },
                StudyCard: {
                    type: "object",
                    properties: {
                        phrase_id: { type: "string", format: "uuid" },
                        original: { type: "string" },
                        hiragana: { type: "string" },
                        romaji: { type: "string" },
                        translation: { type: "string", nullable: true },
                        due_at: { type: "string", format: "date-time" },
                    },
                },
                CreateSessionRequest: {
                    type: "object",
                    required: ["deck_id"],
                    properties: {
                        deck_id: { type: "string", format: "uuid" },
                        limit: { type: "integer", default: 20, example: 20 },
                    },
                },
                ReviewCardRequest: {
                    type: "object",
                    required: ["phrase_id", "quality"],
                    properties: {
                        phrase_id: { type: "string", format: "uuid" },
                        quality: {
                            type: "integer",
                            minimum: 0,
                            maximum: 5,
                            description:
                                "Nilai kualitas jawaban SM-2: 0=Blackout, 1=Salah berat, 2=Salah ringan, 3=Benar (susah), 4=Benar (mudah), 5=Sempurna",
                            example: 4,
                        },
                    },
                },
                // ─── Generic ────────────────────────────────────────────
                MessageResponse: {
                    type: "object",
                    properties: {
                        message: { type: "string", example: "Operasi berhasil" },
                    },
                },
                ErrorResponse: {
                    type: "object",
                    properties: {
                        message: { type: "string", example: "Terjadi kesalahan" },
                        detail: { type: "string", nullable: true },
                    },
                },
                PaginatedResponse: {
                    type: "object",
                    properties: {
                        data: { type: "array", items: {} },
                        total: { type: "integer", example: 100 },
                        page: { type: "integer", example: 1 },
                        limit: { type: "integer", example: 10 },
                    },
                },
            },
        },
        paths: {
            // ════════════════════════════════════════════════════════════
            // AUTH
            // ════════════════════════════════════════════════════════════
            "/api/auth/register": {
                post: {
                    tags: ["Auth"],
                    summary: "Daftar akun baru",
                    requestBody: {
                        required: true,
                        content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterRequest" } } },
                    },
                    responses: {
                        201: {
                            description: "Registrasi berhasil",
                            content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } },
                        },
                        400: { description: "Validasi gagal atau email sudah dipakai" },
                    },
                },
            },
            "/api/auth/login": {
                post: {
                    tags: ["Auth"],
                    summary: "Login dan dapatkan token",
                    requestBody: {
                        required: true,
                        content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } },
                    },
                    responses: {
                        200: {
                            description: "Login berhasil",
                            content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } },
                        },
                        401: { description: "Email atau password salah" },
                    },
                },
            },
            "/api/auth/refresh": {
                post: {
                    tags: ["Auth"],
                    summary: "Perbarui access token menggunakan refresh token",
                    requestBody: {
                        required: true,
                        content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshRequest" } } },
                    },
                    responses: {
                        200: {
                            description: "Token berhasil diperbarui",
                            content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } },
                        },
                        401: { description: "Refresh token tidak valid atau sudah dicabut" },
                    },
                },
            },
            "/api/auth/logout": {
                post: {
                    tags: ["Auth"],
                    summary: "Logout dan cabut token",
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshRequest" } } },
                    },
                    responses: {
                        200: { description: "Logout berhasil" },
                        401: { description: "Tidak terautentikasi" },
                    },
                },
            },
            "/api/auth/me": {
                get: {
                    tags: ["Auth"],
                    summary: "Ambil profil user yang sedang login",
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: {
                            description: "Profil user",
                            content: { "application/json": { schema: { $ref: "#/components/schemas/UserProfile" } } },
                        },
                        401: { description: "Tidak terautentikasi" },
                    },
                },
            },
            "/api/auth/forgot-password": {
                post: {
                    tags: ["Auth"],
                    summary: "Kirim OTP reset password ke email",
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/ForgotPasswordRequest" },
                            },
                        },
                    },
                    responses: {
                        200: { description: "OTP berhasil dikirim ke email" },
                        404: { description: "Email tidak ditemukan" },
                    },
                },
            },
            "/api/auth/reset-password": {
                post: {
                    tags: ["Auth"],
                    summary: "Reset password menggunakan OTP",
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/ResetPasswordRequest" },
                            },
                        },
                    },
                    responses: {
                        200: { description: "Password berhasil direset" },
                        400: { description: "OTP tidak valid atau sudah kadaluarsa" },
                    },
                },
            },
            // ════════════════════════════════════════════════════════════
            // USERS
            // ════════════════════════════════════════════════════════════
            "/api/users/profile": {
                patch: {
                    tags: ["Users"],
                    summary: "Perbarui profil user",
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": { schema: { $ref: "#/components/schemas/UpdateProfileRequest" } },
                        },
                    },
                    responses: {
                        200: {
                            description: "Profil berhasil diperbarui",
                            content: { "application/json": { schema: { $ref: "#/components/schemas/UserProfile" } } },
                        },
                        401: { description: "Tidak terautentikasi" },
                    },
                },
            },
            "/api/users/avatar": {
                post: {
                    tags: ["Users"],
                    summary: "Upload foto avatar",
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "multipart/form-data": {
                                schema: {
                                    type: "object",
                                    required: ["avatar"],
                                    properties: {
                                        avatar: {
                                            type: "string",
                                            format: "binary",
                                            description: "File gambar (jpg, png, webp, gif) max 5MB",
                                        },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: {
                            description: "Avatar berhasil diupload",
                            content: { "application/json": { schema: { $ref: "#/components/schemas/UserProfile" } } },
                        },
                        400: { description: "File tidak valid" },
                        401: { description: "Tidak terautentikasi" },
                    },
                },
                delete: {
                    tags: ["Users"],
                    summary: "Hapus foto avatar",
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: { description: "Avatar berhasil dihapus" },
                        401: { description: "Tidak terautentikasi" },
                    },
                },
            },
            "/api/users/change-password": {
                post: {
                    tags: ["Users"],
                    summary: "Ganti password",
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": { schema: { $ref: "#/components/schemas/ChangePasswordRequest" } },
                        },
                    },
                    responses: {
                        200: { description: "Password berhasil diganti" },
                        400: { description: "Password lama salah" },
                        401: { description: "Tidak terautentikasi" },
                    },
                },
            },
            "/api/users/account": {
                delete: {
                    tags: ["Users"],
                    summary: "Hapus akun permanen",
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["password"],
                                    properties: {
                                        password: { type: "string", example: "P@ssw0rd!" },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: "Akun berhasil dihapus" },
                        400: { description: "Password salah" },
                        401: { description: "Tidak terautentikasi" },
                    },
                },
            },
            // ════════════════════════════════════════════════════════════
            // SONGS
            // ════════════════════════════════════════════════════════════
            "/api/songs/import": {
                post: {
                    tags: ["Songs"],
                    summary: "Import lagu dari YouTube",
                    description:
                        "Mengunduh audio dari YouTube, mengambil lirik dari LRCLIB, dan memproses tokenisasi bahasa Jepang.",
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": { schema: { $ref: "#/components/schemas/ImportSongRequest" } },
                        },
                    },
                    responses: {
                        200: {
                            description: "Lagu berhasil diimport",
                            content: { "application/json": { schema: { $ref: "#/components/schemas/Song" } } },
                        },
                        400: { description: "URL tidak valid" },
                        401: { description: "Tidak terautentikasi" },
                    },
                },
            },
            "/api/songs": {
                get: {
                    tags: ["Songs"],
                    summary: "Daftar semua lagu milik user",
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
                        { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
                        { name: "search", in: "query", schema: { type: "string" }, description: "Cari berdasarkan judul/artis" },
                        {
                            name: "favorite",
                            in: "query",
                            schema: { type: "boolean" },
                            description: "Filter hanya lagu favorit",
                        },
                    ],
                    responses: {
                        200: {
                            description: "Daftar lagu",
                            content: {
                                "application/json": {
                                    schema: {
                                        allOf: [
                                            { $ref: "#/components/schemas/PaginatedResponse" },
                                            {
                                                properties: {
                                                    data: { type: "array", items: { $ref: "#/components/schemas/Song" } },
                                                },
                                            },
                                        ],
                                    },
                                },
                            },
                        },
                        401: { description: "Tidak terautentikasi" },
                    },
                },
            },
            "/api/songs/{song_id}": {
                get: {
                    tags: ["Songs"],
                    summary: "Detail lagu",
                    security: [{ bearerAuth: [] }],
                    parameters: [{ name: "song_id", in: "path", required: true, schema: { type: "string" } }],
                    responses: {
                        200: {
                            description: "Detail lagu",
                            content: { "application/json": { schema: { $ref: "#/components/schemas/Song" } } },
                        },
                        404: { description: "Lagu tidak ditemukan" },
                    },
                },
                delete: {
                    tags: ["Songs"],
                    summary: "Hapus lagu",
                    security: [{ bearerAuth: [] }],
                    parameters: [{ name: "song_id", in: "path", required: true, schema: { type: "string" } }],
                    responses: {
                        200: { description: "Lagu berhasil dihapus" },
                        404: { description: "Lagu tidak ditemukan" },
                    },
                },
            },
            "/api/songs/{song_id}/enrich-ai": {
                post: {
                    tags: ["Songs"],
                    summary: "Perkaya lirik dengan terjemahan AI (Gemini)",
                    security: [{ bearerAuth: [] }],
                    parameters: [{ name: "song_id", in: "path", required: true, schema: { type: "string" } }],
                    responses: {
                        200: {
                            description: "Lirik berhasil diperkaya dengan terjemahan",
                            content: { "application/json": { schema: { $ref: "#/components/schemas/Song" } } },
                        },
                        402: { description: "Kuota Gemini habis" },
                        404: { description: "Lagu tidak ditemukan" },
                    },
                },
            },
            "/api/songs/{song_id}/favorite": {
                post: {
                    tags: ["Songs"],
                    summary: "Toggle favorit lagu",
                    security: [{ bearerAuth: [] }],
                    parameters: [{ name: "song_id", in: "path", required: true, schema: { type: "string" } }],
                    responses: {
                        200: {
                            description: "Status favorit berhasil diubah",
                            content: { "application/json": { schema: { $ref: "#/components/schemas/Song" } } },
                        },
                        404: { description: "Lagu tidak ditemukan" },
                    },
                },
            },
            "/api/songs/{song_id}/lyrics": {
                put: {
                    tags: ["Songs"],
                    summary: "Perbarui lirik lagu secara manual",
                    description: "Menerima lirik dalam format LRC ([mm:ss.xx] teks) atau plain text.",
                    security: [{ bearerAuth: [] }],
                    parameters: [{ name: "song_id", in: "path", required: true, schema: { type: "string" } }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": { schema: { $ref: "#/components/schemas/UpdateLyricsRequest" } },
                        },
                    },
                    responses: {
                        200: {
                            description: "Lirik berhasil diperbarui",
                            content: { "application/json": { schema: { $ref: "#/components/schemas/Song" } } },
                        },
                        404: { description: "Lagu tidak ditemukan" },
                    },
                },
            },
            "/api/songs/ai/quota": {
                get: {
                    tags: ["Songs"],
                    summary: "Cek status kuota Gemini AI",
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: {
                            description: "Status kuota",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            available: { type: "boolean" },
                                            message: { type: "string" },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            // ════════════════════════════════════════════════════════════
            // DECKS
            // ════════════════════════════════════════════════════════════
            "/api/decks": {
                post: {
                    tags: ["Decks"],
                    summary: "Buat deck baru",
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": { schema: { $ref: "#/components/schemas/CreateDeckRequest" } },
                        },
                    },
                    responses: {
                        201: {
                            description: "Deck berhasil dibuat",
                            content: { "application/json": { schema: { $ref: "#/components/schemas/Deck" } } },
                        },
                        401: { description: "Tidak terautentikasi" },
                    },
                },
                get: {
                    tags: ["Decks"],
                    summary: "Daftar semua deck milik user",
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
                        { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
                    ],
                    responses: {
                        200: {
                            description: "Daftar deck",
                            content: {
                                "application/json": {
                                    schema: {
                                        allOf: [
                                            { $ref: "#/components/schemas/PaginatedResponse" },
                                            {
                                                properties: {
                                                    data: { type: "array", items: { $ref: "#/components/schemas/Deck" } },
                                                },
                                            },
                                        ],
                                    },
                                },
                            },
                        },
                        401: { description: "Tidak terautentikasi" },
                    },
                },
            },
            "/api/decks/{deck_id}": {
                get: {
                    tags: ["Decks"],
                    summary: "Detail deck beserta daftar lagu",
                    security: [{ bearerAuth: [] }],
                    parameters: [{ name: "deck_id", in: "path", required: true, schema: { type: "string" } }],
                    responses: {
                        200: {
                            description: "Detail deck",
                            content: { "application/json": { schema: { $ref: "#/components/schemas/Deck" } } },
                        },
                        404: { description: "Deck tidak ditemukan" },
                    },
                },
                patch: {
                    tags: ["Decks"],
                    summary: "Perbarui deck",
                    security: [{ bearerAuth: [] }],
                    parameters: [{ name: "deck_id", in: "path", required: true, schema: { type: "string" } }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": { schema: { $ref: "#/components/schemas/CreateDeckRequest" } },
                        },
                    },
                    responses: {
                        200: {
                            description: "Deck berhasil diperbarui",
                            content: { "application/json": { schema: { $ref: "#/components/schemas/Deck" } } },
                        },
                        404: { description: "Deck tidak ditemukan" },
                    },
                },
                delete: {
                    tags: ["Decks"],
                    summary: "Hapus deck",
                    security: [{ bearerAuth: [] }],
                    parameters: [{ name: "deck_id", in: "path", required: true, schema: { type: "string" } }],
                    responses: {
                        200: { description: "Deck berhasil dihapus" },
                        404: { description: "Deck tidak ditemukan" },
                    },
                },
            },
            "/api/decks/{deck_id}/songs": {
                post: {
                    tags: ["Decks"],
                    summary: "Tambah lagu ke dalam deck",
                    security: [{ bearerAuth: [] }],
                    parameters: [{ name: "deck_id", in: "path", required: true, schema: { type: "string" } }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": { schema: { $ref: "#/components/schemas/AddSongToDeckRequest" } },
                        },
                    },
                    responses: {
                        200: { description: "Lagu berhasil ditambahkan ke deck" },
                        400: { description: "Lagu sudah ada di deck" },
                        404: { description: "Deck atau lagu tidak ditemukan" },
                    },
                },
            },
            "/api/decks/{deck_id}/songs/{song_id}": {
                delete: {
                    tags: ["Decks"],
                    summary: "Hapus lagu dari deck",
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { name: "deck_id", in: "path", required: true, schema: { type: "string" } },
                        { name: "song_id", in: "path", required: true, schema: { type: "string" } },
                    ],
                    responses: {
                        200: { description: "Lagu berhasil dihapus dari deck" },
                        404: { description: "Deck atau lagu tidak ditemukan" },
                    },
                },
            },
            // ════════════════════════════════════════════════════════════
            // STUDY
            // ════════════════════════════════════════════════════════════
            "/api/study/session": {
                post: {
                    tags: ["Study"],
                    summary: "Buat sesi belajar baru",
                    description:
                        "Mengambil kartu-kartu yang perlu diulang berdasarkan algoritma SM-2 (Spaced Repetition).",
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": { schema: { $ref: "#/components/schemas/CreateSessionRequest" } },
                        },
                    },
                    responses: {
                        200: {
                            description: "Sesi belajar berhasil dibuat",
                            content: { "application/json": { schema: { $ref: "#/components/schemas/StudySession" } } },
                        },
                        404: { description: "Deck tidak ditemukan" },
                    },
                },
            },
            "/api/study/review": {
                post: {
                    tags: ["Study"],
                    summary: "Kirim jawaban review kartu",
                    description:
                        "Memperbarui jadwal pengulangan kartu berdasarkan kualitas jawaban (SM-2: 0–5).",
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": { schema: { $ref: "#/components/schemas/ReviewCardRequest" } },
                        },
                    },
                    responses: {
                        200: {
                            description: "Review berhasil dicatat",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            message: { type: "string" },
                                            next_review: { type: "string", format: "date-time" },
                                            interval_days: { type: "integer" },
                                        },
                                    },
                                },
                            },
                        },
                        404: { description: "Kartu tidak ditemukan" },
                    },
                },
            },
        },
        tags: [
            { name: "Auth", description: "Autentikasi dan manajemen token" },
            { name: "Users", description: "Profil dan pengaturan akun user" },
            { name: "Songs", description: "Import dan manajemen lagu" },
            { name: "Decks", description: "Koleksi deck untuk belajar" },
            { name: "Study", description: "Sesi belajar dengan Spaced Repetition" },
        ],
    },
    apis: [], // Semua path sudah didefinisikan di atas
};

export const swaggerSpec = swaggerJsdoc(options);
