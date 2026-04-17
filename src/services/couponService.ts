import {
  collection, doc, getDocs, query, where,
  addDoc, updateDoc, deleteDoc, orderBy
} from 'firebase/firestore';
import { db, DB_PATHS } from '../firebase';

export interface Coupon {
  id?: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minPurchase: number;
  maxUses: number;
  usedCount: number;
  active: boolean;
  levelRequired: string | null; // 'bronce' | 'plata' | 'oro' | 'diamante' | null
  userIdRequired: string | null;
  expiresAt: string | null;
  createdBy: string;
  createdAt: string;
}

export async function createCoupon(data: Omit<Coupon, 'id' | 'usedCount' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, DB_PATHS.COUPONS), {
    ...data,
    usedCount: 0,
    createdAt: new Date().toISOString()
  });
  return ref.id;
}

export async function getAllCoupons(): Promise<Coupon[]> {
  const q = query(collection(db, DB_PATHS.COUPONS), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon));
}

export async function deleteCoupon(id: string): Promise<void> {
  await deleteDoc(doc(db, DB_PATHS.COUPONS, id));
}

export async function toggleCoupon(id: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, DB_PATHS.COUPONS, id), { active });
}

export async function applyCoupon(
  code: string,
  userId: string | null,
  userLevel: string | null,
  cartTotal: number
): Promise<{ valid: boolean; discount: number; error?: string }> {
  const q = query(collection(db, DB_PATHS.COUPONS), where('code', '==', code.toUpperCase()));
  const snap = await getDocs(q);

  if (snap.empty) return { valid: false, discount: 0, error: 'Cupón no encontrado' };

  const coupon = snap.docs[0].data() as Coupon;
  const couponId = snap.docs[0].id;

  if (!coupon.active)
    return { valid: false, discount: 0, error: 'Este cupón está desactivado' };

  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date())
    return { valid: false, discount: 0, error: 'Este cupón expiró' };

  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses)
    return { valid: false, discount: 0, error: 'Este cupón alcanzó su límite de usos' };

  if (coupon.minPurchase > 0 && cartTotal < coupon.minPurchase)
    return { valid: false, discount: 0, error: `Compra mínima de $${coupon.minPurchase.toLocaleString()}` };

  if (coupon.userIdRequired) {
    if (!userId)
      return { valid: false, discount: 0, error: 'Este cupón es personal. Iniciá sesión para usarlo' };
    if (coupon.userIdRequired !== userId)
      return { valid: false, discount: 0, error: 'Este cupón no te pertenece' };
  }

  if (coupon.levelRequired && userLevel) {
    const levelOrder: Record<string, number> = { bronce: 0, plata: 1, oro: 2, diamante: 3 };
    if ((levelOrder[userLevel] ?? 0) < (levelOrder[coupon.levelRequired] ?? 0))
      return { valid: false, discount: 0, error: `Necesitás ser nivel ${coupon.levelRequired.toUpperCase()} para usar este cupón` };
  }

  let discount: number;
  if (coupon.discountType === 'percent') {
    discount = Math.round(cartTotal * (coupon.discountValue / 100));
  } else {
    discount = coupon.discountValue;
  }
  if (discount > cartTotal) discount = cartTotal;

  // Incrementar contador de usos
  await updateDoc(doc(db, DB_PATHS.COUPONS, couponId), {
    usedCount: coupon.usedCount + 1
  });

  return { valid: true, discount };
}

export async function generateUserLevelCoupon(
  userId: string,
  level: string,
  discountValue: number
): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = `${level.toUpperCase().substring(0, 4)}-`;
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];

  await addDoc(collection(db, DB_PATHS.COUPONS), {
    code,
    discountType: 'percent',
    discountValue,
    minPurchase: 0,
    maxUses: 1,
    usedCount: 0,
    active: true,
    levelRequired: null,
    userIdRequired: userId,
    expiresAt: null,
    createdBy: 'system',
    createdAt: new Date().toISOString()
  });

  return code;
}
