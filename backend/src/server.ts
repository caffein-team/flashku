import express, { Application, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import swaggerUi from "swagger-ui-express";
import { connectDB } from "./config/db";
import { swaggerSpec } from "./config/swagger";

import AuthRouter from "./modules/auth.route";
import UserRouter from "./modules/user.route";
import SongRouter from "./modules/song.route";
import DeckRouter from "./modules/deck.route";
import StudyRouter from "./modules/study.route";

dotenv.config();

const app: Application = express();

// Ensure upload directories exist
const uploadDirs = ["uploads/avatars", "uploads/songs", "uploads/thumbnails"];
for (const dir of uploadDirs) {
    const fullPath = path.resolve(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }
}

app.use(cors({ origin: "*", credentials: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

// Swagger API Docs — accessible at /api/docs
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "Flashku API Docs",
    customCss: ".swagger-ui .topbar { display: none }",
}));

// Root & Health check routes
app.get("/", (req: Request, res: Response) => {
    return res.status(200).json({
        message: "Welcome to Flashku API",
        version: "1.0.0",
    });
});

// Mount API modules
app.use("/api/auth", AuthRouter);
app.use("/api/users", UserRouter);
app.use("/api/songs", SongRouter);
app.use("/api/decks", DeckRouter);
app.use("/api/study", StudyRouter);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`[Server]: Application running on http://127.0.0.1:${PORT}`);
    });
});

export default app;
