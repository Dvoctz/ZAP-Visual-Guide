/**
 * Image processing utilities for camera capture and upload downscaling.
 * Ensures mobile high-resolution photos (often 12-48MP) are optimized for storage
 * and API transmission without losing critical architectural/decor detail.
 */

export interface ResizeImageOptions {
  maxDimension?: number;
  quality?: number;
  mimeType?: string;
}

export function resizeImageFile(
  file: File,
  options: ResizeImageOptions = {}
): Promise<string> {
  const {
    maxDimension = 1600,
    quality = 0.85,
    mimeType = 'image/jpeg',
  } = options;

  return new Promise((resolve, reject) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const nameLower = file.name.toLowerCase();
    const hasValidExt = validExtensions.some((ext) => nameLower.endsWith(ext));

    if (!validTypes.includes(file.type) && !hasValidExt) {
      reject(new Error('Please select a valid image (JPG, PNG, or WEBP).'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback to raw base64 if canvas 2D context fails
          resolve(readerEvent.target?.result as string);
          return;
        }

        // Draw image smoothly onto canvas
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const targetMime = file.type === 'image/png' ? 'image/png' : mimeType;
        const dataUrl = canvas.toDataURL(targetMime, quality);
        resolve(dataUrl);
      };

      img.onerror = () => {
        reject(new Error('Failed to decode the image. Please try another photo.'));
      };

      img.src = readerEvent.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read the image file.'));
    };

    reader.readAsDataURL(file);
  });
}
