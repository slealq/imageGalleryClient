/// <reference types="astro/client" />

interface Window {
    openModal: (imageUrl: string, filename: string, size: string, created: string) => void;
} 