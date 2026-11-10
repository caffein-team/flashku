import { ObjectId } from "mongodb";

export interface IUser {
    _id?: ObjectId;
    id: string;
    name: string;
    email: string;
    username: string;
    password?: string;
    avatar?: string | null;
    level: number;
    is_active: boolean;
    is_verified: boolean;
    created_at: Date;
    updated_at: Date;
    // legacy support fields
    email_verified_at?: Date;
    otp?: string;
    otp_expires_at?: Date;
}

export interface IPasswordResetOtp {
    _id?: ObjectId;
    id: string;
    user_id: string;
    otp_code: string;
    is_used: boolean;
    expires_at: Date;
    created_at: Date;
}

export interface IRevokedToken {
    _id?: ObjectId;
    id: string;
    token_jti: string;
    user_id: string;
    expires_at: Date;
    created_at: Date;
}

export interface ISong {
    _id?: ObjectId;
    id: string;
    youtube_id: string;
    title: string;
    artist?: string | null;
    duration_seconds?: number | null;
    thumbnail_url?: string | null;
    audio_path: string;
    language: string;
    lyrics_status: "synced" | "plain" | "custom" | "not_found";
    lyrics_message?: string | null;
    created_at: Date;
}

export interface IUserHasSong {
    _id?: ObjectId;
    id: string;
    user_id: string;
    song_id: string;
    is_favorite: boolean;
    added_at: Date;
}

export interface ILyricRow {
    _id?: ObjectId;
    id: string;
    song_id: string;
    row_order: number;
    raw_text: string;
    start_time: number;
    end_time: number;
    translation?: string | null;
    created_at: Date;
}

export interface IPhrase {
    _id?: ObjectId;
    id: string;
    lyric_row_id: string;
    song_id: string;
    surface_form: string;
    dictionary_form: string;
    reading: string;
    romaji?: string | null;
    romanization?: string | null;
    part_of_speech?: string | null;
    meaning?: string | null;
    word_order: number;
    created_at: Date;
}

export interface IDeck {
    _id?: ObjectId;
    id: string;
    user_id: string;
    name: string;
    description?: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface IDeckHasSong {
    _id?: ObjectId;
    deck_id: string;
    song_id: string;
    added_at: Date;
}

export interface IStudySession {
    _id?: ObjectId;
    id: string;
    user_id: string;
    song_id?: string | null;
    deck_id?: string | null;
    total_phrases: number;
    created_at: Date;
}

export interface IStudyAttempt {
    _id?: ObjectId;
    id: string;
    session_id: string;
    user_id: string;
    phrase_id: string;
    rating: "again" | "hard" | "good" | "easy";
    created_at: Date;
}

export interface IUserPhraseStats {
    _id?: ObjectId;
    id: string;
    user_id: string;
    phrase_id: string;
    repetition_count: number;
    interval_days: number;
    ease_factor: number;
    next_review_at: Date;
    last_rating?: string | null;
    updated_at: Date;
}

export interface TokenPayload {
    sub: string;
    type: "access" | "refresh";
    jti?: string;
    iat?: number;
    exp?: number;
    [key: string]: any;
}
