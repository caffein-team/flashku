import express, { Application, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "./config/db";
import { setupSwagger } from "./config/swagger";

import AuthRouter from "./modules/auth.route";
import UserRouter from "./modules/user.route";
import SongRouter from "./modules/song.route";
import DeckRouter from "./modules/deck.route";
import StudyRouter from "./modules/study.route";

dotenv.config();

const app: Application = express();

app.set("trust proxy", true);
app.use(cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"]
}));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ strict: false }));

// Normalize request body so null/undefined bodies become empty objects
app.use((req: Request, _res: Response, next) => {
    if (!req.body || typeof req.body !== "object") {
        req.body = {};
    }
    next();
});

// Graceful JSON syntax error handling
app.use((err: any, _req: Request, res: Response, next: any) => {
    if (err instanceof SyntaxError && "body" in err && (err as any).status === 400) {
        return res.status(400).json({
            status: "fail",
            message: "Invalid JSON format in request body"
        });
    }
    next(err);
});

// Setup Swagger API Documentation on /api/docs
setupSwagger(app);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
    app.use("/api/auth", AuthRouter);
    app.use("/api/users", UserRouter);
    app.use("/api/songs", SongRouter);
    app.use("/api/decks", DeckRouter);
    app.use("/api/study", StudyRouter);

    app.get("/api/health", (req: Request, res: Response) => {
        return res.status(200).json({
            message: "Application running well"
        });
    });

    app.listen(PORT, () => {
        console.log(`[Server]: Application running on http://127.0.0.1:${PORT}`);
        console.log(`[Server]: Swagger Docs available at http://127.0.0.1:${PORT}/api/docs`);
    });
});
