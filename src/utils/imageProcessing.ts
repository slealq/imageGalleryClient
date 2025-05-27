import type { ImageData, Row } from '../types/gallery';

export function processImages(images: ImageData[]): Row[] {
    const landscapeImages = images.filter(img => (img.width / img.height) > 1);
    const portraitImages = images.filter(img => (img.width / img.height) <= 1);

    const rows: Row[] = [];
    let currentRow: ImageData[] = [];
    let currentRowType: 'landscape' | 'portrait' | null = null;

    function addRow() {
        if (currentRow.length > 0 && currentRowType) {
            rows.push({ type: currentRowType, images: [...currentRow] });
            currentRow = [];
        }
    }

    [...landscapeImages, ...portraitImages].forEach(img => {
        const isLandscape = img.width / img.height > 1;
        const type = isLandscape ? 'landscape' : 'portrait';
        
        if (currentRowType !== null && currentRowType !== type) {
            addRow();
        }
        
        if (currentRowType === null) {
            currentRowType = type;
        }
        
        currentRow.push(img);
        
        if ((isLandscape && currentRow.length === 2) || (!isLandscape && currentRow.length === 3)) {
            addRow();
            currentRowType = null;
        }
    });

    addRow();
    return rows;
}
