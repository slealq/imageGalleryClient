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

export function createRowElement(type: 'landscape' | 'portrait', images: ImageData[]): HTMLElement {
    const rowDiv = document.createElement('div');
    rowDiv.className = `grid gap-1 ${type === 'landscape' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'}`;

    images.forEach(img => {
        const imageDiv = document.createElement('div');
        imageDiv.className = 'cursor-pointer overflow-hidden flex items-center justify-center bg-black/20 backdrop-blur-sm p-1 group rounded-sm';
        imageDiv.setAttribute('data-image-url', `http://127.0.0.1:8000/images/${img.id}`);
        imageDiv.setAttribute('data-filename', img.filename);
        imageDiv.setAttribute('data-size', img.size.toString());
        imageDiv.setAttribute('data-created', img.created_at);

        const innerDiv = document.createElement('div');
        innerDiv.className = 'transition-all duration-300 ease-in-out group-hover:scale-110 group-hover:shadow-2xl';

        const imgElement = document.createElement('img');
        imgElement.src = `http://127.0.0.1:8000/images/${img.id}`;
        imgElement.width = img.width * 0.5;
        imgElement.height = img.height * 0.5;
        imgElement.className = 'w-auto h-auto max-w-full max-h-full object-contain';
        imgElement.loading = 'lazy';

        innerDiv.appendChild(imgElement);
        imageDiv.appendChild(innerDiv);
        rowDiv.appendChild(imageDiv);

        // Add click handler
        imageDiv.addEventListener('click', () => {
            if (window.openModal) {
                window.openModal(
                    `http://127.0.0.1:8000/images/${img.id}`,
                    img.filename,
                    img.size.toString(),
                    img.created_at
                );
            }
        });
    });

    return rowDiv;
}

export function processNewImages(newImages: ImageData[]): HTMLElement[] {
    const rows: HTMLElement[] = [];
    let currentRow: ImageData[] = [];
    let currentRowType: 'landscape' | 'portrait' | null = null;

    function addRow() {
        if (currentRow.length > 0 && currentRowType) {
            rows.push(createRowElement(currentRowType, [...currentRow]));
            currentRow = [];
        }
    }

    newImages.forEach(img => {
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