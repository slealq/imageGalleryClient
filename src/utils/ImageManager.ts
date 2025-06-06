import { getImageCaption, saveImageCaption, getCroppedImage, getImageUrl, getCrop, API_BASE_URL, exportImages, warmupCache } from './api';

export interface ImageMetadata {
    id: string;
    url: string;
    filename: string;
    size: number;
    created: string;
    collection_name?: string;
    has_caption?: boolean | null;
    has_crop?: boolean;
    has_tags?: boolean;
    is_selected?: boolean;
    caption?: string | null;
}

export interface FilterState {
    actor?: string;
    tag?: string;
    year?: string;
    has_caption?: boolean;
    has_crop?: boolean;
}

export class ImageWrapper {
    private metadata: ImageMetadata;
    private croppedImage: Blob | null = null;
    private image: Blob | null = null;

    constructor(metadata: ImageMetadata) {
        this.metadata = metadata;
    }

    async initialize() {
        // Only fetch caption if we know the image has one
        if (this.metadata.has_caption) {
            await this.fetchCaption();
        }
    }

    private async fetchCaption() {
        try {
            const caption = await getImageCaption(this.metadata.id);
            this.metadata.caption = caption;
            this.metadata.has_caption = caption.length > 0;
        } catch (error) {
            console.error('Error fetching caption:', error);
            this.metadata.caption = null;
            this.metadata.has_caption = false;
        }
    }

    getId(): string {
        return this.metadata.id;
    }

    getUrl(): string {
        return this.metadata.url;
    }

    getFilename(): string {
        return this.metadata.filename;
    }

    getSize(): number {
        return this.metadata.size;
    }

    getCreated(): string {
        return this.metadata.created;
    }

    getMetadata(): ImageMetadata {
        return this.metadata;
    }

    async getCaption(): Promise<string> {
        if (this.metadata.has_caption === null) {
            await this.fetchCaption();
        }
        return this.metadata.caption || '';
    }

    async saveCaption(caption: string): Promise<void> {
        await saveImageCaption(this.metadata.id, caption);
        this.metadata.caption = caption;
        this.metadata.has_caption = caption.length > 0;
    }

    async getCroppedImage(): Promise<Blob | null> {
        if (!this.metadata.has_crop) {
            return null;
        }
        try {
            return await getCroppedImage(this.metadata.id);
        } catch (error) {
            console.error('Error fetching cropped image:', error);
            return null;
        }
    }

    updateMetadata(properties: Partial<ImageMetadata>) {
        this.metadata = { ...this.metadata, ...properties };
    }

    setSelected(selected: boolean) {
        this.metadata.is_selected = selected;
    }

    isSelected(): boolean {
        return this.metadata.is_selected || false;
    }
}

export class ImageManager {
    private static instance: ImageManager;
    private images: Map<string, ImageWrapper> = new Map();
    private imageSequence: string[] = []; // Array to maintain image order
    private baseUrl: string = API_BASE_URL;
    private currentFilter: FilterState = {};
    private warmupInProgress: boolean = false;

    private constructor() {}

    static getInstance(): ImageManager {
        if (!ImageManager.instance) {
            ImageManager.instance = new ImageManager();
        }
        return ImageManager.instance;
    }

    getImageUrl(imageId: string): string {
        return `${this.baseUrl}/images/${imageId}`;
    }

    async addImage(metadata: ImageMetadata): Promise<ImageWrapper> {
        const image = new ImageWrapper(metadata);
        await image.initialize();
        this.images.set(metadata.id, image);
        // Only add to sequence if not already present
        if (!this.imageSequence.includes(metadata.id)) {
            this.imageSequence.push(metadata.id);
        }
        return image;
    }

    // New method to set the image sequence
    setImageSequence(imageIds: string[]): void {
        // Filter out any IDs that don't exist in our images map
        const validIds = imageIds.filter(id => this.images.has(id));
        this.imageSequence = validIds;
    }

    // New method to get the current sequence
    getImageSequence(): string[] {
        return [...this.imageSequence];
    }

    getImage(id: string): ImageWrapper | undefined {
        return this.images.get(id);
    }

    getImageProperties(id: string): ImageMetadata | undefined {
        return this.images.get(id)?.getMetadata();
    }

    async createImageFromUrl(
        url: string, 
        id: string, 
        filename: string, 
        size: number, 
        created: string,
        has_caption?: boolean,
        has_crop?: boolean,
        has_tags?: boolean
    ): Promise<ImageWrapper> {
        const metadata: ImageMetadata = {
            id,
            url,
            filename,
            size,
            created,
            has_caption,
            has_crop,
            has_tags
        };
        return this.addImage(metadata);
    }

    getSelectedImages(): ImageWrapper[] {
        return Array.from(this.images.values()).filter(img => img.isSelected());
    }

    clearSelection() {
        this.images.forEach(img => img.setSelected(false));
    }

    // Updated navigation methods to use the sequence
    getNextImage(currentId: string): ImageWrapper | undefined {
        const currentIndex = this.getImageIndex(currentId);
        if (currentIndex === -1 || currentIndex === this.imageSequence.length - 1) {
            return undefined;
        }
        return this.images.get(this.imageSequence[currentIndex + 1]);
    }

    getPreviousImage(currentId: string): ImageWrapper | undefined {
        const currentIndex = this.getImageIndex(currentId);
        if (currentIndex <= 0) {
            return undefined;
        }
        return this.images.get(this.imageSequence[currentIndex - 1]);
    }

    getImageIndex(id: string): number {
        return this.imageSequence.indexOf(id);
    }

    getTotalImages(): number {
        return this.imageSequence.length;
    }

    async exportSelectedImages(): Promise<void> {
        const selectedImages = this.getSelectedImages();
        if (selectedImages.length === 0) {
            throw new Error('No images selected');
        }

        console.log('Selected images for export:', selectedImages.map(img => ({
            id: img.getId(),
            filename: img.getFilename(),
            hasCrop: img.getMetadata().has_crop,
            hasCaption: img.getMetadata().has_caption
        })));

        try {
            const blob = await exportImages(selectedImages.map(img => img.getId()));
            
            if (!blob || blob.size === 0) {
                throw new Error('Received empty zip file from server');
            }

            // Create a temporary URL for the blob
            const url = URL.createObjectURL(blob);
            
            // Create a temporary link element
            const link = document.createElement('a');
            link.href = url;
            link.download = `exported_images_${new Date().toISOString().split('T')[0]}.zip`;
            
            // Append to body, click, and remove
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up the URL object
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting images:', error);
            throw error;
        }
    }

    public setFilter(filter: FilterState): void {
        this.currentFilter = { ...filter };
        this.clearImageSequence();
        this.startWarmup(1);
    }

    public getCurrentFilter(): FilterState {
        return { ...this.currentFilter };
    }

    public clearFilter(): void {
        this.currentFilter = {};
        this.clearImageSequence();
    }

    public hasActiveFilter(): boolean {
        return Object.values(this.currentFilter).some(value => value !== undefined && value !== '');
    }

    private clearImageSequence(): void {
        this.imageSequence = [];
    }

    public async startWarmup(pageNum: number): Promise<void> {
        if (this.warmupInProgress) {
            console.log('Cache warmup already in progress, skipping...');
            return;
        }

        console.log('Starting cache warmup with filters:', this.currentFilter);
        this.warmupInProgress = true;
        let currentPage = pageNum;
        const pageEnd = 2 + currentPage; // Number of pages to warmup at once
        let hasMorePages = true;

        try {
            while (hasMorePages && currentPage < pageEnd)
            {
                console.log(`Warming up cache for page ${currentPage} of ${pageEnd}...`);
                const response = await warmupCache({
                    startPage: currentPage,
                    ...this.currentFilter
                });

                if (!response.hasMorePages) {
                    console.log('No more pages to warm up');
                    hasMorePages = false;
                }

                console.log(`Successfully warmed up pages ${currentPage} of ${pageEnd}`);
                currentPage += 1;
            }

            console.log('Cache warmup completed successfully');
        } catch (error) {
            console.error('Error during cache warmup:', error);
        } finally {
            this.warmupInProgress = false;
            console.log('Cache warmup process finished');
        }
    }
}

// Make ImageManager globally available
declare global {
    interface Window {
        imageManager: ImageManager;
    }
}

// Only assign to window if we're in a browser environment
if (typeof window !== 'undefined') {
    window.imageManager = ImageManager.getInstance();
} 