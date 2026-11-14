import { ObjectId } from "mongodb";

export interface IPhrase {
    id?: string;
    phrase_id?: string;
    surface_form: string;
    dictionary_form: string;
    reading: string;
    romaji: string;
    romanization?: string;
    part_of_speech?: string;
    weight?: number;
    meaning?: string | null;
    word_order: number;
}

export interface ILyricRow {
    id?: string;
    row_order: number;
    raw_text: string;
    start_time: number;
    end_time: number;
    romaji?: string | null;
    romanization?: string | null;
    translation?: string | null;
    phrases: IPhrase[];
}

export interface ISong {
    _id?: ObjectId;
    youtube_id: string;
    title: string;
    artist?: string;
    duration_seconds: number;
    thumbnail_url: string;
    audio_path: string;
    language: string;
    lyrics_status: "synced" | "plain" | "custom" | "not_found";
    lyrics_message?: string;
    lyric_rows: ILyricRow[];
    created_at: Date;
    updated_at?: Date;
}

export interface IUserSong {
    _id?: ObjectId;
    user_id: ObjectId;
    song_id: ObjectId;
    is_favorite: boolean;
    added_at: Date;
}

export interface SongImportBody {
    youtube_url: string;
    custom_lrc?: string;
    custom_title?: string;
    custom_artist?: string;
    language?: string;
}

export interface UpdateSongLyricsBody {
    custom_lrc?: string;
    plain_lyrics?: string;
}
