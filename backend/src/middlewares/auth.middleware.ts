import { Request, Response, NextFunction } from "express";
import { getDB } from "../config/db";
import { decodeToken } from "../utils/security";
import { IUser } from "../types";
import { ObjectId } from "mongodb";

export async function authenticate(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            detail: "Could not validate credentials",
        });
    }

    const token = authHeader.split(" ")[1];
    try {
        const payload = decodeToken(token);
        if (payload.type !== "access" || !payload.sub) {
            return res.status(401).json({
                detail: "Could not validate credentials",
            });
        }

        const db = getDB();
        let query: any = { id: payload.sub };
        if (ObjectId.isValid(payload.sub)) {
            query = {
                $or: [{ id: payload.sub }, { _id: new ObjectId(payload.sub) }],
            };
        }

        const user = await db.collection<IUser>("users").findOne(query);
        if (!user) {
            return res.status(401).json({
                detail: "Could not validate credentials",
            });
        }

        if (user.is_active === false) {
            return res.status(403).json({
                detail: "Inactive user account",
            });
        }

        // Format user object
        const formattedUser: IUser = {
            ...user,
            id: user.id || user._id?.toString() || payload.sub,
        };

        req.user = formattedUser;
        return next();
    } catch (err: any) {
        if (err.name === "TokenExpiredError") {
            return res.status(401).json({
                detail: "Access token has expired",
            });
        }
        return res.status(401).json({
            detail: "Could not validate credentials",
        });
    }
}
