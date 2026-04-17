/**
 * Sistema de Analítica — Registra eventos en Firestore
 * Cada interacción del usuario se guarda para verla en el panel de admin en tiempo real
 */

import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db, DB_PATHS } from '../firebase';

const ANALYTICS_PATH = [DB_PATHS.ROOT, DB_PATHS.ANALYTICS].filter(Boolean).join('/');

function getAnonymousId(): string {
  let id = localStorage.getItem('dgo-anon-id');
  if (!id) {
    id = `anon_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
    localStorage.setItem('dgo-anon-id', id);
  }
  return id;
}

function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce/i.test(ua)) return 'mobile';
  return 'desktop';
}

let cachedGeo: any = null;

async function getGeoLocation() {
  if (cachedGeo) return cachedGeo;
  try {
    const stored = sessionStorage.getItem('dgo-geo');
    if (stored) {
      cachedGeo = JSON.parse(stored);
      return cachedGeo;
    }
    
    // Usamos ipapi.co que es gratuito hasta 1000 requests/día sin key
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    if (data && !data.error) {
      cachedGeo = {
        city: data.city,
        region: data.region,
        country: data.country_name,
      };
      sessionStorage.setItem('dgo-geo', JSON.stringify(cachedGeo));
      return cachedGeo;
    }
  } catch (err) {
    return null;
  }
  return null;
}

export async function trackEvent(
  type: string,
  data: Record<string, unknown> = {},
  userId?: string | null
) {
  try {
    const geo = await getGeoLocation();

    await addDoc(collection(db, ANALYTICS_PATH), {
      type,
      userId: userId || getAnonymousId(),
      page: window.location.pathname,
      device: getDeviceType(),
      referrer: document.referrer || 'direct',
      timestamp: Timestamp.now(),
      location: geo || null,
      ...data
    });

    // Reenviar a Meta Pixel si está disponible
    if (typeof window !== 'undefined' && (window as any).fbq) {
      const fbq = (window as any).fbq;
      switch (type) {
        case Events.PAGE_VIEW:        fbq('track', 'PageView'); break;
        case Events.ADD_TO_CART:      fbq('track', 'AddToCart', { content_name: (data as any).name, value: (data as any).price, currency: 'ARS' }); break;
        case Events.BEGIN_CHECKOUT:   fbq('track', 'InitiateCheckout', { value: (data as any).total, currency: 'ARS' }); break;
        case Events.CHECKOUT_COMPLETE:fbq('track', 'Purchase', { value: (data as any).total, currency: 'ARS' }); break;
        default:
          if (type !== 'time_on_page') fbq('trackCustom', type, data);
      }
    }

    // Google Analytics si está disponible
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', type, data);
    }
  } catch (err) {
    // El tracking nunca debe romper la experiencia del usuario
    console.warn('[Analytics] Error silencioso:', err);
  }
}

export const Events = {
  PAGE_VIEW:        'page_view',
  SCROLL_DEPTH:     'scroll_depth',
  PRODUCT_CLICK:    'product_click',
  PRODUCT_VIEW:     'product_view',
  ADD_TO_CART:      'add_to_cart',
  REMOVE_FROM_CART: 'remove_from_cart',
  CART_VIEW:        'cart_view',
  CART_ABANDON:     'cart_abandon',
  BEGIN_CHECKOUT:   'begin_checkout',
  CHECKOUT_COMPLETE:'checkout_complete',
  SEARCH_QUERY:     'search_query',
  CATEGORY_FILTER:  'category_filter',
  COUPON_APPLY:     'coupon_apply',
  COUPON_SUCCESS:   'coupon_success',
  COUPON_FAIL:      'coupon_fail',
  USER_REGISTER:    'user_register',
  USER_LOGIN:       'user_login',
  USER_LOGOUT:      'user_logout',
  WHATSAPP_CLICK:   'whatsapp_click',
  SECTION_CLICK:    'section_click',
} as const;
