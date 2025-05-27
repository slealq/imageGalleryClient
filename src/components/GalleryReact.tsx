import React, { useEffect, useState } from 'react';
import type { ImageData, Row } from '../types/gallery';
import { processImages } from '../utils/imageProcessing';
import { fetchImages, getImageUrl } from '../utils/api';

interface GalleryReactProps {
  initialImages: ImageData[];
  initialTotalPages: number;
}

// Create a global image cache
const imageCache = new Map<string, HTMLImageElement>();

// Function to preload an image
const preloadImage = (imageId: string) => {
  if (imageCache.has(imageId)) return;
  
  const img = new Image();
  img.src = getImageUrl(imageId);
  imageCache.set(imageId, img);
};

const GalleryReact: React.FC<GalleryReactProps> = ({ initialImages, initialTotalPages }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [totalPages, setTotalPages] = useState(initialTotalPages);

  // Preload initial images
  useEffect(() => {
    initialImages.forEach(image => {
      preloadImage(image.id);
    });
  }, [initialImages]);

  useEffect(() => {
    // Process initial images
    const initialRows = processImages(initialImages);
    setRows(initialRows);
  }, [initialImages]);

  const loadMoreImages = async () => {
    if (isLoading || !hasMorePages) return;
    if (currentPage >= totalPages) {
      setHasMorePages(false);
      return;
    }

    setIsLoading(true);
    const nextPage = currentPage + 1;

    try {
      const { images: newImages, total_pages } = await fetchImages(nextPage, 20);

      if (!newImages || newImages.length === 0) {
        setHasMorePages(false);
        return;
      }

      if (total_pages) {
        setTotalPages(total_pages);
      }

      // Preload new images
      newImages.forEach(image => {
        preloadImage(image.id);
      });

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
  };

  // Expose loadMoreImages and imageCache to window
  useEffect(() => {
    (window as any).loadMoreImages = loadMoreImages;
    (window as any).imageCache = imageCache;
    return () => {
      delete (window as any).loadMoreImages;
      delete (window as any).imageCache;
    };
  }, [loadMoreImages]);

  // Intersection Observer setup
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
        // Start loading when we're 500px away from the trigger
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

  const handleImageClick = (image: ImageData) => {
    if (window.openModal) {
      window.openModal(
        getImageUrl(image.id),
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

  return (
    <div className="container mx-auto px-1 space-y-2">
      <div className="flex justify-end mb-4">
        <button
          type="button"
          className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          onClick={() => window.openDrawer?.()}
        >
          Open Drawer
        </button>
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
            {row.images.map((img) => (
              <div
                key={img.id}
                className="cursor-pointer overflow-hidden flex items-center justify-center bg-black/20 backdrop-blur-sm p-1 group rounded-sm"
                onClick={() => handleImageClick(img)}
              >
                <div className="transition-all duration-300 ease-in-out group-hover:scale-110 group-hover:shadow-2xl">
                  <img
                    src={getImageUrl(img.id)}
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
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div id="loading-trigger" className="h-10 w-full" />
    </div>
  );
};

export default GalleryReact; 