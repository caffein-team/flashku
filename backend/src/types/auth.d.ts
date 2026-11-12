import { ObjectId } from "mongodb";

export interface IUser {
    _id?: ObjectId;
    name: string;
    username?: string;
    email: string;
    email_verified_at?: Date;
    otp?: string;
    otp_expires_at?: Date;
    password?: string;
    avatar?: string | null;
    level?: number;
    created_at: Date;
    updated_at?: Date;
}

declare global {
    namespace Express {
        interface Request {
            user?: IUser;
        }
    }
}
