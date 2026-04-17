/**
 * Cloudinary Upload Service — Distribuidora DGO
 *
 * Maneja la subida de imágenes desde el dispositivo del admin a Cloudinary.
 * Usa el Upload Preset sin firmar (unsigned) configurado en el panel de Cloudinary.
 *
 * Variables de entorno requeridas en .env:
 *   VITE_CLOUDINARY_ID      → Cloud Name (ej: "mi-cloud")
 *   VITE_CLOUDINARY_PRESET  → Upload Preset sin firmar (ej: "dgo_unsigned")
 *   VITE_CLOUDINARY_FOLDER  → Carpeta destino (ej: "dgo")
 */
/// <reference types="vite/client" />

export type UploadFolder = 'productos' | 'categorias' | 'hero' | 'logos' | 'general';

export interface UploadResult {
  url: string;          // secure_url de Cloudinary (HTTPS)
  publicId: string;     // public_id para transformaciones futuras
  width: number;
  height: number;
  format: string;
  bytes: number;
}

// ─── Función principal de upload ──────────────────────────────────────────────

export async function uploadToCloudinary(
  file: File,
  folder: UploadFolder = 'general',
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_ID;
  const preset    = import.meta.env.VITE_CLOUDINARY_PRESET;
  const baseFolder= import.meta.env.VITE_CLOUDINARY_FOLDER || 'dgo';

  if (!cloudName || !preset) {
    throw new Error(
      'Faltan variables de entorno: VITE_CLOUDINARY_ID y VITE_CLOUDINARY_PRESET son requeridas.'
    );
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', preset);
  formData.append('folder', `${baseFolder}/${folder}`);

  // Si el navegador soporta XHR con progreso, lo usamos. Sino, fetch normal.
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        resolve({
          url:      data.secure_url,
          publicId: data.public_id,
          width:    data.width,
          height:   data.height,
          format:   data.format,
          bytes:    data.bytes,
        });
      } else {
        reject(new Error(`Error Cloudinary: ${xhr.status} — ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Error de red al subir imagen.'));
    xhr.send(formData);
  });
}

// ─── Helper: validar archivo antes de subir ───────────────────────────────────

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
  const maxSizeMB = 10;

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Formato no soportado. Usá JPG, PNG, WebP o AVIF.' };
  }
  if (file.size > maxSizeMB * 1024 * 1024) {
    return { valid: false, error: `El archivo supera los ${maxSizeMB}MB permitidos.` };
  }
  return { valid: true };
}

// ─── Helper: formatear tamaño de archivo ─────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
