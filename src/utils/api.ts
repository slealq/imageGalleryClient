export const API_BASE_URL = 'http://192.168.68.64:8001';

// Add logging utility
const logApiCall = (caller: string, endpoint: string, startTime: number, success: boolean, error?: any) => {
    const duration = Date.now() - startTime;
    const durationFormatted = duration > 1000 
        ? `${(duration / 1000).toFixed(2)}s` 
        : `${duration}ms`;
    
    // Extract image ID from endpoint if it exists
    const imageIdMatch = endpoint.match(/\/images\/([^\/]+)/);
    const imageId = imageIdMatch ? imageIdMatch[1] : null;
    
    const logMessage = {
        timestamp: new Date().toISOString(),
        caller: caller.replace('.ts', ''), // Remove .ts extension for cleaner logs
        endpoint: endpoint.split('/').pop() || endpoint, // Show just the last part of the endpoint
        fullEndpoint: endpoint, // Keep the full endpoint for reference
        duration: durationFormatted,
        success,
        ...(imageId && { imageId }), // Include imageId if available
        ...(error && { 
            error: error.message || error,
            status: error.status,
            statusText: error.statusText
        })
    };

    // Use console.group for better organization
    console.group(`📡 API Call: ${logMessage.caller} → ${logMessage.endpoint} (${logMessage.duration})`);
    console.log('Details:', logMessage);
    if (error) {
        console.error('Error:', error);
    }
    console.groupEnd();
};

// Improved caller detection
const getCallerName = () => {
    try {
        const stack = new Error().stack;
        if (!stack) return 'unknown';
        
        // Split stack into lines and remove empty lines
        const stackLines = stack.split('\n').filter(line => line.trim());
        
        // Look for the first line that's not from our api.ts file
        for (let i = 0; i < stackLines.length; i++) {
            const line = stackLines[i];
            // Skip lines from api.ts
            if (line.includes('api.ts')) continue;
            
            // Try to extract component name
            const componentMatch = line.match(/at\s+(\w+)\s+\(/);
            if (componentMatch) {
                return componentMatch[1];
            }
            
            // Try to extract function name
            const functionMatch = line.match(/at\s+(\w+)/);
            if (functionMatch) {
                return functionMatch[1];
            }
        }
        
        // If we can't find a specific caller, return the first non-api.ts line
        const firstNonApiLine = stackLines.find(line => !line.includes('api.ts'));
        if (firstNonApiLine) {
            return firstNonApiLine.split('/').pop()?.split(':')[0] || 'unknown';
        }
        
        return 'unknown';
    } catch (error) {
        console.error('Error getting caller name:', error);
        return 'unknown';
    }
};

export interface ImageGData {
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

interface ImagesMetadataRequest {
    page?: number;
    actor?: string;
    tag?: string;
    year?: string;
    has_caption?: boolean;
    has_crop?: boolean;
}

export interface ImagesMetadataResponse {
    images: ImageGData[];
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

export interface Filters {
    actors: string[];
    tags: string[];
    years: string[];
}

interface FetchImagesBatchParams {
    startPage?: number;
    numPages?: number;
    actor?: string;
    tag?: string;
    year?: string;
    has_caption?: boolean;
    has_crop?: boolean;
}

interface WarmupCacheParams {
    startPage?: number;
    page_size?: number;
    numPages?: number;
    actor?: string;
    tag?: string;
    year?: string;
    has_caption?: boolean;
    has_crop?: boolean;
}

interface WarmupCacheResponse {
    status: number;
    hasMorePages: boolean;
}

export async function fetchImagesMetadata({ 
    page = 1, 
    actor, 
    tag, 
    year, 
    has_caption, 
    has_crop 
}: ImagesMetadataRequest = {}): Promise<ImagesMetadataResponse> {
    const startTime = Date.now();
    const caller = getCallerName();
    const params = new URLSearchParams({
        page: page.toString(),
    });

    if (actor) params.append('actor', actor);
    if (tag) params.append('tag', tag);
    if (year) params.append('year', year);
    if (has_caption !== undefined) params.append('has_caption', has_caption.toString());
    if (has_crop !== undefined) params.append('has_crop', has_crop.toString());

    try {
        const response = await fetch(`${API_BASE_URL}/images?${params.toString()}`);
        if (!response.ok) {
            throw new Error('Failed to fetch images');
        }
        const data = await response.json();
        // Ensure each image has a URL
        data.images = data.images.map((img: ImageGData) => ({
            ...img,
            url: getImageUrl(img.id)
        }));
        logApiCall(caller, '/images', startTime, true);
        return data;
    } catch (error) {
        logApiCall(caller, '/images', startTime, false, error);
        console.error('Error fetching images:', error);
        throw error;
    }
}

export async function fetchImagesBatch({ 
    startPage = 1, 
    numPages = 3,
    actor, 
    tag, 
    year, 
    has_caption, 
    has_crop 
}: FetchImagesBatchParams = {}): Promise<ImagesMetadataResponse[]> {
    const params = new URLSearchParams({
        start_page: startPage.toString(),
        num_pages: numPages.toString(),
    });

    if (actor) params.append('actor', actor);
    if (tag) params.append('tag', tag);
    if (year) params.append('year', year);
    if (has_caption !== undefined) params.append('has_caption', has_caption.toString());
    if (has_crop !== undefined) params.append('has_crop', has_crop.toString());

    try {
        const response = await fetch(`${API_BASE_URL}/images/batch?${params.toString()}`);
        if (!response.ok) {
            throw new Error('Failed to fetch images batch');
        }
        const data = await response.json();
        // Ensure each image has a URL
        return data.map((page: ImagesMetadataResponse) => ({
            ...page,
            images: page.images.map((img: ImageGData) => ({
                ...img,
                url: getImageUrl(img.id)
            }))
        }));
    } catch (error) {
        console.error('Error fetching images batch:', error);
        throw error;
    }
}

export function getImageUrl(imageId: string): string {
    return `${API_BASE_URL}/images/${imageId}`;
}

export async function getImageCaption(imageId: string): Promise<string> {
    const startTime = Date.now();
    const caller = getCallerName();
    try {
        const response = await fetch(`${API_BASE_URL}/images/${imageId}/caption`);
        if (!response.ok) {
            if (response.status === 404) {
                logApiCall(caller, `/images/${imageId}/caption`, startTime, true);
                return '';
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: CaptionResponse = await response.json();
        logApiCall(caller, `/images/${imageId}/caption`, startTime, true);
        return data.caption;
    } catch (error) {
        logApiCall(caller, `/images/${imageId}/caption`, startTime, false, error);
        throw error;
    }
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
    const startTime = Date.now();
    const caller = getCallerName();
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
        let accumulatedCaption = '';

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
                            accumulatedCaption += data.chunk;
                            onChunk(accumulatedCaption);
                        } else if (data.error) {
                            throw new Error(data.error);
                        }
                    } catch (e) {
                        console.error('Error parsing chunk:', e);
                    }
                }
            }
        }
        
        logApiCall(caller, `/api/stream-caption/${imageId}`, startTime, true);
        onComplete(accumulatedCaption);
    } catch (error) {
        logApiCall(caller, `/api/stream-caption/${imageId}`, startTime, false, error);
        onError(error instanceof Error ? error : new Error('Unknown error occurred'));
    }
}

export function getImagePreviewUrl(imageId: string, targetSize: number): string {
    return `${API_BASE_URL}/images/${imageId}/preview/${targetSize}`;
}

export async function cropImage(imageId: string, targetSize: number, normalizedDeltas: NormalizedDeltas): Promise<Blob> {
    const startTime = Date.now();
    const caller = getCallerName();
    try {
        const response = await fetch(
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
        
        const blob = await response.blob();
        logApiCall(caller, `/images/${imageId}/crop`, startTime, true);
        return blob;
    } catch (error) {
        logApiCall(caller, `/images/${imageId}/crop`, startTime, false, error);
        throw error;
    }
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
    const startTime = Date.now();
    const caller = getCallerName();
    try {
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
        
        const blob = await response.blob();
        logApiCall(caller, `/images/${imageId}/cropped`, startTime, true);
        return blob;
    } catch (error) {
        logApiCall(caller, `/images/${imageId}/cropped`, startTime, false, error);
        throw error;
    }
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

export async function getAvailableFilters(): Promise<Filters> {
    try {
        const response = await fetch(`${API_BASE_URL}/filters`);
        if (!response.ok) {
            throw new Error(`Failed to fetch filters: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching filters:', error);
        throw error;
    }
}

export async function warmupCache2({ 
    startPage = 1, 
    numPages = 3,
    actor, 
    tag, 
    year, 
    has_caption, 
    has_crop 
}: WarmupCacheParams = {}): Promise<WarmupCacheResponse> {
    const startTime = Date.now();
    const caller = getCallerName();
    
    const requestBody = {
        start_page: startPage,
        num_pages: numPages,
        ...(actor && { actor }),
        ...(tag && { tag }),
        ...(year && { year }),
        ...(has_caption !== undefined && { has_caption }),
        ...(has_crop !== undefined && { has_crop })
    };

    try {
        const response = await fetch(`${API_BASE_URL}/cache/warmup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });
        logApiCall(caller, '/cache/warmup', startTime, response.ok);
        return {
            status: response.status,
            hasMorePages: response.ok
        };
    } catch (error) {
        logApiCall(caller, '/cache/warmup', startTime, false, error);
        console.error('Error warming up cache:', error);
        throw error;
    }
} 

export async function warmupCache({ 
    startPage = 1,
    page_size = 10,
    actor, 
    tag, 
    year, 
    has_caption, 
    has_crop 
}: WarmupCacheParams = {}): Promise<WarmupCacheResponse> {
    const startTime = Date.now();
    const caller = getCallerName();
    const params = new URLSearchParams({
        page: startPage.toString(),
        page_size: page_size.toString(),
    });

    if (actor) params.append('actor', actor);
    if (tag) params.append('tag', tag);
    if (year) params.append('year', year);
    if (has_caption !== undefined) params.append('has_caption', has_caption.toString());
    if (has_crop !== undefined) params.append('has_crop', has_crop.toString());

    try {
        const response = await fetch(`${API_BASE_URL}/cache/warmup?${params.toString()}`, 
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: ''
            });

        if (!response.ok) {
            throw new Error('Failed to warmup cache images');
        }
        logApiCall(caller, '/cache/warmup', startTime, response.ok);
        
        const data = await response.json();

        console.log('Cache warmup progress:', {
            currentPage: data.page,
            totalPages: data.total_pages,
            timestamp: new Date().toLocaleTimeString()
        });

        return {
            status: response.status,
            hasMorePages: data.page < data.total_pages,
        };
    } catch (error) {
        logApiCall(caller, '/cache/warmup', startTime, false, error);
        console.error('Error warming up cache:', error);
        throw error;
    }
}
