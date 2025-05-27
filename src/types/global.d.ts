interface Window {
    openDrawer: () => void;
    openModal: (imageUrl: string, filename: string, size: string, created: string) => void;
    loadMoreImages: () => Promise<void>;
} 