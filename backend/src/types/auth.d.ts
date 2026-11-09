import { ObjectId } from "mongodb";

export interface IUser {
    _id?: ObjectId;
    name: string;
    email: string;
    email_verified_at?: Date;
    otp?: string;
    otp_expires_at?: Date;
    password?: string;
    avatar?: string;
    created_at: Date;
    updated_at?: Date;
}

