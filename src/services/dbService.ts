import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  setDoc,
  getDoc,
  runTransaction
} from 'firebase/firestore';
import { db, DB_PATHS } from '../firebase';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface Product {
  id?: string;
  sku?: string;
  name: string;
  description: string;
  price: number; // Precio Unitario
  wholesalePrice?: number; // Precio Mayorista
  wholesaleMinQuantity?: number; // Mínimo para mayorista
  minPurchaseQuantity?: number; // Mínimo inicial para agregar al carrito
  purchaseStep?: number;        // Incremento del botón "+" (ej: de a 1, de a 12, etc.) // Mínimo de compra y bloque de incremento
  unitType?: 'unit' | 'dozen' | 'pack'; // Modo de venta
  originalPrice?: number;
  category: string;
  categoryId: string;
  image: string;
  images?: string[];
  stock: number;
  featured?: boolean;
  tags?: string[];
  createdAt?: string;
}

export interface Order {
  id?: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerNote?: string;
  customerEmail?: string;
  userId?: string | null;
  items: { productId: string; name: string; price: number; quantity: number; image: string }[];
  subtotal: number;
  discount: number;
  total: number;
  couponCode?: string;
  status: 'pending' | 'confirmed' | 'in_transit' | 'delivered' | 'cancelled';
  paymentMethod: string;
  createdAt?: string;
}

// ─── Servicio principal ───────────────────────────────────────────────────────

export const dbService = {

  // Auxiliar para limpiar undefined (evita errores de Firestore)
  cleanObject: (obj: any) => {
    const newObj: any = {};
    Object.keys(obj).forEach(key => {
      if (obj[key] !== undefined) newObj[key] = obj[key];
    });
    return newObj;
  },

  // Productos
  getProducts: async (): Promise<Product[]> => {
    const q = query(collection(db, DB_PATHS.PRODUCTS), orderBy('name', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
  },

  saveProduct: async (product: Partial<Product>): Promise<string> => {
    if (product.id) {
      const { id, ...data } = product;
      await updateDoc(doc(db, DB_PATHS.PRODUCTS, id!), dbService.cleanObject(data));
      return id!;
    }
    const ref = await addDoc(collection(db, DB_PATHS.PRODUCTS), {
      ...dbService.cleanObject(product),
      createdAt: new Date().toISOString()
    });
    return ref.id;
  },

  deleteProduct: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, DB_PATHS.PRODUCTS, id));
  },

  // Categorías
  getCategories: async () => {
    const snap = await getDocs(collection(db, DB_PATHS.CATEGORIES));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  addCategory: async (category: { name: string; slug: string; icon?: string; image?: string }) => {
    const ref = await addDoc(collection(db, DB_PATHS.CATEGORIES), category);
    return ref.id;
  },

  deleteCategory: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, DB_PATHS.CATEGORIES, id));
  },

  // Pedidos
  getOrders: async (): Promise<Order[]> => {
    const q = query(collection(db, DB_PATHS.ORDERS), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
  },

  addOrder: async (order: Omit<Order, 'id' | 'status' | 'createdAt'>): Promise<string> => {
    return await runTransaction(db, async (transaction) => {
      // 1. Validar y descontar stock para cada producto
      for (const item of order.items) {
        const productRef = doc(db, DB_PATHS.PRODUCTS, item.productId);
        const productSnap = await transaction.get(productRef);
        
        if (!productSnap.exists()) {
          throw new Error(`El producto ${item.name} ya no existe.`);
        }
        
        const currentStock = productSnap.data().stock || 0;
        if (currentStock < item.quantity) {
          throw new Error(`Stock insuficiente para ${item.name} (${currentStock} disponibles)`);
        }
        
        transaction.update(productRef, {
          stock: currentStock - item.quantity
        });
      }

      // 2. Crear el pedido
      const orderRef = doc(collection(db, DB_PATHS.ORDERS));
      const orderData = {
        ...dbService.cleanObject(order),
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      
      transaction.set(orderRef, orderData);
      return orderRef.id;
    });
  },

  updateOrderStatus: async (
    orderId: string,
    status: Order['status']
  ): Promise<void> => {
    await runTransaction(db, async (transaction) => {
      const orderRef = doc(db, DB_PATHS.ORDERS, orderId);
      const orderSnap = await transaction.get(orderRef);
      
      if (!orderSnap.exists()) return;
      
      const orderData = orderSnap.data() as Order;
      const oldStatus = orderData.status;

      // Si se cancela y no estaba cancelado antes, devolvemos el stock
      if (status === 'cancelled' && oldStatus !== 'cancelled') {
        for (const item of orderData.items) {
          const productRef = doc(db, DB_PATHS.PRODUCTS, item.productId);
          const productSnap = await transaction.get(productRef);
          if (productSnap.exists()) {
            transaction.update(productRef, {
              stock: (productSnap.data().stock || 0) + item.quantity
            });
          }
        }
      }
      
      // Si se revierte una cancelación (poco común, pero por las dudas)
      if (oldStatus === 'cancelled' && status !== 'cancelled') {
        for (const item of orderData.items) {
          const productRef = doc(db, DB_PATHS.PRODUCTS, item.productId);
          const productSnap = await transaction.get(productRef);
          if (productSnap.exists()) {
            const currentStock = productSnap.data().stock || 0;
            transaction.update(productRef, {
              stock: Math.max(0, currentStock - item.quantity)
            });
          }
        }
      }

      transaction.update(orderRef, { status });
    });
  },

  // Usuarios
  getUsers: async () => {
    const snap = await getDocs(collection(db, DB_PATHS.USERS));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // Configuración / Ajustes
  updateSetting: async (key: string, value: any): Promise<void> => {
    await setDoc(doc(db, DB_PATHS.SETTINGS, key), value, { merge: true });
  },
  // Usuarios
  getUserProfile: async (uid: string) => {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) return snap.data();
    return null;
  }
};
