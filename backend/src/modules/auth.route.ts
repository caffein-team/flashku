import express, { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDB } from "../config/db";
import { authenticate } from "../middlewares/auth.middleware";
import { createLimiter } from "../middlewares/limiter.middleware";
import { IUser, IPasswordResetOtp, IRevokedToken } from "../types";
import { sendOtpEmail } from "../utils/email";
import {
    createAccessToken,
    createRefreshToken,
    decodeToken,
    hashPassword,
    verifyPassword,
} from "../utils/security";

const AuthRouter = express.Router();

function sanitizeUser(user: IUser) {
    const id = user.id || user._id?.toString() || "";
    return {
        id,
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

// POST /api/auth/register
AuthRouter.post("/register", createLimiter(10), async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const { name, email, username, password, avatar } = req.body;

        const cleanName = (name || "").trim();
        const cleanEmail = (email || "").trim().toLowerCase();
        const cleanUsername = (username || (cleanEmail.includes("@") ? cleanEmail.split("@")[0] : cleanName.toLowerCase().replace(/\s+/g, "_"))).trim();
        const cleanPassword = (password || "").toString();

        if (!cleanName || cleanName.length < 2) {
            return res.status(400).json({ detail: "Name must be at least 2 characters long" });
        }

        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
        if (!cleanEmail || !emailRegex.test(cleanEmail)) {
            return res.status(400).json({ detail: "A valid email address is required" });
        }

        if (!cleanUsername || cleanUsername.length < 3 || !/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
            return res.status(400).json({ detail: "Username must be 3-50 alphanumeric characters (allowing _ and -)" });
        }

        if (!cleanPassword || cleanPassword.length < 6) {
            return res.status(400).json({ detail: "Password must be at least 6 characters long" });
        }

        // Check existing email
        const existingEmail = await db.collection<IUser>("users").findOne({ email: cleanEmail });
        if (existingEmail) {
            return res.status(400).json({ detail: "Email is already registered" });
        }

        // Check existing username
        const existingUsername = await db.collection<IUser>("users").findOne({ username: cleanUsername });
        if (existingUsername) {
            return res.status(400).json({ detail: "Username is already taken" });
        }

        const hashedPassword = await hashPassword(cleanPassword);
        const now = new Date();
        const userId = uuidv4();

        const newUser: IUser = {
            id: userId,
            name: cleanName,
            email: cleanEmail,
            username: cleanUsername,
            password: hashedPassword,
            avatar: avatar || null,
            level: 1,
            is_active: true,
            is_verified: false,
            created_at: now,
            updated_at: now,
        };

        const result = await db.collection("users").insertOne(newUser);
        newUser._id = result.insertedId;

        return res.status(201).json(sanitizeUser(newUser));
    } catch (err) {
        console.error("Register error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// POST /api/auth/login
AuthRouter.post("/login", createLimiter(5), async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const { identifier, password } = req.body;

        const cleanIdentifier = (identifier || "").trim();
        const cleanPassword = (password || "").toString();

        if (!cleanIdentifier || !cleanPassword) {
            return res.status(400).json({ detail: "Identifier and password are required" });
        }

        const user = await db.collection<IUser>("users").findOne({
            $or: [
                { email: cleanIdentifier.toLowerCase() },
                { username: cleanIdentifier },
                { name: cleanIdentifier },
            ],
        });

        if (!user || !user.password) {
            return res.status(401).json({ detail: "Invalid username/email or password" });
        }

        const isValid = await verifyPassword(cleanPassword, user.password);
        if (!isValid) {
            return res.status(401).json({ detail: "Invalid username/email or password" });
        }

        if (user.is_active === false) {
            return res.status(403).json({ detail: "Account is currently inactive" });
        }

        const userId = user.id || user._id?.toString() || "";
        const accessToken = createAccessToken(userId);
        const { token: refreshToken } = createRefreshToken(userId);

        const sanitized = sanitizeUser(user);

        return res.status(200).json({
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: "bearer",
            user: sanitized,
            // also provide root token for frontend convenience
            token: accessToken,
            data: sanitized,
        });
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// POST /api/auth/refresh
AuthRouter.post("/refresh", createLimiter(30), async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(401).json({ detail: "Invalid or expired refresh token" });
        }

        let payload: any;
        try {
            payload = decodeToken(refresh_token);
            if (payload.type !== "refresh" || !payload.sub) {
                return res.status(401).json({ detail: "Invalid or expired refresh token" });
            }
        } catch (err: any) {
            if (err.name === "TokenExpiredError") {
                return res.status(401).json({ detail: "Refresh token has expired, please log in again" });
            }
            return res.status(401).json({ detail: "Invalid or expired refresh token" });
        }

        // Check if token was revoked
        if (payload.jti) {
            const isRevoked = await db.collection<IRevokedToken>("revoked_tokens").findOne({ token_jti: payload.jti });
            if (isRevoked) {
                return res.status(401).json({ detail: "Refresh token has been revoked, please log in again" });
            }
        }

        const user = await db.collection<IUser>("users").findOne({
            $or: [{ id: payload.sub }],
        });

        if (!user || user.is_active === false) {
            return res.status(401).json({ detail: "User not found or inactive" });
        }

        // Token Rotation: revoke old refresh token
        if (payload.jti && payload.exp) {
            await db.collection("revoked_tokens").insertOne({
                id: uuidv4(),
                token_jti: payload.jti,
                user_id: user.id,
                expires_at: new Date(payload.exp * 1000),
                created_at: new Date(),
            });
        }

        const userId = user.id || user._id?.toString() || "";
        const newAccessToken = createAccessToken(userId);
        const { token: newRefreshToken } = createRefreshToken(userId);

        return res.status(200).json({
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
            token_type: "bearer",
        });
    } catch (err) {
        console.error("Refresh error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// POST /api/auth/logout
AuthRouter.post("/logout", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const { refresh_token } = req.body;

        if (refresh_token) {
            try {
                const payload = decodeToken(refresh_token);
                if (payload.jti && payload.sub && payload.exp) {
                    await db.collection("revoked_tokens").insertOne({
                        id: uuidv4(),
                        token_jti: payload.jti,
                        user_id: payload.sub,
                        expires_at: new Date(payload.exp * 1000),
                        created_at: new Date(),
                    });
                }
            } catch (err) {
                // Ignore if already invalid
            }
        }

        return res.status(200).json({ message: "Logged out successfully" });
    } catch (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// POST /api/auth/forgot-password
AuthRouter.post("/forgot-password", createLimiter(3), async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const { email } = req.body;
        const cleanEmail = (email || "").trim().toLowerCase();

        const user = await db.collection<IUser>("users").findOne({ email: cleanEmail });
        if (user && user.is_active !== false) {
            // Invalidate unused previous OTPs
            await db.collection("password_reset_otps").updateMany(
                { user_id: user.id, is_used: false },
                { $set: { is_used: true } }
            );

            // Generate 6-digit numeric OTP
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expireMinutes = Number(process.env.OTP_EXPIRE_MINUTES) || 10;
            const expiresAt = new Date(Date.now() + expireMinutes * 60 * 1000);

            await db.collection<IPasswordResetOtp>("password_reset_otps").insertOne({
                id: uuidv4(),
                user_id: user.id,
                otp_code: otpCode,
                is_used: false,
                expires_at: expiresAt,
                created_at: new Date(),
            });

            // Send email asynchronously
            sendOtpEmail(user.email, otpCode, user.name).catch((e) => console.error(e));
        }

        return res.status(200).json({
            message: "If your email is registered in our system, a 6-digit OTP code has been sent.",
        });
    } catch (err) {
        console.error("Forgot password error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// POST /api/auth/reset-password
AuthRouter.post("/reset-password", createLimiter(5), async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const { email, otp, new_password } = req.body;

        const cleanEmail = (email || "").trim().toLowerCase();
        const cleanOtp = (otp || "").toString().trim();
        const cleanNewPassword = (new_password || "").toString();

        if (!cleanEmail || !cleanOtp || cleanOtp.length !== 6 || !cleanNewPassword || cleanNewPassword.length < 6) {
            return res.status(400).json({ detail: "Invalid email, OTP, or new password" });
        }

        const user = await db.collection<IUser>("users").findOne({ email: cleanEmail });
        if (!user) {
            return res.status(400).json({ detail: "Invalid email or OTP code" });
        }

        const otpRecord = await db.collection<IPasswordResetOtp>("password_reset_otps").findOne({
            user_id: user.id,
            otp_code: cleanOtp,
            is_used: false,
            expires_at: { $gt: new Date() },
        });

        if (!otpRecord) {
            return res.status(400).json({ detail: "Invalid or expired OTP code" });
        }

        // Mark OTP as used
        await db.collection("password_reset_otps").updateOne(
            { id: otpRecord.id },
            { $set: { is_used: true } }
        );

        // Update password
        const hashed = await hashPassword(cleanNewPassword);
        await db.collection("users").updateOne(
            { id: user.id },
            {
                $set: {
                    password: hashed,
                    updated_at: new Date(),
                },
            }
        );

        return res.status(200).json({
            message: "Password has been successfully reset. You can now log in with your new password.",
        });
    } catch (err) {
        console.error("Reset password error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// GET /api/auth/me
AuthRouter.get("/me", authenticate, async (req: Request, res: Response) => {
    if (!req.user) {
        return res.status(401).json({ detail: "Could not validate credentials" });
    }
    return res.status(200).json(sanitizeUser(req.user));
});

// Legacy support: POST /verify/send-otp
AuthRouter.post("/verify/send-otp", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const { email } = req.body;
        const cleanEmail = (email || "").trim().toLowerCase();

        const user = await db.collection<IUser>("users").findOne({ email: cleanEmail });
        if (!user) {
            return res.status(404).json({ status: "fail", message: "User not found" });
        }

        if (user.email_verified_at || user.is_verified) {
            return res.status(400).json({ status: "fail", message: "Email is already verified" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await db.collection("users").updateOne(
            { id: user.id },
            { $set: { otp: otp, otp_expires_at: expiresAt, updated_at: new Date() } }
        );

        sendOtpEmail(user.email, otp, user.name).catch((e) => console.error(e));

        return res.status(200).json({
            status: "success",
            message: "Kode OTP berhasil dikirim ke email",
            data: { email: cleanEmail, otp_expires_at: expiresAt },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

// Legacy support: POST /verify/confirm-otp
AuthRouter.post("/verify/confirm-otp", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const { email, otp } = req.body;
        const cleanEmail = (email || "").trim().toLowerCase();
        const otpCode = (otp ?? req.body.code)?.toString().trim();

        const user = await db.collection<IUser>("users").findOne({ email: cleanEmail });
        if (!user) {
            return res.status(404).json({ status: "fail", message: "User not found" });
        }

        if (user.otp !== otpCode || (user.otp_expires_at && new Date() > new Date(user.otp_expires_at))) {
            return res.status(400).json({ status: "fail", message: "Kode OTP tidak valid atau kedaluwarsa" });
        }

        const now = new Date();
        await db.collection("users").updateOne(
            { id: user.id },
            {
                $set: { is_verified: true, email_verified_at: now, updated_at: now },
                $unset: { otp: "", otp_expires_at: "" },
            }
        );

        return res.status(200).json({
            status: "success",
            message: "Email berhasil diverifikasi",
            data: { email: user.email, email_verified_at: now },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

export default AuthRouter;
