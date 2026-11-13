import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { getDB } from "../config/db";
import { authenticateToken } from "../middlewares/auth.middleware";
import { IUser } from "../types/auth";
import { hashPassword, verifyPassword } from "../utils/password";

const UserRouter = express.Router();

// Apply auth middleware to all user endpoints
UserRouter.use(authenticateToken);

// Setup multer storage for avatar uploads
const uploadDir = path.join(process.cwd(), "uploads", "avatars");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        cb(null, `${req.user?._id}_${uniqueSuffix}${ext}`);
    }
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(ext) || !allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
        return cb(new Error("Invalid image format. Allowed formats: .jpg, .jpeg, .png, .webp, .gif"));
    }
    cb(null, true);
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: fileFilter
});

function deleteLocalAvatarFile(avatarUrl?: string | null) {
    if (!avatarUrl) return;
    if (avatarUrl.includes("/uploads/avatars/")) {
        const parts = avatarUrl.split("/uploads/avatars/");
        const filename = parts[parts.length - 1].split("?")[0];
        const filePath = path.join(uploadDir, filename);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                console.error("[Avatar Cleanup Warning]:", err);
            }
        }
    }
}

/**
 * PATCH /api/users/profile
 * Update current user's profile (name, username)
 */
UserRouter.patch("/profile", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;
        const { name, username } = req.body;
        const errors: Record<string, string> = {};

        const updateData: Partial<IUser> = {
            updated_at: new Date()
        };

        if (name !== undefined) {
            if (typeof name !== "string" || name.trim().length < 2) {
                errors.name = "Name must be a string with at least 2 characters";
            } else if (name.includes("@")) {
                errors.name = "Name cannot contain @";
            } else {
                updateData.name = name.trim();
            }
        }

        if (username !== undefined) {
            if (typeof username !== "string" || username.trim().length < 3 || username.trim().length > 50) {
                errors.username = "Username must be between 3 and 50 characters";
            } else if (!/^[a-zA-Z0-9_-]+$/.test(username.trim())) {
                errors.username = "Username may only contain letters, numbers, underscores, and hyphens";
            } else {
                const existing = await db.collection<IUser>("users").findOne({
                    username: username.trim(),
                    _id: { $ne: user._id }
                });
                if (existing) {
                    errors.username = "Username is already taken by another user";
                } else {
                    updateData.username = username.trim();
                }
            }
        }

        if (Object.keys(errors).length > 0) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid user input",
                errors: errors
            });
        }

        await db.collection<IUser>("users").updateOne(
            { _id: user._id },
            { $set: updateData }
        );

        const updatedUser = await db.collection<IUser>("users").findOne({ _id: user._id });
        if (updatedUser) {
            delete updatedUser.password;
        }

        return res.status(200).json({
            status: "success",
            message: "Profile updated successfully",
            data: updatedUser
        });
    } catch (err: unknown) {
        console.error("[Update Profile Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

/**
 * POST /api/users/avatar
 * Upload user avatar image to project storage (Max 5MB)
 */
UserRouter.post("/avatar", (req: Request, res: Response) => {
    upload.single("file")(req, res, async (err: any) => {
        if (err) {
            return res.status(400).json({
                status: "fail",
                message: err.message || "File upload failed"
            });
        }

        if (!req.file) {
            return res.status(400).json({
                status: "fail",
                message: "Image file is required under form field 'file'"
            });
        }

        try {
            const db = getDB();
            const user = req.user!;

            // Clean up old avatar if stored locally
            deleteLocalAvatarFile(user.avatar);

            const appUrl = (process.env.APP_URL || process.env.BASE_URL || "").trim().replace(/\/+$/, "");
            const baseUrl = appUrl || `${req.protocol}://${req.get("host")}`;
            const avatarUrl = `${baseUrl}/uploads/avatars/${req.file.filename}`;

            await db.collection<IUser>("users").updateOne(
                { _id: user._id },
                {
                    $set: {
                        avatar: avatarUrl,
                        updated_at: new Date()
                    }
                }
            );

            const updatedUser = await db.collection<IUser>("users").findOne({ _id: user._id });
            if (updatedUser) {
                delete updatedUser.password;
            }

            return res.status(200).json({
                status: "success",
                message: "Avatar uploaded successfully",
                data: {
                    avatar_url: avatarUrl,
                    user: updatedUser
                }
            });
        } catch (dbErr: any) {
            console.error("[Avatar Upload DB Error]:", dbErr);
            return res.status(500).json({
                status: "error",
                message: "Internal server error during avatar upload"
            });
        }
    });
});

/**
 * DELETE /api/users/avatar
 * Delete current user's avatar
 */
UserRouter.delete("/avatar", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;

        deleteLocalAvatarFile(user.avatar);

        await db.collection<IUser>("users").updateOne(
            { _id: user._id },
            {
                $set: {
                    avatar: null,
                    updated_at: new Date()
                }
            }
        );

        const updatedUser = await db.collection<IUser>("users").findOne({ _id: user._id });
        if (updatedUser) {
            delete updatedUser.password;
        }

        return res.status(200).json({
            status: "success",
            message: "Avatar deleted successfully",
            data: updatedUser
        });
    } catch (err: unknown) {
        console.error("[Delete Avatar Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

/**
 * POST /api/users/change-password
 * Change user password
 */
UserRouter.post("/change-password", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;
        const { current_password, new_password } = req.body;
        const errors: Record<string, string> = {};

        if (!current_password || typeof current_password !== "string") {
            errors.current_password = "Current password is required";
        }

        if (!new_password || typeof new_password !== "string") {
            errors.new_password = "New password is required";
        } else if (new_password.length < 6) {
            errors.new_password = "New password must be at least 6 characters";
        }

        if (current_password && new_password && current_password === new_password) {
            errors.new_password = "New password cannot be the same as the current password";
        }

        if (Object.keys(errors).length > 0) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid input",
                errors: errors
            });
        }

        // Fetch user with hashed password from database
        const dbUser = await db.collection<IUser>("users").findOne({ _id: user._id });
        if (!dbUser || !dbUser.password) {
            return res.status(404).json({
                status: "fail",
                message: "User not found"
            });
        }

        const isValid = await verifyPassword(current_password, dbUser.password);
        if (!isValid) {
            return res.status(400).json({
                status: "fail",
                message: "Current password does not match"
            });
        }

        const hashed = await hashPassword(new_password);
        await db.collection<IUser>("users").updateOne(
            { _id: user._id },
            {
                $set: {
                    password: hashed,
                    updated_at: new Date()
                }
            }
        );

        return res.status(200).json({
            status: "success",
            message: "Password changed successfully"
        });
    } catch (err: unknown) {
        console.error("[Change Password Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

/**
 * DELETE /api/users/account
 * Permanently delete user account and uploaded assets
 */
UserRouter.delete("/account", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;
        const { password } = req.body;

        if (!password || typeof password !== "string") {
            return res.status(400).json({
                status: "fail",
                message: "Password confirmation is required"
            });
        }

        const dbUser = await db.collection<IUser>("users").findOne({ _id: user._id });
        if (!dbUser || !dbUser.password) {
            return res.status(404).json({
                status: "fail",
                message: "User not found"
            });
        }

        const isValid = await verifyPassword(password, dbUser.password);
        if (!isValid) {
            return res.status(400).json({
                status: "fail",
                message: "Password confirmation is incorrect"
            });
        }

        // Clean up local avatar
        deleteLocalAvatarFile(dbUser.avatar);

        // Delete user and associated collections
        await db.collection("users").deleteOne({ _id: user._id });
        await db.collection("user_songs").deleteMany({ user_id: user._id });
        await db.collection("decks").deleteMany({ user_id: user._id });
        await db.collection("study_sessions").deleteMany({ user_id: user._id });
        await db.collection("study_attempts").deleteMany({ user_id: user._id });
        await db.collection("user_phrase_stats").deleteMany({ user_id: user._id });

        return res.status(200).json({
            status: "success",
            message: "Account successfully deleted"
        });
    } catch (err: unknown) {
        console.error("[Delete Account Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

export default UserRouter;
