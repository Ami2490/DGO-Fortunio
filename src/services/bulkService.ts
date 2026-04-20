import * as XLSX from 'xlsx';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db, DB_PATHS } from '../firebase';
import { uploadToCloudinary } from './cloudinaryService';

export interface BulkPreview {
  sku: string;
  name: string;
  price: number;
  category: string;
  action: 'create' | 'update' | 'error';
  status: string;
}

// ── Helpers internos ──────────────────────────────────────────────────────────

/**
 * Extrae el nombre base del producto desde el nombre de archivo.
 * Quita extensión y sufijo numérico al final.
 * "plato25cm1.jpg"  → "plato25cm"
 * "plato25cm_2.jpg" → "plato25cm"
 * "bandejainox.jpg" → "bandejainox"
 */
export function extractProductName(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, '');
  // Quita sufijo _N o dígitos finales, pero conserva números dentro del nombre
  return withoutExt.replace(/[_-]?\d+$/, '');
}

/**
 * Genera un SKU único desde el nombre del producto y un índice secuencial.
 * "plato25cm"  → "PLA-001"
 * "bandejainox" → "BAN-002"
 */
export function generateSku(name: string, index: number): string {
  const letters = name.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '').toUpperCase();
  const prefix = letters.substring(0, 3).padEnd(3, 'X');
  return `${prefix}-${String(index).padStart(3, '0')}`;
}

/**
 * Agrupa el mapeo de imágenes por nombre base de producto.
 * Retorna: nombreBase → lista de imágenes
 */
export function groupImagesByProduct(
  mapping: { filename: string; url: string; preview?: string }[]
): Map<string, { filename: string; url: string; preview?: string }[]> {
  const grouped = new Map<string, { filename: string; url: string; preview?: string }[]>();
  for (const m of mapping) {
    const baseName = extractProductName(m.filename);
    if (!grouped.has(baseName)) grouped.set(baseName, []);
    grouped.get(baseName)!.push(m);
  }
  return grouped;
}

// ── Servicio principal ────────────────────────────────────────────────────────

export const bulkService = {

  /**
   * Genera el Excel de productos pre-completado desde las imágenes subidas.
   * El admin solo completa: Precio, Stock, Categoría y campos opcionales.
   */
  generateProductsExcel: (mapping: { filename: string; url: string; preview?: string }[]) => {
    const grouped = groupImagesByProduct(mapping);
    const rows: any[] = [];
    let index = 1;

    for (const [productName, images] of grouped.entries()) {
      const sku = generateSku(productName, index++);
      const mainImage = images[0]?.url || '';
      const additionalImages = images.slice(1).map(i => i.url).join(' | ');

      rows.push({
        'SKU':                   sku,           // ← auto-generado
        'Nombre':                productName,   // ← desde nombre de archivo
        'Precio Unitario':       '',            // ← admin completa (obligatorio)
        'Precio Mayorista':      '',            // ← admin completa (opcional)
        'Minimo Mayorista':      '',            // ← admin completa (opcional)
        'Minimo Compra':         '',            // ← admin completa (opcional)
        'Incremento':            '',            // ← admin completa (opcional)
        'Unidad':                'Unidad',      // ← por defecto
        'Categoria':             '',            // ← admin completa (obligatorio)
        'Stock':                 '',            // ← admin completa (obligatorio)
        'Descripcion':           '',            // ← admin completa (opcional)
        'ImagenURL':             mainImage,     // ← auto-completado
        'ImagenesAdicionales':   additionalImages || '', // ← auto-completado
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');

    ws['!cols'] = [
      { wch: 12 }, // SKU
      { wch: 30 }, // Nombre
      { wch: 15 }, // Precio Unitario
      { wch: 15 }, // Precio Mayorista
      { wch: 15 }, // Minimo Mayorista
      { wch: 12 }, // Minimo Compra
      { wch: 12 }, // Incremento
      { wch: 12 }, // Unidad
      { wch: 20 }, // Categoria
      { wch: 10 }, // Stock
      { wch: 40 }, // Descripcion
      { wch: 60 }, // ImagenURL
      { wch: 80 }, // ImagenesAdicionales
    ];

    XLSX.writeFile(wb, 'Productos_DGO.xlsx');
  },

  /**
   * Lee un archivo Excel y devuelve un array con los datos crudos.
   */
  parseExcel: async (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          resolve(jsonData);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  },

  /**
   * Parsea y normaliza el archivo Excel.
   * Solo sku, name, price, category y stock son obligatorios.
   * Todos los demás campos son opcionales y se omiten si están vacíos.
   */
  parseAndValidate: async (file: File, _categories: any[]): Promise<any[]> => {
    const rawData = await bulkService.parseExcel(file);

    if (!rawData || rawData.length === 0) {
      throw new Error('El archivo está vacío o no tiene el formato correcto.');
    }

    const normalizedData = rawData.map(row => {
      const unitRaw = String(row['Unidad'] || row.unitType || 'Unidad').toLowerCase();
      const unitType = unitRaw.includes('doce') ? 'dozen'
                     : unitRaw.includes('pack') ? 'pack'
                     : 'unit';

      // Base obligatoria
      const normalized: any = {
        sku:      String(row['SKU']      || row.sku      || '').trim(),
        name:     String(row['Nombre']   || row.name     || '').trim(),
        price:    Number(row['Precio Unitario'] || row.price || row.Precio || 0),
        category: String(row['Categoria'] || row.category || 'Sin Categoría').trim(),
        stock:    Number(row['Stock']    || row.stock    || 0),
        unitType,
      };

      // Campos opcionales: solo se agregan si tienen valor real
      const wholesalePrice = Number(row['Precio Mayorista'] || row.wholesalePrice || 0);
      if (wholesalePrice > 0) normalized.wholesalePrice = wholesalePrice;

      const wholesaleMinQty = Number(row['Minimo Mayorista'] || row.wholesaleMinQuantity || 0);
      if (wholesaleMinQty > 0) normalized.wholesaleMinQuantity = wholesaleMinQty;

      const minPurchase = Number(row['Minimo Compra'] || row.minPurchaseQuantity || 0);
      if (minPurchase > 0) normalized.minPurchaseQuantity = minPurchase;

      const step = Number(row['Incremento'] || row.purchaseStep || 0);
      if (step > 0) normalized.purchaseStep = step;

      const desc = String(row['Descripcion'] || row.description || '').trim();
      if (desc) normalized.description = desc;

      const imageUrl = String(row['ImagenURL'] || row.image || '').trim();
      if (imageUrl) normalized.image = imageUrl;

      // Imágenes adicionales: separadas por |
      const additionalRaw = String(row['ImagenesAdicionales'] || '').trim();
      if (additionalRaw) {
        const extraUrls = additionalRaw.split('|').map(u => u.trim()).filter(Boolean);
        normalized.images = [imageUrl, ...extraUrls].filter(Boolean);
      } else if (imageUrl) {
        normalized.images = [imageUrl];
      }

      return normalized;
    });

    return normalizedData;
  },

  /**
   * Determina si cada fila del Excel es un producto nuevo o una actualización.
   * Compara por SKU (case-insensitive).
   */
  preparePreview: async (rows: any[]): Promise<BulkPreview[]> => {
    const preview: BulkPreview[] = [];
    const productsSnap = await getDocs(collection(db, DB_PATHS.PRODUCTS));
    const existingSkus = new Map<string, string>();

    productsSnap.docs.forEach(d => {
      const data = d.data();
      if (data.sku) existingSkus.set(String(data.sku).toUpperCase(), d.id);
    });

    for (const row of rows) {
      const sku      = String(row.sku      || '').trim();
      const name     = String(row.name     || '').trim();
      const price    = Number(row.price    || 0);
      const category = String(row.category || 'Sin Categoría').trim();

      if (!sku || !name) {
        preview.push({ sku, name, price, category, action: 'error', status: 'Faltan SKU o Nombre' });
        continue;
      }

      if (existingSkus.has(sku.toUpperCase())) {
        preview.push({ sku, name, price, category, action: 'update', status: 'Se actualizarán los campos modificados' });
      } else {
        preview.push({ sku, name, price, category, action: 'create', status: 'Producto nuevo' });
      }
    }

    return preview;
  },

  /**
   * Ejecuta la carga masiva en Firestore.
   * - Upsert inteligente por SKU (case-insensitive).
   * - Categorías deduplicadas (case-insensitive).
   * - Solo actualiza los campos presentes; no sobreescribe campos omitidos.
   * - Campos opcionales no se guardan si están vacíos.
   */
  executeBulk: async (rows: any[], categories: any[], onStatus?: (msg: string) => void) => {
    const batch = writeBatch(db);

    // Mapa de categorías: lowercase → { id, name (capitalización original) }
    const categoryMap = new Map<string, { id: string; name: string }>();

    // Cargar categorías existentes del estado local
    categories.forEach(c => {
      categoryMap.set(String(c.name).trim().toLowerCase(), { id: c.id, name: c.name });
    });

    // Cargar categorías de Firestore (puede haber más en la DB que en el estado)
    const catsSnap = await getDocs(collection(db, DB_PATHS.CATEGORIES));
    catsSnap.docs.forEach(d => {
      const data = d.data();
      const key = String(data.name || '').trim().toLowerCase();
      if (!categoryMap.has(key)) {
        categoryMap.set(key, { id: d.id, name: data.name });
      }
    });

    // Cargar SKUs existentes (case-insensitive)
    const productsSnap = await getDocs(collection(db, DB_PATHS.PRODUCTS));
    const existingSkus = new Map<string, string>(); // SKU (uppercase) → docId
    productsSnap.docs.forEach(d => {
      const data = d.data();
      if (data.sku) existingSkus.set(String(data.sku).toUpperCase(), d.id);
    });

    let count = 0;
    for (const row of rows) {
      count++;
      if (onStatus && count % 10 === 0) {
        onStatus(`Procesando ${count} de ${rows.length}...`);
      }

      const sku  = String(row.sku  || '').trim();
      const name = String(row.name || '').trim();
      if (!sku || !name) continue;

      // ── Resolver categoría (case-insensitive, sin duplicados) ──
      const categoryRaw = String(row.category || 'Sin Categoría').trim();
      const categoryKey = categoryRaw.toLowerCase();
      let catId: string;
      let catName: string;

      if (categoryMap.has(categoryKey)) {
        const existing = categoryMap.get(categoryKey)!;
        catId   = existing.id;
        catName = existing.name;
      } else {
        // Nueva categoría: crear en el batch
        const newCatRef = doc(collection(db, DB_PATHS.CATEGORIES));
        catName = categoryRaw;
        catId   = newCatRef.id;
        batch.set(newCatRef, {
          name:      catName,
          slug:      catName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          image:     '',
          order:     categoryMap.size,
          span:      'md:col-span-1',
          createdAt: new Date().toISOString(),
        });
        categoryMap.set(categoryKey, { id: catId, name: catName });
      }

      // ── Construir objeto producto con solo los campos con valor ──
      const productData: any = {
        sku,
        name,
        price:      Number(row.price  || 0),
        category:   catName,
        categoryId: catId,
        stock:      Number(row.stock  || 0),
      };

      // Opcionales: solo se agregan si tienen valor
      if (row.unitType)
        productData.unitType = row.unitType;
      if (row.wholesalePrice && Number(row.wholesalePrice) > 0)
        productData.wholesalePrice = Number(row.wholesalePrice);
      if (row.wholesaleMinQuantity && Number(row.wholesaleMinQuantity) > 0)
        productData.wholesaleMinQuantity = Number(row.wholesaleMinQuantity);
      if (row.minPurchaseQuantity && Number(row.minPurchaseQuantity) > 0)
        productData.minPurchaseQuantity = Number(row.minPurchaseQuantity);
      if (row.purchaseStep && Number(row.purchaseStep) > 0)
        productData.purchaseStep = Number(row.purchaseStep);
      if (row.description && String(row.description).trim())
        productData.description = String(row.description).trim();
      if (row.image && String(row.image).trim())
        productData.image = String(row.image).trim();
      if (row.images && Array.isArray(row.images) && row.images.length > 0)
        productData.images = row.images;

      // ── Upsert por SKU ──
      const skuKey = sku.toUpperCase();
      if (existingSkus.has(skuKey)) {
        // ACTUALIZAR: no toca createdAt ni campos ausentes
        const docId = existingSkus.get(skuKey)!;
        batch.update(doc(db, DB_PATHS.PRODUCTS, docId), productData);
      } else {
        // CREAR: nuevo producto con timestamp
        productData.createdAt = new Date().toISOString();
        batch.set(doc(collection(db, DB_PATHS.PRODUCTS)), productData);
      }
    }

    if (onStatus) onStatus('Guardando en Firebase...');
    await batch.commit();
    if (onStatus) onStatus('¡Carga completada con éxito!');
  },

  // ── Gestor de Medios Masivo ───────────────────────────────────────────────

  uploadMultipleImages: async (
    files: FileList | File[],
    onProgress?: (filename: string, progress: number) => void
  ): Promise<{ filename: string; url: string; preview: string }[]> => {
    const results: { filename: string; url: string; preview: string }[] = [];
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      try {
        const preview = URL.createObjectURL(file);
        const uploadResult = await uploadToCloudinary(file, 'general', (pct) => {
          if (onProgress) onProgress(file.name, pct);
        });
        results.push({ filename: file.name, url: uploadResult.url, preview });
      } catch (err) {
        console.error(`Error subiendo ${file.name}:`, err);
      }
    }
    return results;
  },

  /**
   * Genera el Excel de productos desde el mapeo de imágenes.
   * Mantiene compatibilidad con el botón existente en AdminPage.
   */
  exportMappingToExcel: (mapping: { filename: string; url: string }[]) => {
    bulkService.generateProductsExcel(mapping);
  },

  /**
   * Genera una plantilla Excel vacía con todas las columnas del formato oficial.
   * El admin la descarga, la completa y luego la sube para la carga masiva.
   * Acepta la lista de categorías existentes para incluir una hoja de referencia.
   */
  generateTemplate: (categories: any[] = []) => {
    const exampleRow = {
      'SKU':                  'EJM-001',
      'Nombre':               'Nombre del Producto',
      'Precio Unitario':      '1500',
      'Precio Mayorista':     '',
      'Minimo Mayorista':     '',
      'Minimo Compra':        '',
      'Incremento':           '',
      'Unidad':               'Unidad',
      'Categoria':            'Sin Categoría',
      'Stock':                '100',
      'Descripcion':          '',
      'ImagenURL':            '',
      'ImagenesAdicionales':  '',
    };

    const ws = XLSX.utils.json_to_sheet([exampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');

    ws['!cols'] = [
      { wch: 12 }, // SKU
      { wch: 30 }, // Nombre
      { wch: 15 }, // Precio Unitario
      { wch: 15 }, // Precio Mayorista
      { wch: 15 }, // Minimo Mayorista
      { wch: 12 }, // Minimo Compra
      { wch: 12 }, // Incremento
      { wch: 12 }, // Unidad
      { wch: 20 }, // Categoria
      { wch: 10 }, // Stock
      { wch: 40 }, // Descripcion
      { wch: 60 }, // ImagenURL
      { wch: 80 }, // ImagenesAdicionales
    ];

    // Hoja de referencia con categorías existentes
    if (categories.length > 0) {
      const catRows = categories.map((c: any) => ({ 'Categorías Disponibles': c.name || c }));
      const wsCats = XLSX.utils.json_to_sheet(catRows);
      XLSX.utils.book_append_sheet(wb, wsCats, 'Categorías');
    }

    XLSX.writeFile(wb, 'Plantilla_Productos_DGO.xlsx');
  },
};
