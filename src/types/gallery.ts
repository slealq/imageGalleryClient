export interface ImageData {
    id: string;
    filename: string;
    size: number;
    created_at: string;
    width: number;
    height: number;
    has_caption: boolean;
    collection_name: string;
    has_tags: boolean;
    has_crop: boolean;
    mime_type: string;
}

export interface Row {
    type: 'landscape' | 'portrait';
    images: ImageData[];
} 