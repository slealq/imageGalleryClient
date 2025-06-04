import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { ImageData, Row } from '../types/gallery';
import { processImages } from '../utils/imageProcessing';
import { fetchImages } from '../utils/api';
import { ImageManager, ImageData as ManagerImageData } from '../utils/ImageManager';
import type { ImageData as GalleryImageData } from '../types/gallery';

interface GalleryReactProps {
  initialImages: GalleryImageData[];
  initialTotalPages: number;
}

// Expose loadMoreImages through window
declare global {
    interface Window {
        loadMoreImages?: () => Promise<boolean>;
    }
}

const GalleryReact: React.FC<GalleryReactProps> = ({ initialImages, initialTotalPages }) => {
  const [images, setImages] = useState<ManagerImageData[]>([]);
  const [selectedCount, setSelectedCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const imageManager = useRef<ImageManager>(ImageManager.getInstance());
  const observer = useRef<IntersectionObserver | null>(null);
  const lastImageRef = useRef<HTMLDivElement | null>(null);

  // Function to update image order in ImageManager
  const updateImageManagerSequence = useCallback((newImages: ManagerImageData[]) => {
    const imageIds = newImages.map(img => img.getId());
    imageManager.current.setImageSequence(imageIds);
  }, []);

  const loadImages = useCallback(async (pageNum: number) => {
    try {
      setIsLoading(true);
      setError(null);
      const currentFilter = imageManager.current.getCurrentFilter();
      const response = await fetchImages({ 
        page: pageNum,
        ...currentFilter
      });
      
      console.log('Loading images for page:', { pageNum, totalImages: response.images.length });
      
      // Create ImageData objects and add them to ImageManager
      const newImages = await Promise.all(
        response.images.map(async (img: GalleryImageData) => {
          const imageUrl = img.url || imageManager.current.getImageUrl(img.id);
          console.log('Loading image:', { id: img.id, url: imageUrl }); // Debug log
          const imageData = await imageManager.current.createImageFromUrl(
            imageUrl,
            img.id,
            img.filename,
            img.size,
            img.created_at
          );
          return imageData;
        })
      );

      console.log('New images loaded:', { 
        count: newImages.length,
        ids: newImages.map(img => img.getId())
      });

      // Update the sequence in ImageManager
      updateImageManagerSequence(newImages);
      
      console.log('Updated image sequence:', {
        sequence: imageManager.current.getImageSequence(),
        totalImages: imageManager.current.getTotalImages()
      });

      setImages(prevImages => {
        const updatedImages = pageNum === 1 ? newImages : [...prevImages, ...newImages];
        console.log('Updated images state:', {
          totalImages: updatedImages.length,
          ids: updatedImages.map(img => img.getId())
        });
        return updatedImages;
      });
      
      setHasMore(response.page < response.total_pages);
      setPage(pageNum);
    } catch (err) {
      console.error('Error loading images:', err); // Debug log
      setError(err instanceof Error ? err.message : 'Failed to load images');
    } finally {
      setIsLoading(false);
    }
  }, [updateImageManagerSequence]);

  // Initialize images in ImageManager
  useEffect(() => {
    if (!imageManager.current) return;

    const initializeImages = async () => {
      const newImages: ManagerImageData[] = [];
      for (const image of initialImages) {
        try {
          const imageData = await imageManager.current.createImageFromUrl(
            imageManager.current.getImageUrl(image.id),
            image.id,
            image.filename,
            image.size,
            image.created_at
          );
          newImages.push(imageData);
        } catch (error) {
          console.error(`Error loading image ${image.id}:`, error);
        }
      }
      setImages(newImages);
      updateImageManagerSequence(newImages);
    };

    initializeImages();
  }, [initialImages, updateImageManagerSequence]);

  const loadMoreImages = useCallback(async (): Promise<boolean> => {
    if (isLoading || !hasMore) return false;
    
    setIsLoading(true);
    try {
      const nextPage = page + 1;
      await loadImages(nextPage);
      return true;
    } catch (error) {
      console.error('Error loading more images:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, hasMore, page, loadImages]);

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
    if (!imageManager.current) return;

    const updateSelectedCount = () => {
      const selectedImages = imageManager.current?.getSelectedImages() || [];
      setSelectedCount(selectedImages.length);
    };

    // Initial count
    updateSelectedCount();

    // Set up an interval to check for changes
    const interval = setInterval(updateSelectedCount, 1000);

    return () => clearInterval(interval);
  }, []);

  // Listen for modal close to refresh image properties
  useEffect(() => {
    const handleModalClose = () => {
      // Force a re-render by updating the images state
      setImages(prevImages => [...prevImages]);
    };

    // Add event listener for modal close
    window.addEventListener('modalClosed', handleModalClose);

    return () => {
      window.removeEventListener('modalClosed', handleModalClose);
    };
  }, []);

  // Intersection Observer setup for infinite scrolling
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading && hasMore) {
          // Load more images when we're close to the end of the current page
          const totalImagesShown = images.length;
          // If we've shown more than 70% of the current page size (10), load more
          if (totalImagesShown > 7) {
            loadMoreImages();
          }
        }
      },
      {
        rootMargin: '2000px',
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
  }, [loadMoreImages, isLoading, hasMore, images]);

  const handleExport = async () => {
    if (!imageManager.current || isExporting) return;

    setIsExporting(true);
    setExportError(null);
    try {
      await imageManager.current.exportSelectedImages();
    } catch (error) {
      console.error('Error exporting images:', error);
      setExportError(error instanceof Error ? error.message : 'Failed to export images');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImageClick = (image: ManagerImageData) => {
    if (!imageManager.current) return;

    // Log for debugging
    console.log('Image clicked:', {
      id: image.getId(),
      url: image.getUrl(),
      filename: image.getMetadata().filename
    });

    if (typeof window !== 'undefined' && window.openModal) {
      const imageUrl = image.getUrl();
      console.log('Opening modal with URL:', imageUrl);
      
      window.openModal(
        imageUrl,
        image.getMetadata().filename,
        image.getMetadata().size.toString(),
        image.getMetadata().created,
        image.getId(),
        image.getProperties().has_caption,
        image.getProperties().has_tags,
        image.getMetadata().collection_name || ''
      );
    }
  };

  const handleSelectionClick = (e: React.MouseEvent, imageId: string) => {
    e.stopPropagation();
    if (!imageManager.current) return;

    const image = imageManager.current.getImage(imageId);
    if (image) {
      const selected = !image.isSelected();
      image.setSelected(selected);
    }
  };

  // Add filter change listener
  useEffect(() => {
    const handleFilterChange = () => {
      // Reset to page 1 and reload images when filters change
      setPage(1);
      loadImages(1);
    };

    window.addEventListener('filtersChanged', handleFilterChange);
    return () => window.removeEventListener('filtersChanged', handleFilterChange);
  }, [loadImages]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-4">
        <button
          type="button"
          className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          onClick={() => typeof window !== 'undefined' && window.openDrawer?.()}
        >
          Open Drawer
        </button>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-medium text-gray-700">Selected:</span>
            <span className="text-lg font-bold text-indigo-600">{selectedCount}</span>
          </div>
          <button
            onClick={handleExport}
            disabled={selectedCount === 0 || isExporting}
            className={`px-4 py-2 rounded-lg text-white font-medium ${
              selectedCount === 0 || isExporting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isExporting ? 'Exporting...' : 'Export Selected'}
          </button>
          {exportError && (
            <div className="text-red-500 text-sm">{exportError}</div>
          )}
        </div>
      </div>

      {error && (
        <div className="text-red-500 mb-4">{error}</div>
      )}

      <div id="gallery-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
        {images.map((image, index) => {
          const isSelected = image.isSelected();
          const imageUrl = image.getUrl();
          const metadata = image.getMetadata();
          const properties = image.getProperties();
          
          return (
            <div
              key={metadata.id}
              ref={index === images.length - 1 ? lastImageRef : null}
              className="relative group"
              onClick={() => handleImageClick(image)}
            >
              <div className="aspect-square relative overflow-hidden">
                <img
                  src={imageUrl}
                  alt={metadata.filename}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {/* Status indicators */}
                <div className="absolute top-2 left-2 flex gap-1">
                  {properties.has_caption && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 border border-white shadow-sm"></div>
                  )}
                  {properties.has_crop && (
                    <div className="w-2 h-2 rounded-full bg-purple-500 border border-white shadow-sm"></div>
                  )}
                </div>
                <button
                  onClick={(e) => handleSelectionClick(e, metadata.id)}
                  className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 border-white transition-colors ${
                    isSelected ? 'bg-green-500' : 'bg-black/50 hover:bg-black/70'
                  }`}
                >
                  <svg
                    className={`w-full h-full text-white ${isSelected ? '' : 'hidden'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div id="loading-trigger" className="h-10 w-full" />
    </div>
  );
};

export default GalleryReact; 