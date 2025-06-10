import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ImageManager, ImageWrapper } from '../utils/ImageManager';

interface GalleryReactProps {
}

// Expose loadMoreImages through window
declare global {
    interface Window {
        loadMoreImages?: () => Promise<boolean>;
    }
}

const GalleryReact: React.FC<GalleryReactProps> = () => {
  const [imagesBucket, setImages] = useState<ImageWrapper[]>([]);
  const [selectedCount, setSelectedCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const imageManager = useRef<ImageManager>(ImageManager.getInstance());
  const lastImageRef = useRef<HTMLDivElement | null>(null);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());

  // Function to update image order in ImageManager
  const updateImageManagerSequence = useCallback((newImages: ImageWrapper[]) => {
    const imageIds = newImages.map(img => img.getId());
    // imageManager.current.setImageSequence(imageIds);
  }, []);

  const loadImages = useCallback(async (pageNum: number) => {
    const loadStartTime = performance.now();
    console.group(`📊 Page Load Performance - Page ${pageNum}`);
    console.time('Total Page Load');
    
    try {
      setIsLoading(true);
      setError(null);
      const currentFilter = imageManager.current.getCurrentFilter();
      
      const fetchStartTime = performance.now();
      console.log('🔄 Starting API request...', {
        page: pageNum,
        filter: currentFilter,
        timestamp: new Date().toLocaleTimeString()
      });

      const response = await imageManager.current.fetchImagesMetadata(pageNum);
      
      setPage(pageNum);
      setTotalPages(totalPages);
      
      const fetchDuration = performance.now() - fetchStartTime;
      console.log('✅ API request completed', {
        duration: `${(fetchDuration / 1000).toFixed(2)}s`,
        imagesReceived: response.images.length,
        totalPages: response.total_pages,
        timestamp: new Date().toLocaleTimeString()
      });

      if (fetchDuration > 1000) {
        console.warn('⚠️ Slow IMAGE FETCH API request detected', {
          duration: `${(fetchDuration / 1000).toFixed(2)}s`,
          threshold: '1s'
        });
      }

      console.log('🖼️ Starting image processing...', {
        totalImages: response.images.length,
        timestamp: new Date().toLocaleTimeString()
      });
      
      const processStartTime = performance.now();

      const newImages = await imageManager.current.updateImages(response.images);

      const processDuration = performance.now() - processStartTime;
      console.log('✅ Image processing completed', {
        duration: `${(processDuration / 1000).toFixed(2)}s`,
        totalImages: newImages.length,
        averageTimePerImage: `${(processDuration / newImages.length).toFixed(2)}ms`,
        timestamp: new Date().toLocaleTimeString()
      });

      // Update the sequence in ImageManager
      const sequenceStartTime = performance.now();
      updateImageManagerSequence(newImages);
      const sequenceDuration = performance.now() - sequenceStartTime;
      console.log('🔄 Sequence update completed', {
        duration: `${(sequenceDuration / 1000).toFixed(2)}s`,
        imagesCount: newImages.length,
        timestamp: new Date().toLocaleTimeString()
      });

      const stateUpdateStartTime = performance.now();
      setImages(prevImages => {
        const updatedImages = pageNum === 1 ? newImages : [...prevImages, ...newImages];
        return updatedImages;
      });
      const stateUpdateDuration = performance.now() - stateUpdateStartTime;
      console.log('🔄 State update completed', {
        duration: `${(stateUpdateDuration / 1000).toFixed(2)}s`,
        timestamp: new Date().toLocaleTimeString()
      });
      
      setHasMore(response.page < response.total_pages);
      setPage(pageNum);
    } catch (err) {
      console.error('❌ Error loading images:', {
        error: err,
        page: pageNum,
        timestamp: new Date().toLocaleTimeString()
      });
      setError(err instanceof Error ? err.message : 'Failed to load images');
    } finally {
      setIsLoading(false);
      const totalDuration = performance.now() - loadStartTime;
      console.log('📊 Performance Summary', {
        totalDuration: `${(totalDuration / 1000).toFixed(2)}s`,
        page: pageNum,
        timestamp: new Date().toLocaleTimeString()
      });
      
      if (totalDuration > 3000) {
        console.warn('⚠️ Slow page load detected', {
          duration: `${(totalDuration / 1000).toFixed(2)}s`,
          threshold: '3s'
        });
      }
      
      console.timeEnd('Total Page Load');
      console.groupEnd();
    }
  }, [updateImageManagerSequence]);

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
        if (entries[0].isIntersecting && !isLoading && hasMore || page < totalPages + 5) {
          loadMoreImages();
        }
      },
      {
        rootMargin: '10000px',
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
  }, [loadMoreImages, isLoading, hasMore, imagesBucket, page]);

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

  const handleImageClick = (image: ImageWrapper) => {
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
        image.getMetadata().has_caption || false,
        image.getMetadata().has_tags || false,
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

  // Function to handle image loading
  const handleImageLoad = useCallback((imageId: string) => {
    setLoadedImages(prev => new Set([...prev, imageId]));
  }, []);

  // Initial load
  useEffect(() => {
    loadImages(1);
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-4">
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
        {imagesBucket.map((image, index) => {
          const isSelected = image.isSelected();
          const imageUrl = image.getUrl();
          const metadata = image.getMetadata();
          const imageId = metadata.id;
          const isLoaded = loadedImages.has(imageId);
          
          return (
            <div
              key={metadata.id}
              ref={index === imagesBucket.length - 1 ? lastImageRef : null}
              className="relative group"
              onClick={() => handleImageClick(image)}
            >
              <div className="aspect-square relative overflow-hidden">
                {/* Single image with loading state */}
                <img
                  src={imageUrl}
                  alt={metadata.filename}
                  className={`w-full h-full object-cover transition-opacity duration-300 ${
                    isLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                  loading="lazy"
                  onLoad={() => handleImageLoad(imageId)}
                />
                {/* Loading placeholder */}
                {!isLoaded && (
                  <div className="absolute inset-0 bg-gray-200 animate-pulse" />
                )}
                {/* Status indicators */}
                <div className="absolute top-2 left-2 flex gap-1">
                  {metadata.has_caption && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 border border-white shadow-sm"></div>
                  )}
                  {metadata.has_crop && (
                    <div className="w-2 h-2 rounded-full bg-purple-500 border border-white shadow-sm"></div>
                  )}
                  {metadata.has_custom_tags && (
                    <div className="w-2 h-2 rounded-full bg-green-500 border border-white shadow-sm"></div>
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