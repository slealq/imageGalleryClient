export interface ImageData {
    id: string;
    filename: string;
    size: number;
    created_at: string;
    width: number;
    height: number;
}

export interface Row {
    type: 'landscape' | 'portrait';
    images: ImageData[];
} 