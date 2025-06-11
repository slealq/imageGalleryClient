import { 
    addImageTag,
    API_BASE_URL, 
    cropImage, 
    exportImages, 
    fetchImageBlob, 
    fetchImagesMetadata, 
    getAvailableFilters, 
    getCrop, 
    getCroppedImage, 
    getCustomTags, 
    getImageCaption,
    getImagePreviewUrl,
    saveImageCaption, 
    streamImageCaption,
    warmupCache, 
    type CropInfo, 
    type GalleryImageMetadata,
    type ImagesMetadataResponse,
    type NormalizedDeltas,
} from './api';

export interface FilterState {
    actor?: string;
    tag?: string;
    year?: string;
    has_caption?: boolean;
    has_crop?: boolean;
}

export interface ImageManagerFetchResponse {
    images: ImageWrapper[];
    page: number;
    total_pages: number;
}

export class ImageWrapper {
    private metadata: GalleryImageMetadata;
    private is_selected: boolean;
    private crop_info: CropInfo | null = null;
    private cropped_image_url: string | null = null;
    private image: Blob | null = null;

    constructor(metadata: GalleryImageMetadata) {
        this.metadata = metadata;
        this.is_selected = false;
    }

    public async initialize() {
        // Only fetch caption if we know the image has one
        if (this.metadata.has_caption) {
            await this.fetchCaption();
        }

        // Check for custom tags
        await this.checkCustomTags();
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

    private async checkCustomTags() {
        try {
            // const customTags = await getCustomTags(this.metadata.id);
            // this.metadata.has_custom_tags = customTags.length > 0;
        } catch (error) {
            console.error('Error checking custom tags:', error);
            this.metadata.has_custom_tags = false;
        }
    }

    public getId(): string {
        return this.metadata.id;
    }

    public getUrl(): string {
        return this.metadata.url ?? '';
    }

    public getUrlCropPreview(targetSize: number): string {
        return getImagePreviewUrl(this.metadata.id, targetSize);
    }

    public async executeCrop(
        targetSize: number, 
        normalizedDeltas: NormalizedDeltas
    ) {
        await cropImage(
            this.metadata.id,
            targetSize,
            normalizedDeltas
        )

        // Since we are executing the crop, assuming the execute works, update the crop info here as well
        if (this.crop_info == null) {
            this.crop_info = {targetSize: 0, normalizedDeltas: {x: 0, y: 0}}
        }

        this.crop_info.targetSize = targetSize;
        this.crop_info.normalizedDeltas = normalizedDeltas;

        this.metadata.has_crop = true;
    }

    private async tryUpdateCropInfo() {
        try {
            console.log(`Try getting crop info for ${this.metadata.id}`);

            const cropResponse = await getCrop(this.metadata.id);

            this.crop_info = cropResponse.cropInfo;
            this.cropped_image_url = `${API_BASE_URL}${cropResponse.imageUrl}`;

            console.log(`cropped image url -> ${this.metadata.id}`);

        }
        catch (error) {
            console.log("Error getting croppeged image url");
            return null;
        }
    }

    public async getCroppedImageUrl(): Promise<string | null> {

        if (this.cropped_image_url) {
            return this.cropped_image_url;
        }

        if (!this.getHasCrop) {
            return null;
        }

        await this.tryUpdateCropInfo();

        return this.cropped_image_url;
    }

    public async getCroppedImageInfo() : Promise<CropInfo | null> {
        if (this.crop_info) {
            return this.crop_info;
        }

        if (!this.getHasCrop()) {
            return null;
        }

        await this.tryUpdateCropInfo();

        return this.crop_info;
    }

    public getHasTags(): boolean {
        return this.metadata.has_tags;
    }

    public getTags(): string[] {
        return this.metadata.tags;
    }

    public getHasCrop(): boolean {
        return this.metadata.has_crop;
    }

    public getHasCaption(): boolean {
        return this.metadata.has_caption;
    }

    public getFilename(): string {
        return this.metadata.filename;
    }

    public getCollectionName(): string {
        return this.metadata.collection_name;
    }

    public getSize(): number {
        return this.metadata.size;
    }

    public getSizeStr(): string {
        return this.getSize().toString();
    }

    public getCreated(): string {
        return this.metadata.created_at;
    }

    private getMetadata(): GalleryImageMetadata {
        return this.metadata;
    }

    public async getCaption(): Promise<string> {
        if (this.metadata.has_caption === null) {
            await this.fetchCaption();
        }
        return this.metadata.caption || '';
    }

    public async saveCaption(caption: string): Promise<void> {
        await saveImageCaption(this.metadata.id, caption);
        this.metadata.caption = caption;
        this.metadata.has_caption = caption.length > 0;
    }

    public async startImageCaptionGeneration(
        prompt: string | undefined,
        onChunk: (chunk: string) => void,
        onComplete: (finalCaption: string) => void,
        onError: (error: Error) => void
    ): Promise<void> {
        
        await streamImageCaption(
            this.metadata.id,
            prompt,
            onChunk,
            onComplete,
            onError
        );
    }

    private updateMetadata(properties: Partial<GalleryImageMetadata>) {
        this.metadata = { ...this.metadata, ...properties };
    }

    public setSelected(selected: boolean) {
        this.is_selected = selected;
    }

    public isSelected(): boolean {
        return this.is_selected || false;
    }

    public getImageBlob(): Blob | null {
        return this.image;
    }

    public async addCustomTag(tag: string) {
        await addImageTag(this.metadata.id, tag);

        this.metadata.has_custom_tags = true;
        if (this.metadata.custom_tags == null) {
            this.metadata.custom_tags = [ ];
        }

        this.metadata.custom_tags.push(tag);
    }

    public async getCustomTags() {
        if (!this.metadata.has_custom_tags) return [];

        return this.metadata.custom_tags;
    }

    public setHasCustomTags(value: boolean) {
        this.metadata.has_custom_tags = value;
    }

    public getHasCustomTags(): boolean {
        return this.metadata.has_custom_tags || false;
    }
}

export class ImageManager {
    private static instance: ImageManager;
    private images: Map<string, ImageWrapper> = new Map();
    private imageSequence: string[] = []; // Array to maintain image order
    private baseUrl: string = API_BASE_URL;
    private currentFilter: FilterState = {};
    private warmupInProgress: boolean = false;
    private availableTags: string[] = [];

    private constructor() {}

    static getInstance(): ImageManager {
        if (!ImageManager.instance) {
            ImageManager.instance = new ImageManager();
        }
        return ImageManager.instance;
    }

    private getImageUrl(imageId: string): string {
        return `${this.baseUrl}/images/${imageId}`;
    }

    public async fetchImagesMetadata(pageNum: number) : Promise<ImageManagerFetchResponse> {
        const response = await fetchImagesMetadata({ 
            page: pageNum,
            ...this.getCurrentFilter()
          });

        const wrappedImages = await this.addImages(response.images);

        // Fire and forget warmup for next page
        console.log('WARMUP: Calling from load images')
        this.startWarmup(pageNum + 1).catch(error => {
            console.error('Error during background warmup:', error);
        });

        return {
            images: wrappedImages,
            page: response.page,
            total_pages: response.total_pages
        };
    }

    private async addImages(imagesMetadata: GalleryImageMetadata[]): Promise<ImageWrapper[]> {
        // Create ImageData objects and add them to ImageManager
        const images = await Promise.all(
            imagesMetadata.map(async (img: GalleryImageMetadata) => {
            const imageStartTime = performance.now();
            
            const imgWrapper = this.addImage(img);
            
            const imageDuration = performance.now() - imageStartTime;
            if (imageDuration > 500) {
                console.warn('⚠️ Slow image processing', {
                imageId: img.id,
                duration: `${(imageDuration / 1000).toFixed(2)}s`,
                threshold: '500ms'
                });
            }
            
            return imgWrapper;
            })
        );

        return images;
    }

    private async addImage(metadata: GalleryImageMetadata): Promise<ImageWrapper> {
        const image = new ImageWrapper(metadata);
        await image.initialize();
        this.images.set(metadata.id, image);
        // Only add to sequence if not already present
        if (!this.imageSequence.includes(metadata.id)) {
            this.imageSequence.push(metadata.id);
        }
        return image;
    }

    public getImage(id: string): ImageWrapper | undefined {
        return this.images.get(id);
    }

    // New method to set the image sequence
    public setImageSequence(imageIds: string[]): void {
        // Filter out any IDs that don't exist in our images map
        const validIds = imageIds.filter(id => this.images.has(id));
        this.imageSequence = validIds;
    }

    // New method to get the current sequence
    public getImageSequence(): string[] {
        return [...this.imageSequence];
    }

    public getSelectedImages(): ImageWrapper[] {
        return Array.from(this.images.values()).filter(img => img.isSelected());
    }

    public clearSelection() {
        this.images.forEach(img => img.setSelected(false));
    }

    // Updated navigation methods to use the sequence
    public getNextImage(currentId: string): ImageWrapper | undefined {
        const currentIndex = this.getImageIndex(currentId);
        if (currentIndex === -1 || currentIndex === this.imageSequence.length - 1) {
            return undefined;
        }
        return this.images.get(this.imageSequence[currentIndex + 1]);
    }

    public getPreviousImage(currentId: string): ImageWrapper | undefined {
        const currentIndex = this.getImageIndex(currentId);

        if (currentIndex <= 0) {
            return undefined;
        }
        return this.images.get(this.imageSequence[currentIndex - 1]);
    }

    public getImageIndex(id: string): number {
        console.log(`Image sequence has ${this.imageSequence.length} values`);

        return this.imageSequence.indexOf(id);
    }

    public getTotalImages(): number {
        return this.imageSequence.length;
    }

    public async exportSelectedImages(): Promise<void> {
        const selectedImages = this.getSelectedImages();
        if (selectedImages.length === 0) {
            throw new Error('No images selected');
        }

        console.log('Selected images for export:', selectedImages.map(img => ({
            id: img.getId(),
            filename: img.getFilename(),
            hasCrop: img.getHasCrop(),
            hasCaption: img.getHasCaption()
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

    public async getAvailableTags(): Promise<string[]> {
        if (this.availableTags.length > 0) {
            return this.availableTags;
        }

        try {
            const filters = await getAvailableFilters();
            // Filter tags to only include those that start with lowercase
            this.availableTags = filters.tags.filter(tag => 
                tag.length > 0 && tag[0] === tag[0].toLowerCase()
            );
            return this.availableTags;
        } catch (error) {
            console.error('Failed to fetch available tags:', error);
            return [];
        }
    }

    public async refreshAvailableTags(): Promise<void> {
        this.availableTags = []; // Clear existing tags
        await this.getAvailableTags();
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