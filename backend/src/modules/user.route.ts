import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { getDB } from "../config/db";
import { authenticate } from "../middlewares/auth.middleware";
import { createLimiter } from "../middlewares/limiter.middleware";
import { uploadAvatar } from "../middlewares/upload.middleware";
import { IUser } from "../types";
import { hashPassword, verifyPassword } from "../utils/security";

const UserRouter = express.Router();

function sanitizeUser(user: IUser) {
    return {
        id: user.id || user._id?.toString() || "",
        name: user.name,
        email: user.email,
        username: user.username,
        avatar: user.avatar || null,
        level: user.level || 1,
        is_active: user.is_active !== false,
        is_verified: user.is_verified || !!user.email_verified_at,
        created_at: user.created_at,
        updated_at: user.updated_at,
    };
}

function deleteLocalAvatarFile(avatarUrl?: string | null) {
    if (!avatarUrl) return;
    if (avatarUrl.includes("/uploads/avatars/")) {
        const filename = avatarUrl.split("/uploads/avatars/")[1]?.split("?")[0];
        if (filename) {
            const localPath = path.resolve(process.cwd(), "uploads/avatars", filename);
            if (fs.existsSync(localPath)) {
                try {
                    fs.unlinkSync(localPath);
                } catch (e) {
                    // Ignore deletion error
                }
            }
        }
    }
}

// PATCH /api/users/profile
UserRouter.patch("/profile", authenticate, createLimiter(20), async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;
        const { name, username } = req.body;

        const updateFields: any = { updated_at: new Date() };

        if (name !== undefined) {
            const cleanName = (name || "").trim();
            if (cleanName.length < 2) {
                return res.status(400).json({ detail: "Name must be at least 2 characters long" });
            }
            updateFields.name = cleanName;
        }

        if (username !== undefined) {
            const cleanUsername = (username || "").trim();
            if (cleanUsername.length < 3 || !/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
                return res.status(400).json({ detail: "Username must be 3-50 alphanumeric characters" });
            }

            const taken = await db.collection<IUser>("users").findOne({
                username: cleanUsername,
                id: { $ne: currentUser.id },
            });
            if (taken) {
                return res.status(400).json({ detail: "Username is already taken by another user" });
            }
            updateFields.username = cleanUsername;
        }

        await db.collection("users").updateOne({ id: currentUser.id }, { $set: updateFields });

        const updated = await db.collection<IUser>("users").findOne({ id: currentUser.id });
        if (!updated) {
            return res.status(404).json({ detail: "User not found" });
        }

        return res.status(200).json(sanitizeUser(updated));
    } catch (err) {
        console.error("Update profile error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// POST /api/users/avatar
UserRouter.post(
    "/avatar",
    authenticate,
    createLimiter(10),
    uploadAvatar.single("file"),
    async (req: Request, res: Response) => {
        try {
            const db = getDB();
            const currentUser = req.user!;

            if (!req.file) {
                return res.status(400).json({ detail: "Image file is required" });
            }

            // Delete old avatar
            deleteLocalAvatarFile(currentUser.avatar);

            const baseUrl = `${req.protocol}://${req.get("host")}`;
            const avatarRelative = `/uploads/avatars/${req.file.filename}`;
            const avatarFullUrl = `${baseUrl}${avatarRelative}`;

            await db.collection("users").updateOne(
                { id: currentUser.id },
                { $set: { avatar: avatarFullUrl, updated_at: new Date() } }
            );

            const updated = await db.collection<IUser>("users").findOne({ id: currentUser.id });

            return res.status(200).json({
                message: "Avatar uploaded successfully",
                avatar_url: avatarFullUrl,
                user: sanitizeUser(updated || currentUser),
            });
        } catch (err: any) {
            console.error("Avatar upload error:", err);
            return res.status(400).json({ detail: err.message || "Avatar upload failed" });
        }
    }
);

// DELETE /api/users/avatar
UserRouter.delete("/avatar", authenticate, createLimiter(10), async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;

        deleteLocalAvatarFile(currentUser.avatar);

        await db.collection("users").updateOne(
            { id: currentUser.id },
            { $set: { avatar: null, updated_at: new Date() } }
        );

        const updated = await db.collection<IUser>("users").findOne({ id: currentUser.id });
        return res.status(200).json(sanitizeUser(updated || currentUser));
    } catch (err) {
        console.error("Delete avatar error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// POST /api/users/change-password
UserRouter.post("/change-password", authenticate, createLimiter(5), async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({ detail: "Current password and new password are required" });
        }

        const user = await db.collection<IUser>("users").findOne({ id: currentUser.id });
        if (!user || !user.password) {
            return res.status(404).json({ detail: "User not found" });
        }

        const isValid = await verifyPassword(current_password, user.password);
        if (!isValid) {
            return res.status(400).json({ detail: "Current password does not match" });
        }

        if (current_password === new_password) {
            return res.status(400).json({ detail: "New password cannot be the same as the current password" });
        }

        if (new_password.length < 6) {
            return res.status(400).json({ detail: "New password must be at least 6 characters" });
        }

        const newHashed = await hashPassword(new_password);
        await db.collection("users").updateOne(
            { id: currentUser.id },
            { $set: { password: newHashed, updated_at: new Date() } }
        );

        return res.status(200).json({ message: "Password changed successfully" });
    } catch (err) {
        console.error("Change password error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// DELETE /api/users/account
UserRouter.delete("/account", authenticate, createLimiter(5), async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ detail: "Password confirmation is required" });
        }

        const user = await db.collection<IUser>("users").findOne({ id: currentUser.id });
        if (!user || !user.password) {
            return res.status(404).json({ detail: "User not found" });
        }

        const isValid = await verifyPassword(password, user.password);
        if (!isValid) {
            return res.status(400).json({ detail: "Password confirmation is incorrect" });
        }

        deleteLocalAvatarFile(user.avatar);

        // Delete user & associated data
        await db.collection("users").deleteOne({ id: currentUser.id });
        await db.collection("user_has_songs").deleteMany({ user_id: currentUser.id });
        await db.collection("decks").deleteMany({ user_id: currentUser.id });
        await db.collection("study_sessions").deleteMany({ user_id: currentUser.id });
        await db.collection("study_attempts").deleteMany({ user_id: currentUser.id });
        await db.collection("user_phrase_stats").deleteMany({ user_id: currentUser.id });

        return res.status(200).json({ message: "Account successfully deleted" });
    } catch (err) {
        console.error("Delete account error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

export default UserRouter;
