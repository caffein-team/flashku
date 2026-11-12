import { ObjectId } from "mongodb";
import { ISong } from "./song";

export interface IDeck {
    _id?: ObjectId;
    user_id: ObjectId;
    name: string;
    description?: string | null;
    song_ids: ObjectId[];
    created_at: Date;
    updated_at: Date;
}

export interface IDeckResponse {
    id: string;
    user_id: string;
    name: string;
    description?: string | null;
    total_songs: number;
    created_at: Date;
    updated_at: Date;
}

export interface IDeckDetailResponse extends IDeckResponse {
    songs: (ISong & { is_favorite?: boolean })[];
}

export interface CreateDeckBody {
    name: string;
    description?: string;
}

export interface UpdateDeckBody {
    name?: string;
    description?: string;
}

export interface AddSongToDeckBody {
    song_id: string;
}
