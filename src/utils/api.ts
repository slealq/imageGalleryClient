const API_BASE_URL = 'http://127.0.0.1:8000';

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
}

export interface ImagesResponse {
    images: ImageData[];
    total_pages: number;
    total: number;
    page: number;
    page_size: number;
}

export interface CaptionResponse {
    caption: string;
}

export async function fetchImages(page: number = 1, pageSize: number = 20): Promise<ImagesResponse> {
    const response = await fetch(`${API_BASE_URL}/images?page=${page}&page_size=${pageSize}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

export function getImageUrl(imageId: string): string {
    return `${API_BASE_URL}/images/${imageId}`;
}

export async function getImageCaption(imageId: string): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/images/${imageId}/caption`);
    if (!response.ok) {
        if (response.status === 404) {
            return '';
        }
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: CaptionResponse = await response.json();
    return data.caption;
}

export async function saveImageCaption(imageId: string, caption: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/images/${imageId}/caption`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ caption }),
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
}

export async function generateImageCaption(imageId: string): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/images/${imageId}/generate-caption`, {
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: CaptionResponse = await response.json();
    return data.caption;
} 