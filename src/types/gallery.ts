export interface ImageData {
    id: string;
    filename: string;
    size: number;
    created_at: string;
    width: number;
    height: number;
    has_caption: boolean;
    has_tags: boolean;
    collection_name: string;
}

export interface Row {
    type: 'landscape' | 'portrait';
    images: ImageData[];
} 