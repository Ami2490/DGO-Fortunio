/**
 * Cloudinary Image Optimization Utilities — Distribuidora DGO
 *
 * Aplica transformaciones on-the-fly a cualquier URL de Cloudinary.
 * Las URLs locales (carpeta /public) se devuelven sin cambios.
 *
 * Transformaciones usadas:
 *   f_auto  → Cloudinary elige el mejor formato (WebP / AVIF)
 *   q_auto  → Calidad óptima automática (≈ 60-80, sin pérdida visual)
 *   w_XXX   → Ancho máximo en píxeles (nunca hace upscale)
 */

const CLOUDINARY_UPLOAD_PATH = '/upload/';

/**
 * Optimiza una URL de Cloudinary con formato/calidad automáticos y ancho máximo.
 * @param url      - URL original (Cloudinary o cualquier otra)
 * @param maxWidth - Ancho máximo en px (por defecto 500 para cards de catálogo)
 */
export function optimizeCloudinaryUrl(url: string, maxWidth = 500): string {
  if (!url || !url.includes('res.cloudinary.com')) return url;

  // Ya tiene transformaciones → evitar duplicados
  if (url.includes('/upload/f_auto')) return url;

  const transformation = `f_auto,q_auto,w_${maxWidth}`;
  return url.replace(CLOUDINARY_UPLOAD_PATH, `${CLOUDINARY_UPLOAD_PATH}${transformation}/`);
}

/**
 * Helpers de tamaños predefinidos para usar en toda la app.
 */
export const imgSizes = {
  /** Thumbnail en carrito / filas de tabla */
  thumb:    (url: string) => optimizeCloudinaryUrl(url, 200),
  /** Tarjeta de producto en grilla de catálogo */
  card:     (url: string) => optimizeCloudinaryUrl(url, 500),
  /** Modal de detalle de producto */
  modal:    (url: string) => optimizeCloudinaryUrl(url, 800),
  /** Hero / banner full-width */
  hero:     (url: string) => optimizeCloudinaryUrl(url, 1200),
  /** Producto destacado en landing */
  featured: (url: string) => optimizeCloudinaryUrl(url, 700),
  /** Logo en navbar */
  logo:     (url: string) => optimizeCloudinaryUrl(url, 300),
};
