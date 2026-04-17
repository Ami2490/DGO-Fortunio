import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

// Rutas raíz (Restauradas)
export const DB_PATHS = {
  ROOT: '',
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  SETTINGS: 'config',
  BENEFITS: 'benefits',
  REVIEWS: 'reviews',
  ORDERS: 'orders',
  BANNERS: 'banners',
  USERS: 'users',
  COUPONS: 'coupons',
  USER_COUPONS: 'user_coupons',
  POINT_TRANSACTIONS: 'point_transactions',
  REWARDS: 'rewards',
  ANALYTICS: 'analitica',
  LEVEL_CONFIG: 'level_config',
};

export default app;
