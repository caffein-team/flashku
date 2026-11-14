import { ObjectId } from "mongodb";

export type SRSGradeRating = "again" | "hard" | "good" | "easy";

export interface IStudySession {
    _id?: ObjectId;
    user_id: ObjectId;
    song_id?: ObjectId | null;
    deck_id?: ObjectId | null;
    total_phrases: number;
    created_at: Date;
}

export interface IStudyAttempt {
    _id?: ObjectId;
    session_id: ObjectId;
    user_id: ObjectId;
    phrase_id: string;
    rating: SRSGradeRating;
    created_at: Date;
}

export interface IUserPhraseStats {
    _id?: ObjectId;
    user_id: ObjectId;
    phrase_id: string;
    repetition_count: number;
    interval_days: number;
    ease_factor: number;
    next_review_at: Date;
    last_rating: SRSGradeRating;
    weight?: number;
    lapse_count?: number;
    updated_at: Date;
}

export interface IStudyCard {
    phrase_id: string;
    surface_form: string;
    dictionary_form: string;
    reading: string;
    romaji?: string;
    romanization?: string;
    part_of_speech?: string;
    weight?: number;
    meaning?: string | null;
    lyric_row_id: string | number;
    row_order: number;
    raw_text: string;
    row_romaji?: string | null;
    row_romanization?: string | null;
    start_time: number;
    end_time: number;
    translation?: string | null;
    song_id: string;
    song_title: string;
    song_artist?: string;
    song_language: string;
    audio_path: string;
    thumbnail_url?: string;
    repetition_count: number;
    interval_days: number;
    ease_factor: number;
    next_review_at?: Date | null;
    last_rating?: string | null;
    lapse_count?: number;
}

export interface StudySessionBody {
    song_id?: string;
    deck_id?: string;
    limit?: number;
}

export interface StudyReviewBody {
    session_id: string;
    phrase_id: string;
    rating: SRSGradeRating;
}
