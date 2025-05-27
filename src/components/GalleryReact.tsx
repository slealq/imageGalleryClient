import React, { useEffect, useState } from 'react';
import type { ImageData, Row } from '../types/gallery';
import { processImages } from '../utils/imageProcessing';

interface GalleryReactProps {
  initialImages: ImageData[];
  initialTotalPages: number;
}

const GalleryReact: React.FC<GalleryReactProps> = ({ initialImages, initialTotalPages }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [totalPages, setTotalPages] = useState(initialTotalPages);

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
      const response = await fetch(`http://127.0.0.1:8000/images?page=${nextPage}&page_size=20`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      const newImages = data.images;

      if (!newImages || newImages.length === 0) {
        setHasMorePages(false);
        return;
      }

      if (data.total_pages) {
        setTotalPages(data.total_pages);
      }

      const newRows = processImages(newImages);
      setRows(prevRows => [...prevRows, ...newRows]);
      setCurrentPage(nextPage);
    } catch (error) {
      console.error('Error loading more images:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Intersection Observer setup
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading && hasMorePages) {
          loadMoreImages();
        }
      },
      {
        rootMargin: '200px',
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
  }, [loadMoreImages, isLoading, hasMorePages]);

  const handleImageClick = (image: ImageData) => {
    if (window.openModal) {
      window.openModal(
        `http://127.0.0.1:8000/images/${image.id}`,
        image.filename,
        image.size.toString(),
        image.created_at
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
                    src={`http://127.0.0.1:8000/images/${img.id}`}
                    width={img.width * 0.5}
                    height={img.height * 0.5}
                    className="w-auto h-auto max-w-full max-h-full object-contain"
                    loading="lazy"
                    data-filename={img.filename}
                    data-size={img.size}
                    data-created={img.created_at}
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