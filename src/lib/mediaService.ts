import { auth } from './firebase';

// Hardcoded ImgBB key as explicitly specified by project configuration
const IMGBB_API_KEY = 'e4159b76d900cd8803bdf1bd7bc96fbb';
const IMGBB_UPLOAD_URL = `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`;

const MAX_IMAGE_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_INPUT_BYTES = 80 * 1024 * 1024; // 80 MB
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
]);

export interface UploadedImageMeta {
  url: string;
  thumbUrl?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

export interface UploadedVideoMeta {
  videoUrl: string;
  videoPublicId: string;
  videoFormat: string;
  videoDuration: number;
  videoThumbnailUrl: string;
  videoWidth?: number;
  videoHeight?: number;
}

export interface MediaProviderStatus {
  imgbbConfigured: boolean;
  cloudinaryConfigured: boolean;
  cloudinaryMode: 'signed' | 'unsigned' | 'unconfigured';
  cloudinaryCloudName: string | null;
  maxImageBytes: number;
  maxVideoBytes: number;
  requiredVars: string[];
}

export function getMediaUploadConfig(): MediaProviderStatus {
  return {
    imgbbConfigured: true,
    cloudinaryConfigured: true,
    cloudinaryMode: 'signed',
    cloudinaryCloudName: 'dxtzxh93n',
    maxImageBytes: MAX_IMAGE_INPUT_BYTES,
    maxVideoBytes: MAX_VIDEO_INPUT_BYTES,
    requiredVars: [],
  };
}

export async function fetchServerMediaStatus(): Promise<MediaProviderStatus> {
  try {
    const res = await fetch('/api/media/status');
    if (res.ok) {
      return (await res.json()) as MediaProviderStatus;
    }
  } catch {
    // Fall back to client-known status if backend route unavailable
  }
  return getMediaUploadConfig();
}

async function compressImageIfNeeded(file: File, maxWidth = 1600): Promise<Blob> {
  if (file.type === 'image/gif' || file.size <= 450 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const targetW = Math.max(1, Math.round(img.width * scale));
      const targetH = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            resolve(blob);
          } else {
            resolve(file);
          }
        },
        outputType,
        0.84
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

export async function uploadImageToImgBB(file: File): Promise<UploadedImageMeta> {
  if (!ALLOWED_IMAGE_MIMES.has(file.type.toLowerCase())) {
    throw new Error('Only JPG, PNG, WebP, or GIF image files are allowed.');
  }
  if (file.size > MAX_IMAGE_INPUT_BYTES) {
    throw new Error('Image size must be 10 MB or smaller.');
  }

  const preparedBlob = await compressImageIfNeeded(file);
  const formData = new FormData();
  formData.append('image', preparedBlob, file.name || 'luga_image.jpg');

  const response = await fetch(IMGBB_UPLOAD_URL, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`ImgBB image upload failed (${response.status}). ${errText.slice(0, 120)}`);
  }

  const json = (await response.json()) as {
    success?: boolean;
    data?: {
      url?: string;
      display_url?: string;
      thumb?: { url?: string };
      width?: number;
      height?: number;
      size?: number;
    };
    error?: { message?: string };
  };

  const url = json.data?.display_url || json.data?.url;
  if (!json.success || !url) {
    throw new Error(json.error?.message || 'ImgBB did not return a valid image URL.');
  }

  return {
    url,
    thumbUrl: json.data?.thumb?.url,
    width: json.data?.width,
    height: json.data?.height,
    sizeBytes: json.data?.size,
  };
}

export async function uploadCommunityImage(file: File): Promise<string> {
  const result = await uploadImageToImgBB(file);
  return result.url;
}

export async function uploadMultipleImagesToImgBB(files: File[]): Promise<UploadedImageMeta[]> {
  const results: UploadedImageMeta[] = [];
  for (const file of files) {
    results.push(await uploadImageToImgBB(file));
  }
  return results;
}

function readLocalVideoMetadata(
  file: File
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const objectUrl = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? Math.round(video.duration * 10) / 10 : 0;
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      URL.revokeObjectURL(objectUrl);
      resolve({ duration, width, height });
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ duration: 0, width: 0, height: 0 });
    };
    video.src = objectUrl;
  });
}

export function getOptimizedVideoUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  if (rawUrl.includes('res.cloudinary.com') && rawUrl.includes('/video/upload/')) {
    if (rawUrl.includes('/video/upload/q_auto') || rawUrl.includes('/video/upload/f_auto')) {
      return rawUrl;
    }
    return rawUrl.replace('/video/upload/', '/video/upload/f_auto,q_auto/');
  }
  return rawUrl;
}

export function getVideoPosterUrl(rawUrl: string, existingThumb?: string): string {
  if (existingThumb) return existingThumb;
  if (rawUrl.includes('res.cloudinary.com') && rawUrl.includes('/video/upload/')) {
    const transformed = rawUrl.replace('/video/upload/', '/video/upload/so_1,f_jpg,q_auto/');
    return transformed.replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg$2');
  }
  return '';
}

export async function uploadVideoToCloudinary(
  file: File,
  folder: 'feed' | 'chat' | 'groups',
  onProgress?: (percent: number) => void
): Promise<UploadedVideoMeta> {
  const mimeType = file.type.toLowerCase();
  if (!ALLOWED_VIDEO_MIMES.has(mimeType)) {
    throw new Error('Only MP4, WebM, MOV, or M4V video files are supported.');
  }
  if (file.size <= 0 || file.size > MAX_VIDEO_INPUT_BYTES) {
    throw new Error('Video size must be 80 MB or smaller.');
  }

  const localMeta = await readLocalVideoMetadata(file);
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in before uploading videos.');
  }

  const idToken = await currentUser.getIdToken();
  const sigResp = await fetch('/api/media/cloudinary-signature', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      folder,
      mimeType,
      fileSizeBytes: file.size,
    }),
  });

  if (!sigResp.ok) {
    const errBody = (await sigResp.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      errBody.error ||
        'Cloudinary video upload is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in environment secrets.'
    );
  }

  const sigData = (await sigResp.json()) as {
    mode: 'signed' | 'unsigned';
    cloudName: string;
    apiKey?: string;
    timestamp?: number;
    signature?: string;
    uploadPreset?: string;
    folder?: string;
  };

  const formData = new FormData();
  formData.append('file', file);
  if (sigData.folder) {
    formData.append('folder', sigData.folder);
  }

  if (sigData.mode === 'signed') {
    if (!sigData.apiKey || !sigData.timestamp || !sigData.signature) {
      throw new Error('Incomplete Cloudinary signature response from server.');
    }
    formData.append('api_key', sigData.apiKey);
    formData.append('timestamp', String(sigData.timestamp));
    formData.append('signature', sigData.signature);
  } else if (sigData.uploadPreset) {
    formData.append('upload_preset', sigData.uploadPreset);
  } else {
    throw new Error('Cloudinary upload configuration is missing.');
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(sigData.cloudName)}/video/upload`;

  const uploadResponse = await new Promise<{
    secure_url?: string;
    public_id?: string;
    format?: string;
    duration?: number;
    width?: number;
    height?: number;
    error?: { message?: string };
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) {
        onProgress(Math.min(99, Math.round((evt.loaded / evt.total) * 100)));
      }
    };

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || '{}') as {
          secure_url?: string;
          public_id?: string;
          format?: string;
          duration?: number;
          width?: number;
          height?: number;
          error?: { message?: string };
        };
        if (xhr.status >= 200 && xhr.status < 300 && parsed.secure_url) {
          onProgress?.(100);
          resolve(parsed);
        } else {
          reject(
            new Error(
              parsed.error?.message || `Cloudinary video upload failed (HTTP ${xhr.status}).`
            )
          );
        }
      } catch {
        reject(new Error(`Cloudinary video upload failed (HTTP ${xhr.status}).`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during Cloudinary video upload.'));
    };

    xhr.send(formData);
  });

  if (!uploadResponse.secure_url || !uploadResponse.public_id) {
    throw new Error('Cloudinary did not return video metadata.');
  }

  const videoUrl = uploadResponse.secure_url;
  const thumbnailUrl = getVideoPosterUrl(videoUrl);

  return {
    videoUrl,
    videoPublicId: uploadResponse.public_id,
    videoFormat: uploadResponse.format || mimeType.split('/')[1] || 'mp4',
    videoDuration:
      typeof uploadResponse.duration === 'number' && uploadResponse.duration > 0
        ? Math.round(uploadResponse.duration * 10) / 10
        : localMeta.duration,
    videoThumbnailUrl: thumbnailUrl,
    videoWidth: uploadResponse.width || localMeta.width || undefined,
    videoHeight: uploadResponse.height || localMeta.height || undefined,
  };
}
