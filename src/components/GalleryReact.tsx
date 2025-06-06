import React, { useEffect, useState, useCallback, useRef } from 'react';
import { fetchImages } from '../utils/api';
import { ImageManager, ImageWrapper } from '../utils/ImageManager';
import type { ImageData as GalleryImageData } from '../types/gallery';
import { fetchImagesBatch } from '../utils/api';

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

const GalleryReact: React.FC<GalleryReactProps> = ({ initialImages }) => {
  const [imagesBucket, setImages] = useState<ImageWrapper[]>([]);
  const [selectedCount, setSelectedCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const imageManager = useRef<ImageManager>(ImageManager.getInstance());
  const lastImageRef = useRef<HTMLDivElement | null>(null);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const imageCache = useRef<Map<string, number>>(new Map());
  const preloadedPages = useRef<Set<number>>(new Set());
  const isPreloading = useRef<boolean>(false);

  // Function to update image order in ImageManager
  const updateImageManagerSequence = useCallback((newImages: ImageWrapper[]) => {
    const imageIds = newImages.map(img => img.getId());
    imageManager.current.setImageSequence(imageIds);
  }, []);

  // Function to preload next pages
  const preloadNextPages = useCallback(async (currentPage: number) => {
    return;

    if (isPreloading.current || !hasMore) return;
    
    isPreloading.current = true;
    const preloadStartTime = performance.now();
    try {
      const currentFilter = imageManager.current.getCurrentFilter();
      
      console.log(`Preloading pages starting from ${currentPage + 1}`);
      const fetchStartTime = performance.now();
      const responses = await fetchImagesBatch({ 
        startPage: currentPage + 1,
        numPages: 3,
        ...currentFilter
      });
      console.log(`Fetch batch took ${(performance.now() - fetchStartTime).toFixed(2)}ms`);
      
      for (const response of responses) {
        if (!response.images.length) continue;
        
        const pageNum = response.page;
        if (preloadedPages.current.has(pageNum)) continue;
        
        const pageStartTime = performance.now();
        // Create ImageData objects and add them to ImageManager
        const newImages = await Promise.all(
          response.images.map(async (img: GalleryImageData) => {
            const imageUrl = img.url || imageManager.current.getImageUrl(img.id);
            
            // Pre-fetch the image to improve perceived performance
            const preloadLink = document.createElement('link');
            preloadLink.rel = 'preload';
            preloadLink.as = 'image';
            preloadLink.href = imageUrl;
            document.head.appendChild(preloadLink);
            
            console.log(`[Image Creation] Starting for ${img.id}`, {
              timestamp: new Date().toISOString(),
              url: imageUrl
            });
            
            const createStartTime = performance.now();
            const imageData = await imageManager.current.createImageFromUrl(
              imageUrl,
              img.id,
              img.filename,
              img.size,
              img.created_at,
              img.has_caption,
              img.has_crop,
              img.has_tags
            );
            const createDuration = performance.now() - createStartTime;
            
            console.log(`[Image Creation] Completed for ${img.id}`, {
              duration: `${(createDuration / 1000).toFixed(2)}s`,
              timestamp: new Date().toISOString(),
              creationTime: `${(createDuration / 1000).toFixed(2)}s`
            });
            
            // Clean up preload link
            document.head.removeChild(preloadLink);
            
            if (createDuration > 1000) {
              console.warn(`[Performance Warning] Image ${img.id} creation took ${(createDuration / 1000).toFixed(2)}s`);
            }
            
            return imageData;
          })
        );
        
        // Update the sequence in ImageManager
        const sequenceStartTime = performance.now();
        updateImageManagerSequence(newImages);
        const sequenceDuration = performance.now() - sequenceStartTime;
        
        console.log(`[Page ${pageNum}] Processing complete`, {
          totalDuration: `${((performance.now() - pageStartTime) / 1000).toFixed(2)}s`,
          imageCount: newImages.length,
          sequenceUpdateTime: `${(sequenceDuration / 1000).toFixed(2)}s`,
          timestamp: new Date().toISOString()
        });
        
        preloadedPages.current.add(pageNum);
      }
    } catch (error) {
      console.error('Error preloading pages:', error);
    } finally {
      isPreloading.current = false;
      console.log(`[Preload Summary] Total operation completed`, {
        duration: `${((performance.now() - preloadStartTime) / 1000).toFixed(2)}s`,
        timestamp: new Date().toISOString()
      });
    }
  }, [hasMore, updateImageManagerSequence]);

  // Optimize image loading by preloading next batch
  useEffect(() => {
    const preloadNextBatch = async () => {
      if (imagesBucket.length > 0) {
        const nextBatch = imagesBucket.slice(-10); // Preload last 10 images
        nextBatch.forEach(image => {
          const preloadLink = document.createElement('link');
          preloadLink.rel = 'preload';
          preloadLink.as = 'image';
          preloadLink.href = image.getUrl();
          document.head.appendChild(preloadLink);
          // Clean up after a short delay
          setTimeout(() => {
            if (document.head.contains(preloadLink)) {
              document.head.removeChild(preloadLink);
            }
          }, 5000);
        });
      }
    };

    preloadNextBatch();
  }, [imagesBucket]);

  // Optimize image loading by using IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.removeAttribute('data-src');
              observer.unobserve(img);
            }
          }
        });
      },
      {
        rootMargin: '1000px 0px',
        threshold: 0.1
      }
    );

    // Observe all images
    document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));

    return () => observer.disconnect();
  }, [imagesBucket]);

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
      
      const response = await fetchImages({ 
        page: pageNum,
        ...currentFilter
      });

      console.log('WARMUP: Calling from load images')
      // Fire and forget warmup for next page
      imageManager.current.startWarmup(pageNum + 1).catch(error => {
        console.error('Error during background warmup:', error);
      });
      
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
      // Create ImageData objects and add them to ImageManager
      const newImages = await Promise.all(
        response.images.map(async (img: GalleryImageData) => {
          const imageUrl = img.url || imageManager.current.getImageUrl(img.id);
          const imageStartTime = performance.now();
          
          const imageData = await imageManager.current.createImageFromUrl(
            imageUrl,
            img.id,
            img.filename,
            img.size,
            img.created_at,
            img.has_caption,
            img.has_crop,
            img.has_tags
          );
          
          const imageDuration = performance.now() - imageStartTime;
          if (imageDuration > 500) {
            console.warn('⚠️ Slow image processing', {
              imageId: img.id,
              duration: `${(imageDuration / 1000).toFixed(2)}s`,
              threshold: '500ms'
            });
          }
          
          return imageData;
        })
      );

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

      // Start preloading next pages
      if (response.page < response.total_pages) {
        preloadNextPages(pageNum);
      }
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
  }, [updateImageManagerSequence, preloadNextPages]);

  // Initialize images in ImageManager
  useEffect(() => {
    if (!imageManager.current) return;

    const initializeImages = async () => {
      const newImages: ImageWrapper[] = [];
      for (const image of initialImages) {
        try {
          const imageData = await imageManager.current.createImageFromUrl(
            imageManager.current.getImageUrl(image.id),
            image.id,
            image.filename,
            image.size,
            image.created_at,
            image.has_caption,
            image.has_crop,
            image.has_tags
          );
          newImages.push(imageData);
        } catch (error) {
          console.error(`Error loading image ${image.id}:`, error);
        }
      }
      setImages(newImages);
      updateImageManagerSequence(newImages);
      
      // Start preloading next pages after initialization
      preloadNextPages(1);
    };

    initializeImages();
  }, [initialImages, updateImageManagerSequence, preloadNextPages]);

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
          const totalImagesShown = imagesBucket.length;
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
  }, [loadMoreImages, isLoading, hasMore, imagesBucket]);

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
    const loadTime = performance.now() - (imageCache.current.get(imageId) || performance.now());
    console.log(`Image ${imageId} loaded in ${loadTime.toFixed(2)}ms`);
    setLoadedImages(prev => new Set([...prev, imageId]));
  }, []);

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