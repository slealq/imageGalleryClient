export const API_BASE_URL = 'http://192.168.68.70:8001';

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
    url?: string;
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

export interface NormalizedDeltas {
    x: number;
    y: number;
}

export interface CropRequest {
    imageId: string;
    targetSize: number;
    normalizedDeltas: NormalizedDeltas;
}

export interface CropInfo {
    targetSize: number;
    normalizedDeltas: NormalizedDeltas;
}

export interface CropResponse {
    cropInfo: CropInfo;
    imageUrl: string;
}

export interface GenerateCaptionRequest {
    prompt?: string;
}

export async function fetchImages(page: number = 1, pageSize: number = 30): Promise<ImagesResponse> {
    const response = await fetch(`${API_BASE_URL}/images?page=${page}&page_size=${pageSize}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    // Ensure each image has a URL
    data.images = data.images.map((img: ImageData) => ({
        ...img,
        url: getImageUrl(img.id)
    }));
    return data;
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

export async function generateImageCaption(imageId: string, prompt?: string): Promise<string> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/generate-caption/${imageId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt }),
        });

        if (!response.ok) {
            throw new Error('Failed to generate caption');
        }

        const data = await response.json();
        return data.caption;
    } catch (error) {
        console.error('Error generating caption:', error);
        throw error;
    }
}

export async function streamImageCaption(
    imageId: string, 
    prompt: string | undefined,
    onChunk: (chunk: string) => void,
    onComplete: (finalCaption: string) => void,
    onError: (error: Error) => void
): Promise<void> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/stream-caption/${imageId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt }),
        });

        if (!response.ok) {
            throw new Error('Failed to stream caption');
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('Failed to get response reader');
        }

        const decoder = new TextDecoder();
        let accumulatedCaption = '';  // Accumulate all chunks

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.chunk) {
                            accumulatedCaption += data.chunk;  // Append new chunk
                            onChunk(accumulatedCaption);  // Send the accumulated text
                        } else if (data.error) {
                            throw new Error(data.error);
                        }
                    } catch (e) {
                        console.error('Error parsing chunk:', e);
                    }
                }
            }
        }
        
        onComplete(accumulatedCaption);
    } catch (error) {
        onError(error instanceof Error ? error : new Error('Unknown error occurred'));
    }
}

export function getImagePreviewUrl(imageId: string, targetSize: number): string {
    return `${API_BASE_URL}/images/${imageId}/preview/${targetSize}`;
}

export async function cropImage(imageId: string, targetSize: number, normalizedDeltas: NormalizedDeltas): Promise<Blob> {
    const response = await fetch (
        `${API_BASE_URL}/images/${imageId}/crop`, 
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(
                { 
                    "imageId": imageId, 
                    "targetSize": targetSize,  
                    "normalizedDeltas": {
                        "x": normalizedDeltas.x,
                        "y": normalizedDeltas.y
                    } 
                }
            ),
        }
    );
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.blob();
}

export async function getCrop(imageId: string): Promise<CropResponse> {
    const response = await fetch(`${API_BASE_URL}/images/${imageId}/crop`);
    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('No crop found for this image');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

export async function getCroppedImage(imageId: string): Promise<Blob> {
    const timestamp = new Date().getTime();
    const response = await fetch(`${API_BASE_URL}/images/${imageId}/cropped?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.blob();
}

export async function exportImages(imageIds: string[]): Promise<Blob> {
    console.log('Exporting images:', imageIds);
    
    const response = await fetch(`${API_BASE_URL}/api/export-images`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageIds })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Export failed:', {
            status: response.status,
            statusText: response.statusText,
            error: errorText
        });
        throw new Error(`Failed to export images: ${response.statusText}`);
    }

    const blob = await response.blob();
    console.log('Export response:', {
        type: blob.type,
        size: blob.size
    });

    if (blob.size === 0) {
        throw new Error('Received empty zip file from server');
    }

    return blob;
} 