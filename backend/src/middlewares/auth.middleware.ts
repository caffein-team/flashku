import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db";
import { IUser } from "../types/auth";

const jwtSecret = process.env.JWT_SECRET as string;

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers["authorization"];
        const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

        if (!token) {
            return res.status(401).json({
                status: "fail",
                message: "Unauthorized: Access token is required"
            });
        }

        const decoded = jwt.verify(token, jwtSecret) as { data: IUser };
        if (!decoded || !decoded.data || !decoded.data._id) {
            return res.status(401).json({
                status: "fail",
                message: "Unauthorized: Invalid token payload"
            });
        }

        const db = getDB();
        const user = await db.collection<IUser>("users").findOne({
            _id: new ObjectId(decoded.data._id)
        });

        if (!user) {
            return res.status(401).json({
                status: "fail",
                message: "Unauthorized: User not found"
            });
        }

        delete user.password;
        req.user = user;
        next();
    } catch (err: unknown) {
        return res.status(401).json({
            status: "fail",
            message: "Unauthorized: Token is invalid or expired"
        });
    }
};
