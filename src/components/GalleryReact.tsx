import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { ImageData, Row } from '../types/gallery';
import { processImages } from '../utils/imageProcessing';
import { fetchImages } from '../utils/api';
import { ImageManager } from '../utils/ImageManager';

interface GalleryReactProps {
  initialImages: ImageData[];
  initialTotalPages: number;
}

// Expose loadMoreImages through window
declare global {
    interface Window {
        loadMoreImages?: () => Promise<boolean>;
    }
}

const GalleryReact: React.FC<GalleryReactProps> = ({ initialImages, initialTotalPages }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [selectedCount, setSelectedCount] = useState(0);
  const imageManagerRef = useRef<ImageManager | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Initialize ImageManager
  useEffect(() => {
    imageManagerRef.current = ImageManager.getInstance();
  }, []);

  // Initialize images in ImageManager
  useEffect(() => {
    if (!imageManagerRef.current) return;

    const initializeImages = async () => {
      for (const image of initialImages) {
        try {
          await imageManagerRef.current?.createImageFromUrl(
            imageManagerRef.current.getImageUrl(image.id),
            image.id,
            image.filename,
            image.size,
            image.created_at
          );
        } catch (error) {
          console.error(`Error initializing image ${image.id}:`, error);
        }
      }
    };

    initializeImages();
  }, [initialImages]);

  // Process initial images into rows
  useEffect(() => {
    const initialRows = processImages(initialImages);
    setRows(initialRows);
  }, [initialImages]);

  const loadMoreImages = useCallback(async (): Promise<boolean> => {
    if (isLoading || !hasMorePages || !imageManagerRef.current) return false;
    if (currentPage >= totalPages) {
      setHasMorePages(false);
      return false;
    }
    
    setIsLoading(true);
    try {
      const nextPage = currentPage + 1;
      const { images: newImages, total_pages } = await fetchImages(nextPage, 20);

      if (!newImages || newImages.length === 0) {
        setHasMorePages(false);
        return false;
      }

      if (total_pages) {
        setTotalPages(total_pages);
      }

      // Add new images to ImageManager
      for (const image of newImages) {
        try {
          await imageManagerRef.current.createImageFromUrl(
            imageManagerRef.current.getImageUrl(image.id),
            image.id,
            image.filename,
            image.size,
            image.created_at
          );
        } catch (error) {
          console.error(`Error loading image ${image.id}:`, error);
        }
      }

      const newRows = processImages(newImages);
      setRows(prevRows => [...prevRows, ...newRows]);
      setCurrentPage(nextPage);
      return true;
    } catch (error) {
      console.error('Error loading more images:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, hasMorePages, isLoading, totalPages]);

  // Expose loadMoreImages through window
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.loadMoreImages = loadMoreImages;
      return () => {
        window.loadMoreImages = undefined;
      };
    }
  }, [loadMoreImages]);

  // Update selected count when selection changes
  useEffect(() => {
    if (!imageManagerRef.current) return;

    const updateSelectedCount = () => {
      const selectedImages = imageManagerRef.current?.getSelectedImages() || [];
      setSelectedCount(selectedImages.length);
    };

    // Initial count
    updateSelectedCount();

    // Set up an interval to check for changes
    const interval = setInterval(updateSelectedCount, 1000);

    return () => clearInterval(interval);
  }, []);

  // Intersection Observer setup for infinite scrolling
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading && hasMorePages) {
          // Calculate how many images we've shown so far
          const totalImagesShown = rows.reduce((sum, row) => sum + row.images.length, 0);
          // If we've shown more than 75% of the current page size (20), load more
          if (totalImagesShown > 15) {
            loadMoreImages();
          }
        }
      },
      {
        rootMargin: '500px',
        threshold: 0.1
      }
    );

    const loadingTrigger = document.getElementById('loading-trigger');
    if (loadingTrigger) {
      observer.observe(loadingTrigger);
    }

    return () => {
      if (loadingTrigger) {
        observer.unobserve(loadingTrigger);
      }
    };
  }, [loadMoreImages, isLoading, hasMorePages, rows]);

  const handleExport = async () => {
    if (!imageManagerRef.current || isExporting) return;

    setIsExporting(true);
    setExportError(null);
    try {
      await imageManagerRef.current.exportSelectedImages();
    } catch (error) {
      console.error('Error exporting images:', error);
      setExportError(error instanceof Error ? error.message : 'Failed to export images');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImageClick = (image: ImageData) => {
    if (!imageManagerRef.current) return;

    if (typeof window !== 'undefined' && window.openModal) {
      window.openModal(
        imageManagerRef.current.getImageUrl(image.id),
        image.filename,
        image.size.toString(),
        image.created_at,
        image.id,
        image.has_caption,
        image.has_tags,
        image.collection_name
      );
    }
  };

  const handleSelectionClick = (e: React.MouseEvent, imageId: string) => {
    e.stopPropagation();
    if (!imageManagerRef.current) return;

    const image = imageManagerRef.current.getImage(imageId);
    if (image) {
      const selected = !image.isSelected();
      image.setSelected(selected);
      setSelectedCount(prev => selected ? prev + 1 : prev - 1);
    }
  };

  return (
    <div className="container mx-auto px-1 space-y-2">
      <div className="flex justify-between items-center mb-4">
        <button
          type="button"
          className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          onClick={() => typeof window !== 'undefined' && window.openDrawer?.()}
        >
          Open Drawer
        </button>
        {selectedCount > 0 && (
          <div className="flex flex-col items-end gap-2">
            {exportError && (
              <div className="text-red-500 text-sm">
                {exportError}
              </div>
            )}
            <button
              type="button"
              disabled={isExporting}
              className={`rounded-md px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                isExporting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-500 focus-visible:outline-green-600'
              }`}
              onClick={handleExport}
            >
              {isExporting ? 'Exporting...' : `Export Selected (${selectedCount})`}
            </button>
          </div>
        )}
      </div>

      <div id="gallery-grid" className="flex flex-col gap-2">
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className={`grid gap-1 ${
              row.type === 'landscape'
                ? 'grid-cols-1 sm:grid-cols-2'
                : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'
            }`}
          >
            {row.images.map((img) => {
              const image = imageManagerRef.current?.getImage(img.id);
              const isSelected = image?.isSelected() || false;
              const imageUrl = image?.getUrl() || imageManagerRef.current?.getImageUrl(img.id);
              
              return (
                <div
                  key={img.id}
                  className="cursor-pointer overflow-hidden flex items-center justify-center bg-black/20 backdrop-blur-sm p-1 group rounded-sm relative"
                  onClick={() => handleImageClick(img)}
                >
                  <button
                    className={`absolute top-2 right-2 w-8 h-8 rounded-full border-2 border-white transition-colors z-10 ${
                      isSelected ? 'bg-green-500' : 'bg-black/50 hover:bg-black/70'
                    }`}
                    onClick={(e) => handleSelectionClick(e, img.id)}
                  >
                    <svg className={`w-full h-full text-white ${isSelected ? '' : 'hidden'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <div className="transition-all duration-300 ease-in-out group-hover:scale-110 group-hover:shadow-2xl">
                    <img
                      src={imageUrl}
                      width={img.width * 0.5}
                      height={img.height * 0.5}
                      className="w-auto h-auto max-w-full max-h-full object-contain"
                      loading="lazy"
                      data-filename={img.filename}
                      data-size={img.size}
                      data-created={img.created_at}
                      data-id={img.id}
                      data-has-caption={img.has_caption}
                      data-has-tags={img.has_tags}
                      data-collection={img.collection_name}
                      onError={(e) => {
                        console.error(`Error loading image ${img.id}`);
                        const target = e.target as HTMLImageElement;
                        target.src = '/placeholder.png'; // Add a placeholder image
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div id="loading-trigger" className="h-10 w-full" />
    </div>
  );
};

export default GalleryReact; 