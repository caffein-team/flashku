import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { TokenPayload } from "../types";

const SALT_ROUNDS = 12;

export async function hashPassword(plainTextPassword: string): Promise<string> {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    return bcrypt.hash(plainTextPassword, salt);
}

export async function verifyPassword(
    plainTextPassword: string,
    storedHash: string
): Promise<boolean> {
    return bcrypt.compare(plainTextPassword, storedHash);
}

export function getJwtSecret(): string {
    return process.env.JWT_SECRET || process.env.JWT_SECRET_KEY || "default_jwt_secret_key";
}

export function createAccessToken(
    subject: string,
    extraClaims: Record<string, any> = {}
): string {
    const expireMinutes = Number(process.env.ACCESS_TOKEN_EXPIRE_MINUTES) || 15;
    const payload: TokenPayload = {
        sub: subject,
        type: "access",
        ...extraClaims,
    };

    return jwt.sign(payload, getJwtSecret(), {
        algorithm: "HS256",
        expiresIn: `${expireMinutes}m`,
    });
}

export function createRefreshToken(
    subject: string,
    jti?: string,
    extraClaims: Record<string, any> = {}
): { token: string; jti: string } {
    const expireDays = Number(process.env.REFRESH_TOKEN_EXPIRE_DAYS) || 30;
    const tokenJti = jti || uuidv4();
    const payload: TokenPayload = {
        sub: subject,
        type: "refresh",
        jti: tokenJti,
        ...extraClaims,
    };

    const token = jwt.sign(payload, getJwtSecret(), {
        algorithm: "HS256",
        expiresIn: `${expireDays}d`,
    });

    return { token, jti: tokenJti };
}

export function decodeToken(token: string): TokenPayload {
    return jwt.verify(token, getJwtSecret(), {
        algorithms: ["HS256"],
    }) as TokenPayload;
}
