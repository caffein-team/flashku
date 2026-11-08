import { IUser } from "../types/auth";
import jwt from "jsonwebtoken";
const jwtSecret = process.env.JWT_SECRET as string;
const jwtExpired = process.env.JWT_EXP as string;

export function createAuthToken(sessionData: IUser) : string{
    const token = jwt.sign({
        data: sessionData
    }, jwtSecret, {
        expiresIn: jwtExpired as any || '1d',
        algorithm: "HS256"
    });

    return token;
}