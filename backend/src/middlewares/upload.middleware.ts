import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_AVATARS_DIR = path.resolve(process.cwd(), "uploads/avatars");
if (!fs.existsSync(UPLOAD_AVATARS_DIR)) {
    fs.mkdirSync(UPLOAD_AVATARS_DIR, { recursive: true });
}

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_AVATARS_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const userId = req.user?.id || "user";
        const uniqueSuffix = uuidv4().replace(/-/g, "").substring(0, 8);
        cb(null, `${userId}_${uniqueSuffix}${ext}`);
    },
});

export const uploadAvatar = multer({
    storage: avatarStorage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
            return cb(new Error("Invalid image format. Allowed formats: .jpg, .jpeg, .png, .webp, .gif"));
        }
        cb(null, true);
    },
});
