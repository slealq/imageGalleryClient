/// <reference types="astro/client" />

interface Window {
    openModal: (
        imageUrl: string,
        filename: string,
        size: string,
        created: string,
        imageId: string,
        hasCaption: boolean,
        hasTags: boolean,
        collectionName: string
    ) => void;
    openDrawer?: () => void;
    loadMoreImages?: () => Promise<boolean>;
    openCaptionModal?: (imageId: string) => void;
    openCropModal?: (imageId: string) => void;
} 