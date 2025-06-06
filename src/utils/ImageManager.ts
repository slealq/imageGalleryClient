import { getImageCaption, saveImageCaption, getCroppedImage, getImageUrl, getCrop, API_BASE_URL, exportImages } from './api';

export interface ImageProperties {
    has_caption: boolean;
    has_tags: boolean;
    has_crop: boolean;
    is_selected: boolean;
}

export interface ImageMetadata {
    id: string;
    url: string;
    filename: string;
    size: number;
    created: string;
    collection_name?: string;
    has_caption?: boolean;
    has_crop?: boolean;
    has_tags?: boolean;
}

export interface FilterState {
    actor?: string;
    tag?: string;
    year?: string;
    has_caption?: boolean;
    has_crop?: boolean;
}

export class ImageData {
    private metadata: ImageMetadata;
    private properties: ImageProperties;
    private caption: string | null = null;
    private croppedImage: Blob | null = null;

    constructor(metadata: ImageMetadata) {
        this.metadata = metadata;
        this.properties = {
            has_caption: metadata.has_caption || false,
            has_tags: metadata.has_tags || false,
            has_crop: metadata.has_crop || false,
            is_selected: false
        };
    }

    async initialize() {
        // Only fetch caption if we know the image has one
        if (this.properties.has_caption) {
            await this.fetchCaption();
        }
        // Only fetch crop info if we know the image has one
        if (this.properties.has_crop) {
            await this.fetchCropInfo();
        }
    }

    private async fetchCaption() {
        try {
            const caption = await getImageCaption(this.metadata.id);
            this.caption = caption;
            this.properties.has_caption = caption.length > 0;
        } catch (error) {
            console.error('Error fetching caption:', error);
            this.caption = null;
            this.properties.has_caption = false;
        }
    }

    private async fetchCropInfo() {
        try {
            const cropInfo = await getCrop(this.metadata.id);
            this.properties.has_crop = true;
        } catch (error) {
            console.error('Error fetching crop info:', error);
            this.properties.has_crop = false;
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

    getProperties(): ImageProperties {
        return this.properties;
    }

    async getCaption(): Promise<string> {
        if (this.caption === null) {
            await this.fetchCaption();
        }
        return this.caption || '';
    }

    async saveCaption(caption: string): Promise<void> {
        await saveImageCaption(this.metadata.id, caption);
        this.caption = caption;
        this.properties.has_caption = caption.length > 0;
    }

    async getCroppedImage(): Promise<Blob | null> {
        if (!this.properties.has_crop) {
            return null;
        }
        try {
            return await getCroppedImage(this.metadata.id);
        } catch (error) {
            console.error('Error fetching cropped image:', error);
            return null;
        }
    }

    updateProperties(properties: Partial<ImageProperties>) {
        this.properties = { ...this.properties, ...properties };
    }

    setSelected(selected: boolean) {
        this.properties.is_selected = selected;
    }

    isSelected(): boolean {
        return this.properties.is_selected;
    }
}

export class ImageManager {
    private static instance: ImageManager;
    private images: Map<string, ImageData> = new Map();
    private imageSequence: string[] = []; // Array to maintain image order
    private baseUrl: string = API_BASE_URL;
    private currentFilter: FilterState = {};

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

    async addImage(metadata: ImageMetadata): Promise<ImageData> {
        const image = new ImageData(metadata);
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

    getImage(id: string): ImageData | undefined {
        return this.images.get(id);
    }

    getImageProperties(id: string): ImageProperties | undefined {
        return this.images.get(id)?.getProperties();
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
    ): Promise<ImageData> {
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

    getSelectedImages(): ImageData[] {
        return Array.from(this.images.values()).filter(img => img.isSelected());
    }

    clearSelection() {
        this.images.forEach(img => img.setSelected(false));
    }

    // Updated navigation methods to use the sequence
    getNextImage(currentId: string): ImageData | undefined {
        const currentIndex = this.imageSequence.indexOf(currentId);
        if (currentIndex === -1 || currentIndex === this.imageSequence.length - 1) {
            return undefined;
        }
        return this.images.get(this.imageSequence[currentIndex + 1]);
    }

    getPreviousImage(currentId: string): ImageData | undefined {
        const currentIndex = this.imageSequence.indexOf(currentId);
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
            hasCrop: img.getProperties().has_crop,
            hasCaption: img.getProperties().has_caption
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