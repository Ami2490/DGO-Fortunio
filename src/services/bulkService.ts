import * as XLSX from 'xlsx';
import { dbService, Product } from './dbService';
import { collection, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';
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

export const bulkService = {
  // Genera un archivo Excel profesional con ejemplos
  generateTemplate: (_categories?: any[]) => {
    const data = [
      {
        SKU: 'PLAT-001',
        Nombre: 'Plato Playo Cerámica',
        'Precio Unitario': 1500,
        'Precio Mayorista': 1200,
        'Minimo Mayorista': 48, // 4 docenas
        'Minimo Compra': 1,
        'Incremento': 1,
        'Unidad': 'Unidad',
        Categoria: 'Vajilla',
        Stock: 100,
        Descripcion: 'Plato de cerámica de alta calidad',
        ImagenURL: ''
      },
      {
        SKU: 'BAN-005',
        Nombre: 'Bandeja Inox Profunda',
        'Precio Unitario': 2500,
        'Precio Mayorista': 2100,
        'Minimo Mayorista': 10,
        'Minimo Compra': 3,
        'Incremento': 1,
        'Unidad': 'Unidad',
        Categoria: 'Acero Inoxidable',
        Stock: 50,
        Descripcion: 'Mínimo 3 unidades, luego suma de a 1.',
        ImagenURL: ''
      },
      {
        SKU: 'VASO-002',
        Nombre: 'Vaso de Vidrio 300ml',
        'Precio Unitario': 850,
        'Precio Mayorista': 700,
        'Minimo Mayorista': 60, // 5 docenas
        'Minimo Compra': 12,
        'Incremento': 12,
        'Unidad': 'Docena',
        Categoria: 'Cristalería',
        Stock: 200,
        Descripcion: 'Venta por docena cerrada.',
        ImagenURL: ''
      }
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');

    // Ajustar anchos de columna para que sea "intuitivo"
    ws['!cols'] = [
      { wch: 15 }, // SKU
      { wch: 30 }, // Nombre
      { wch: 15 }, // Precio Unitario
      { wch: 15 }, // Precio Mayorista
      { wch: 15 }, // Minimo Mayorista
      { wch: 15 }, // Minimo Compra
      { wch: 12 }, // Incremento
      { wch: 12 }, // Unidad
      { wch: 20 }, // Categoria
      { wch: 10 }, // Stock
      { wch: 40 }, // Descripcion
      { wch: 50 }  // ImagenURL
    ];

    XLSX.writeFile(wb, 'Plantilla_DGO_Productos.xlsx');
  },

  // Lee el archivo y prepara la previsualización
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

  // Nueva función consolidada: parsea y valida
  parseAndValidate: async (file: File, categories: any[]): Promise<any[]> => {
    const rawData = await bulkService.parseExcel(file);
    
    // Normalizar datos para que coincidan con el tipo Product
    const normalizedData = rawData.map(row => ({
      sku: String(row.SKU || row.sku || '').trim(),
      name: String(row.Nombre || row.name || '').trim(),
      price: Number(row['Precio Unitario'] || row.price || row.Precio || 0),
      wholesalePrice: Number(row['Precio Mayorista'] || row.wholesalePrice || 0),
      wholesaleMinQuantity: Number(row['Minimo Mayorista'] || row.wholesaleMinQuantity || 0),
      minPurchaseQuantity: Number(row['Minimo Compra'] || row.minPurchaseQuantity || 1),
      purchaseStep: Number(row['Incremento'] || row.purchaseStep || 1),
      unitType: (String(row.Unidad || row.unitType || 'Unidad').toLowerCase().includes('doce')) ? 'dozen' : (String(row.Unidad || row.unitType || 'Unidad').toLowerCase().includes('pack')) ? 'pack' : 'unit',
      category: String(row.Categoria || row.category || 'Sin Categoría').trim(),
      stock: Number(row.Stock || row.stock || 0),
      description: String(row.Descripcion || row.description || ''),
      image: String(row.ImagenURL || row.image || '')
    }));

    // Validar que el archivo no esté vacío
    if (!normalizedData || normalizedData.length === 0) {
      throw new Error('El archivo está vacío o no tiene el formato correcto.');
    }
    return normalizedData;
  },

  // Valida los datos y determina si es update o create
  preparePreview: async (rows: any[]): Promise<BulkPreview[]> => {
    const preview: BulkPreview[] = [];
    const productsSnap = await getDocs(collection(db, DB_PATHS.PRODUCTS));
    const existingSkus = new Map();
    
    productsSnap.docs.forEach(d => {
      const data = d.data();
      if (data.sku) existingSkus.set(data.sku, d.id);
    });

    for (const row of rows) {
      const sku = String(row.SKU || '').trim();
      const name = String(row.Nombre || '').trim();
      const price = parseFloat(row.Precio) || 0;
      const category = String(row.Categoria || 'Sin Categoría').trim();

      if (!sku || !name) {
        preview.push({ sku, name, price, category, action: 'error', status: 'Faltan datos obligatorios (SKU o Nombre)' });
        continue;
      }

      if (existingSkus.has(sku)) {
        preview.push({ sku, name, price, category, action: 'update', status: 'Se actualizará precio y datos' });
      } else {
        preview.push({ sku, name, price, category, action: 'create', status: 'Nuevo producto' });
      }
    }

    return preview;
  },

  // Ejecuta la carga masiva en Firestore
  executeBulk: async (rows: any[], categories: any[], onStatus?: (msg: string) => void) => {
    const batch = writeBatch(db);
    const categoryMap = new Map();
    categories.forEach(c => categoryMap.set(c.name.toLowerCase(), c.id));

    // Obtener productos actuales para ver qué actualizar
    const productsSnap = await getDocs(collection(db, DB_PATHS.PRODUCTS));
    const existingSkus = new Map();
    productsSnap.docs.forEach(d => {
      const data = d.data();
      if (data.sku) existingSkus.set(data.sku, d.id);
    });

    let count = 0;
    for (const row of rows) {
      count++;
      if (onStatus && count % 10 === 0) {
        onStatus(`Procesando ${count} de ${rows.length}...`);
      }

      const sku = String(row.sku || row.SKU || '').trim();
      const name = String(row.name || row.Nombre || '').trim();
      if (!sku || !name) continue;

      const categoryName = String(row.category || row.Categoria || 'Sin Categoría').trim();
      let categoryId = categoryMap.get(categoryName.toLowerCase());

      // Si la categoría no existe, la creamos (aquí lo hacemos simple)
      if (!categoryId) {
        const newCatRef = doc(collection(db, DB_PATHS.CATEGORIES));
        batch.set(newCatRef, { 
          name: categoryName, 
          slug: categoryName.toLowerCase().replace(/\s+/g, '-'),
          image: '',
          order: categoryMap.size,
          span: 'md:col-span-1'
        });
        categoryId = newCatRef.id;
        categoryMap.set(categoryName.toLowerCase(), categoryId);
      }

      const productData: Product = {
        sku,
        name,
        price: Number(row.price || 0),
        wholesalePrice: Number(row.wholesalePrice || 0),
        wholesaleMinQuantity: Number(row.wholesaleMinQuantity || 0),
        minPurchaseQuantity: Number(row.minPurchaseQuantity || 1),
        purchaseStep: Number(row.purchaseStep || 1),
        unitType: row.unitType || 'unit',
        description: String(row.description || ''),
        category: categoryName,
        categoryId: categoryId,
        stock: Number(row.stock || 0),
        image: String(row.image || 'https://images.unsplash.com/photo-1560393464-5c69a73c5770?q=80&w=500'),
        createdAt: new Date().toISOString()
      };

      if (existingSkus.has(sku)) {
        const docId = existingSkus.get(sku);
        const ref = doc(db, DB_PATHS.PRODUCTS, docId);
        batch.update(ref, productData as any);
      } else {
        const newProdRef = doc(collection(db, DB_PATHS.PRODUCTS));
        batch.set(newProdRef, productData);
      }
    }

    if (onStatus) onStatus('Impactando cambios en Google Cloud...');
    await batch.commit();
    if (onStatus) onStatus('¡Carga completada con éxito!');
  },

  // ── Gestor de Medios Masivo ────────────────────────────────────────────────
  
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
        
        results.push({
          filename: file.name,
          url: uploadResult.url,
          preview: preview
        });
      } catch (err) {
        console.error(`Error subiendo ${file.name}:`, err);
        // Podríamos lanzar error o simplemente seguir con los demás
      }
    }
    return results;
  },

  exportMappingToExcel: (mapping: { filename: string; url: string }[]) => {
    const data = mapping.map(m => ({
      'Archivo Original': m.filename,
      'URL Cloudinary': m.url
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mapeo de Imágenes');
    XLSX.writeFile(wb, 'Mapeo_Imagenes_DGO.xlsx');
  }
};
