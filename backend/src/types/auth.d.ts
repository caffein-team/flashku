import { ObjectId } from "mongodb";

export interface IUser {
    _id?: ObjectId,
    name: string,
    email: string,
    email_verified?: Date;
    password?: string,
    avatar?: string;
    created_at: Date,
    updated_at?: Date,
}