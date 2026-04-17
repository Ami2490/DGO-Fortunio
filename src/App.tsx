/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, createContext, useContext, useMemo } from 'react';
import React from 'react';
import { ShoppingCart, Search, Menu, User, X, Truck, ShieldCheck, Headset, Tag, Instagram, Facebook, Mail, Phone, MapPin, Eye, Trash2, ChevronDown, Plus, ArrowLeft, ArrowRight, Zap } from 'lucide-react';
import { motion, useScroll, useTransform, AnimatePresence } from 'motion/react';
import { db, auth, DB_PATHS } from './firebase';
import { doc, collection, onSnapshot, query, orderBy, setDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { imgSizes } from './lib/cloudinaryUtils';
import AdminPage from './AdminPage';
import { CheckoutPage } from './CheckoutPage';
import { UserBadge } from './components/UserBadge';
import { awardPoints, generateReferralCode, processReferral } from './services/pointService';
import { RegistrationIncentive } from './components/RegistrationIncentive';
import { trackEvent, Events } from './lib/analytics';
import { Product } from './services/dbService';

// --- Types ---
// ... (rest of the types)
interface SiteConfig {
  nav: { label: string; path: string; visible: boolean }[];
  hero: {
    title: string;
    subtitle: string;
    bgImage: string;
    logoImage: string;
    buttonText: string;
    buttonColor: string;
    effectType: string;
    overlayColor: string;
    parallax: boolean;
  };
  theme: {
    primaryColor: string;
    secondaryColor: string;
    borderRadius: string;
    fontBase: string;
  };
  footer: {
    description: string;
    phone: string;
    email: string;
    address: string;
    social: { instagram: string; facebook: string };
  };
  layoutStyle?: 'bento' | 'masonry';
}

interface Category {
  id: string;
  name: string;
  image: string;
  span?: string;
}

interface Benefit {
  id: string;
  iconName: string;
  title: string;
  desc: string;
}

// --- Context ---
const ThemeContext = createContext<SiteConfig['theme'] | null>(null);

const iconMap: Record<string, any> = { Truck, ShieldCheck, Headset, Tag };

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [animationVariant, setAnimationVariant] = useState('fade');
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [dynamicCategories, setDynamicCategories] = useState<Category[]>([]);
  const [dynamicBenefits, setDynamicBenefits] = useState<Benefit[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'relevant' | 'price-asc' | 'price-desc'>('relevant');
  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);

  const carouselProducts = useMemo(() => {
    const seed = new Date().toDateString();
    let filtered = products.filter(p => p.featured || p.isOffer);
    
    // Fallback: Si no hay destacados, mostrar los últimos 6 para que Alan vea el componente
    if (filtered.length === 0) {
      filtered = [...products].reverse().slice(0, 6);
    }

    return filtered.sort((a, b) => {
      const hash = (str: string) => str.split('').reduce((prev, curr) => prev + curr.charCodeAt(0), 0);
      return (hash(a.id + seed) % 100) - (hash(b.id + seed) % 100);
    });
  }, [products]);
  
  const { scrollY } = useScroll();
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  // Listener para resize y manejo de ancho reactivo
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const itemsPerView = windowWidth >= 1024 ? 3 : windowWidth >= 768 ? 2 : 1;

  // Auto-play para el carrusel (bucle constante)
  useEffect(() => {
    if (carouselProducts.length === 0 || isCarouselPaused) return;
    const interval = setInterval(() => {
      setActiveCarouselIndex(prev => (prev + 1) % carouselProducts.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [carouselProducts.length, itemsPerView, isCarouselPaused]);


  const y = useTransform(scrollY, [0, 500], [0, 150]);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
      trackEvent(Events.PAGE_VIEW, {}, currentUser?.uid);
      // Auto-scroll on path change if hash exists
      const hash = window.location.hash;
      if (hash) {
        setTimeout(() => {
          const el = document.getElementById(hash.substring(1));
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 1000);
      }
    };
    window.addEventListener('popstate', handleLocationChange);
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      trackEvent(Events.PAGE_VIEW, {}, user?.uid);
    });
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      unsubAuth();
    };
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    trackEvent(Events.PAGE_VIEW, {}, currentUser?.uid);
    window.scrollTo(0, 0);
  };

  const handleNavigation = (item: any, isMobile: boolean = false) => {
    const label = item.label?.trim().toUpperCase() || '';
    let path = item.path || '';

    // Fix paths like "#nosotros" from legacy settings to just "nosotros" internally 
    if (path.startsWith('#')) path = path.substring(1);

    if (label === 'CATEGORÍAS') {
      setIsCategoryMenuOpen(!isCategoryMenuOpen);
      return;
    }

    if (isMobile) {
      setIsMenuOpen(false);
    }

    if (label === 'CONTACTO' || path === 'whatsapp') {
      const phone = config?.footer?.phone?.replace(/\D/g, '') || '5491100000000';
      window.open(`https://wa.me/${phone}`, '_blank');
      return;
    }

    const isHomeLink = label === 'INICIO' || path === '/' || path === 'hero';
    const isNosotrosLink = label.includes('NOSOTROS') || path === 'nosotros';
    const isServiciosLink = label.includes('SERVICIO') || path === 'servicios';
    const isCategoriasLink = label.includes('CATEGOR') || path === 'categorias';

    if (isHomeLink || isNosotrosLink || isServiciosLink || isCategoriasLink) {
      const targetId = isNosotrosLink ? 'nosotros' : 
                       (isServiciosLink ? 'servicios' : 
                       (isCategoriasLink ? 'categorias' : 'hero'));

      const scrollToTarget = () => {
        setTimeout(() => {
          if (targetId === 'hero') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
          const el = document.getElementById(targetId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
          } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }, 150);
      };

      if (currentPath !== '/') {
        navigate('/');
        setTimeout(scrollToTarget, 300); // extra wait for React to mount the Home page
      } else {
        scrollToTarget();
      }
    } else {
      // For any other explicit paths not mapped above
      navigate(`/${path.replace(/^\//, '')}`);
    }
  };

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.id === product.id);
    const min = product.minPurchaseQuantity || 1;
    const step = product.purchaseStep || 1;

    if (existing) {
      setCart(cart.map(item => 
        item.id === product.id 
          ? { ...item, quantity: item.quantity + step } 
          : item
      ));
    } else {
      setCart([...cart, { ...product, quantity: min }]);
    }
    setIsCartOpen(true);
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((item: any) => item.id !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === productId) {
        const step = item.purchaseStep || 1;
        const min = item.minPurchaseQuantity || 1;
        
        // Si el delta es 1 o -1, multiplicamos por el step
        const actualDelta = (delta === 1 || delta === -1) ? delta * step : delta;
        const newQty = Math.max(min, item.quantity + actualDelta);
        
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const cartTotal = cart.reduce((acc, item) => {
    const price = (item.wholesalePrice && item.quantity >= (item.wholesaleMinQuantity || 12)) 
      ? item.wholesalePrice 
      : item.price;
    return acc + (price * item.quantity);
  }, 0);


  const phrases = ['Equipamiento Profesional', 'Vajilla de Calidad', 'Logística Express'];
  const variants = {
    fade: { opacity: [0, 1], y: [10, 0] },
    slide: { opacity: [0, 1], x: [-20, 0] },
    scale: { opacity: [0, 1], scale: [0.9, 1] },
  };

  useEffect(() => {
    const unsubConfig = onSnapshot(doc(db, DB_PATHS.SETTINGS, 'siteConfig'), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as SiteConfig;
        setConfig(data);
        // Inject CSS Variables
        const root = document.documentElement;
        root.style.setProperty('--p', data.theme.primaryColor);
        root.style.setProperty('--s', data.theme.secondaryColor);
        root.style.setProperty('--br', data.theme.borderRadius);
      }
    });

    const unsubCats = onSnapshot(query(collection(db, DB_PATHS.CATEGORIES), orderBy('order', 'asc')), (snapshot) => {
      setDynamicCategories(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    });

    const unsubBenefits = onSnapshot(query(collection(db, DB_PATHS.BENEFITS), orderBy('order', 'asc')), (snapshot) => {
      setDynamicBenefits(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Benefit)));
    });

    const unsubProducts = onSnapshot(collection(db, DB_PATHS.PRODUCTS), (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubConfig(); unsubCats(); unsubBenefits(); unsubProducts(); };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPhraseIndex((phraseIndex + 1) % phrases.length);
      setAnimationVariant(Object.keys(variants)[Math.floor(Math.random() * 3)]);
    }, 2000);
    return () => clearTimeout(timeout);
  }, [phraseIndex]);

  // Carousel Auto-play logic
  useEffect(() => {
    if (carouselProducts.length <= 3) return;
    
    const interval = setInterval(() => {
      setActiveCarouselIndex(prev => (prev + 1) % Math.ceil(carouselProducts.length / 3));
    }, 3000);
    return () => clearInterval(interval);
  }, [carouselProducts.length]);

  // Default Fallbacks
  const navItems = config?.nav.filter(n => n.visible) || [
    { label: 'INICIO', path: '/', visible: true },
    { label: 'CATEGORÍAS', path: '#categorias', visible: true },
    { label: 'NOSOTROS', path: '#nosotros', visible: true },
    { label: 'SERVICIOS', path: '#servicios', visible: true },
    { label: 'CONTACTO', path: 'whatsapp', visible: true }
  ];

  const heroData = config?.hero || {
    title: 'Soluciones Gastronómicas Integrales',
    subtitle: 'Venta por Mayor y Menor',
    bgImage: '/b0.webp',
    logoImage: '/logo.png',
    buttonText: 'Descubre Nuestras Soluciones',
    buttonColor: '#10b981',
    effectType: 'fade',
    overlayColor: 'rgba(0,0,0,0.6)',
    parallax: true
  };

  const footerData = config?.footer || {
    description: 'Tu socio estratégico en equipamiento gastronómico.',
    phone: '+54 9 11 1234-5678',
    email: 'ventas@distribuidoradgo.com',
    address: 'Buenos Aires, Argentina',
    social: { instagram: '#', facebook: '#' }
  };

  const displayCategories = dynamicCategories.length > 0 ? dynamicCategories : [
    { name: 'Platos', image: '/b1.webp', span: 'md:col-span-2 md:row-span-2' },
    { name: 'Set de Cubiertos', image: '/b3.webp' },
    { name: 'Copas - Vasos - Jarras', image: '/Crystal_wine_glasses_202604142143.webp' },
    { name: 'Kits', image: '/b4.webp' },
    { name: 'Cazuelas y Bowls', image: '/b5.webp' },
    { name: 'Tazas con Plato', image: '/b6.webp' },
    { name: 'Freidoras YAC', image: '/b7.webp' },
    { name: 'Bandejas y Fuentes', image: '/b8.webp' },
    { name: 'Rollos Papel Térmico', image: '/b9.webp' },
  ];

  const displayBenefits = dynamicBenefits.length > 0 ? dynamicBenefits : [
    { iconName: 'Truck', title: 'Envío Express', desc: 'Entregas rápidas y seguras' },
    { iconName: 'ShieldCheck', title: 'Calidad Garantizada', desc: 'Productos de primer nivel' },
    { iconName: 'Headset', title: 'Atención Personalizada', desc: 'Asesoramiento experto' },
    { iconName: 'Tag', title: 'Precios Mayoristas', desc: 'Los mejores precios del mercado' },
  ];

  if (currentPath === '/admin') {
    return <AdminPage onBack={() => navigate('/')} />;
  }

  if (currentPath === '/checkout') {
    return (
      <CheckoutPage 
        cart={cart} 
        onBack={() => navigate('/')} 
        onUpdateQuantity={updateQuantity}
        onRemoveItem={removeFromCart}
        onSuccess={() => {
          setCart([]);
          setIsCartOpen(false);
          navigate('/');
        }}
        userId={currentUser?.uid}
        userEmail={currentUser?.email}
        supportPhone={config?.footer?.phone || '5491112345678'}
      />
    );
  }

  return (
    <ThemeContext.Provider value={config?.theme || null}>
      <div className="min-h-screen bg-[#0a1118] text-white font-sans" style={{ borderRadius: 'var(--br)' }}>
        <motion.header 
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          className="sticky top-0 z-50 bg-[#0a1118]/80 backdrop-blur-md border-b border-white/10"
        >
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
            <div className="flex items-center justify-start md:w-[200px]">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="md:hidden text-gray-400 hover:text-white">
                {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
            
            <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 gap-8 items-center text-gray-400">
              {navItems.map(item => (
                <div key={item.label} className="relative group">
                  <button
                    onClick={() => handleNavigation(item, false)}
                    className="hover:text-[var(--p)] transition-colors uppercase text-xs font-black tracking-[0.2em] flex items-center gap-1.5"
                  >
                    {item.label}
                    {item.label === 'CATEGORÍAS' && <ChevronDown className="w-3 h-3 group-hover:rotate-180 transition-transform" />}
                  </button>

                  {item.label === 'CATEGORÍAS' && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 pt-6 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                      <div className="bg-[#111a24] border border-white/10 rounded-2xl overflow-hidden shadow-2xl min-w-[240px]">
                        {displayCategories.map((cat) => (
                          <button
                            key={cat.id || cat.name}
                            onClick={() => navigate(`/categoria/${cat.id || cat.name.toLowerCase().replace(/\s+/g, '-')}`)}
                            className="w-full text-left px-6 py-4 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all uppercase tracking-widest border-b border-white/5 last:border-0"
                          >
                            {cat.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 md:w-[200px]">
              <button 
                onClick={() => setIsSearchOpen(true)}
                className="p-2 text-gray-400 hover:text-[var(--p)] transition-colors rounded-full hover:bg-white/5"
              >
                <Search className="w-5 h-5" />
              </button>
              
              <div className="flex items-center gap-2 md:gap-4">
                {currentUser ? (
                  <UserBadge user={currentUser} />
                ) : (
                  <button 
                    onClick={() => setIsAuthModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 hover:bg-white/5 transition-colors group"
                  >
                    <User className="w-5 h-5 text-[var(--p)] group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-black uppercase tracking-widest hidden md:block">Acceso</span>
                  </button>
                )}
                
                <button 
                  onClick={() => setIsCartOpen(true)}
                  className="relative p-2 hover:bg-white/5 rounded-full transition-colors group"
                >
                  <ShoppingCart className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
                  {cart.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-[var(--p)] text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#0a1118] animate-in zoom-in">
                      {cart.reduce((sum, item) => sum + item.quantity, 0)}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </nav>
          
          <AnimatePresence>
            {isMenuOpen && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="md:hidden bg-[#0a1118] border-b border-white/10 p-4"
              >
                {navItems.map(item => (
                  <div key={item.label}>
                    <button
                      onClick={() => handleNavigation(item, true)}
                      className="flex items-center justify-between w-full text-left py-4 text-gray-400 hover:text-[var(--p)] uppercase text-[10px] font-black tracking-widest border-b border-white/5"
                    >
                      {item.label}
                      {item.label === 'CATEGORÍAS' && <ChevronDown className={`w-3 h-3 transition-transform ${isCategoryMenuOpen ? 'rotate-180' : ''}`} />}
                    </button>

                    {item.label === 'CATEGORÍAS' && isCategoryMenuOpen && (
                      <div className="bg-white/5 rounded-2xl mt-2 overflow-hidden">
                        {displayCategories.map(cat => (
                          <button
                            key={cat.id || cat.name}
                            onClick={() => {
                              setIsMenuOpen(false);
                              setIsCategoryMenuOpen(false);
                              navigate(`/categoria/${cat.id || cat.name.toLowerCase().replace(/\s+/g, '-')}`);
                            }}
                            className="w-full text-left px-6 py-4 text-[10px] font-bold text-gray-500 hover:text-white transition-all uppercase tracking-[0.2em]"
                          >
                            {cat.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-0">
          {currentPath === '/' ? (
            <>
              <section id="hero" className="relative -mx-4 sm:-mx-6 lg:-mx-8 h-[500px] flex items-center justify-center overflow-hidden">
                <motion.img
                  style={heroData.parallax ? { y } : {}}
                  src={heroData.bgImage}
                  alt="Hero Background"
                  className="absolute inset-0 w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0" style={{ backgroundColor: heroData.overlayColor }} />
                <div className="relative z-10 text-center px-4">
                  <motion.img
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                    src={heroData.logoImage}
                    alt="Logo"
                    className="w-32 h-32 mx-auto mb-6 object-contain drop-shadow-2xl"
                    referrerPolicy="no-referrer"
                  />
                  <motion.h1 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-4xl md:text-6xl font-bold mb-4 tracking-tight drop-shadow-lg"
                  >
                    {heroData.title}
                  </motion.h1>
                  <motion.h2 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-[var(--p)] text-2xl md:text-3xl font-bold mb-6 drop-shadow-lg"
                  >
                    {heroData.subtitle}
                  </motion.h2>
                  <div className="h-8 mb-8">
                    <AnimatePresence mode="wait">
                      <motion.p 
                        key={phraseIndex}
                        initial={{ opacity: 0 }}
                        animate={variants[animationVariant as keyof typeof variants] || variants.fade}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        className="text-gray-100 text-lg font-medium drop-shadow-lg"
                      >
                        {phrases[phraseIndex]}
                      </motion.p>
                    </AnimatePresence>
                  </div>
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    onClick={() => {
                      const el = document.getElementById('categorias');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    style={{ backgroundColor: 'var(--p)' }}
                    className="text-white px-8 py-3 rounded-full font-medium transition-all shadow-lg hover:shadow-[var(--p)]/50 uppercase tracking-widest text-[10px] font-black"
                  >
                    {heroData.buttonText}
                  </motion.button>
                </div>
              </section>

              <section className="py-12 border-b border-white/5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                  {displayBenefits.map((benefit, index) => {
                    const Icon = iconMap[benefit.iconName] || Tag;
                    return (
                      <motion.div
                        key={benefit.title}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.1 }}
                        className="flex flex-col items-center text-center group"
                      >
                        <div className="w-10 h-10 rounded-full bg-[var(--p)]/10 flex items-center justify-center mb-4 group-hover:bg-[var(--p)]/20 transition-colors">
                          <Icon className="w-5 h-5 text-[var(--p)]" />
                        </div>
                        <h3 className="text-sm font-bold mb-1">{benefit.title}</h3>
                        <p className="text-xs text-gray-400">{benefit.desc}</p>
                      </motion.div>
                    );
                  })}
                </div>
              </section>

              {/* Destacados Branding Dark Carousel (UX Improved) */}
              {carouselProducts.length > 0 && (
                <section 
                  className="py-12 bg-[#050a0f] border-y border-white/5 relative overflow-hidden"
                  onMouseEnter={() => setIsCarouselPaused(true)}
                  onMouseLeave={() => setIsCarouselPaused(false)}
                >
                  <div className="absolute top-0 left-1/4 w-64 h-64 bg-[var(--p)]/5 blur-[120px] rounded-full" />
                  
                  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-8">
                      {/* Título Left */}
                      <div className="flex-shrink-0 lg:w-48">
                        <span className="text-[var(--p)] text-[10px] font-black uppercase tracking-[0.3em] mb-2 block">Selección Élite</span>
                        <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Destacados</h2>
                        <div className="flex gap-1 mt-4">
                           {carouselProducts.map((_, i) => (
                             <button 
                               key={i} 
                               onClick={() => setActiveCarouselIndex(i)}
                               className={`h-1 rounded-full transition-all duration-500 ${activeCarouselIndex === i ? 'bg-[var(--p)] w-8' : 'bg-white/10 w-4 hover:bg-white/20'}`} 
                             />
                           ))}
                        </div>
                      </div>

                      {/* Carousel Area */}
                      <div className="flex-1 relative group/carousel overflow-hidden py-4 -my-4">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveCarouselIndex(prev => (prev - 1 + carouselProducts.length) % carouselProducts.length);
                          }}
                          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 bg-[#0c1219]/80 rounded-full border border-white/10 text-white/50 hover:text-white hover:bg-[var(--p)] hover:border-[var(--p)] transition-all opacity-0 group-hover/carousel:opacity-100 shadow-2xl backdrop-blur-md"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>

                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveCarouselIndex(prev => (prev + 1) % carouselProducts.length);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 bg-[#0c1219]/80 rounded-full border border-white/10 text-white/50 hover:text-white hover:bg-[var(--p)] hover:border-[var(--p)] transition-all opacity-0 group-hover/carousel:opacity-100 shadow-2xl backdrop-blur-md"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>

                        <motion.div 
                          animate={{ x: `-${activeCarouselIndex * (100 / (carouselProducts.length * 2))}%` }}
                          transition={{ type: "spring", stiffness: 40, damping: 20 }}
                          className="flex"
                          style={{ width: `${(carouselProducts.length * 2 * 100) / itemsPerView}%` }}
                          onHoverStart={() => setIsCarouselPaused(true)}
                          onHoverEnd={() => setIsCarouselPaused(false)}
                        >
                          {[...carouselProducts, ...carouselProducts].map((item, idx) => (
                            <div 
                              key={`${item.id}-${idx}`} 
                              className="flex-none px-2 cursor-pointer"
                              style={{ width: `${100 / (carouselProducts.length * 2)}%` }}
                              onClick={() => setSelectedProduct(item)}
                            >
                              <motion.div 
                                whileHover={{ y: -5 }}
                                className="bg-[#0c1219] rounded-xl border border-white/5 p-3 flex items-center gap-4 hover:border-[var(--p)]/40 h-[100px] group transition-all duration-300 shadow-xl"
                              >
                                <div className="w-20 h-20 flex-shrink-0 bg-black/40 rounded-lg p-2 border border-white/5 flex items-center justify-center relative">
                                    <img 
                                      src={imgSizes.thumb(item.image)} 
                                      className="max-w-full max-h-full object-contain group-hover:scale-110 transition-transform duration-500" 
                                      alt={item.name} 
                                    />
                                    {item.isOffer && (
                                      <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-white text-[7px] font-black shadow-lg">
                                        OFF
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0 pr-2">
                                    <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1 truncate group-hover:text-white transition-colors">{item.name}</h4>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xl font-black text-white">${item.price}</span>
                                      {item.isOffer && item.originalPrice && (
                                        <span className="text-[10px] text-white/20 line-through">${item.originalPrice}</span>
                                      )}
                                    </div>
                                    <div className="mt-2 w-0 group-hover:w-8 h-0.5 bg-[var(--p)] transition-all duration-300 rounded-full" />
                                  </div>
                                </motion.div>
                              </div>
                            ))}
                          </motion.div>
                        </div>
                      </div>
                    </div>
                </section>
              )}

              {config?.layoutStyle === 'masonry' ? (
                <div 
                  id="categorias" 
                  className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6 py-12"
                >
                  {displayCategories.map((category) => (
                    <motion.div
                      key={category.id || category.name}
                      initial={{ opacity: 0, scale: 0.9 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      whileHover={{ scale: 1.02 }}
                      onClick={() => navigate(`/categoria/${category.id || category.name.toLowerCase().replace(/\s+/g, '-')}`)}
                      className="break-inside-avoid group relative overflow-hidden rounded-[2.5rem] bg-[#111a24] border border-white/10 hover:shadow-[0_0_40px_rgba(var(--p-rgb),0.3)] transition-all duration-500 cursor-pointer"
                    >
                      <img
                        src={category.image || 'https://images.unsplash.com/photo-1591197172027-faaa07a3df57?q=80&w=600&auto=format&fit=crop'}
                        alt={category.name}
                        className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-700"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0a1118]/80 via-transparent to-transparent opacity-80" />
                      <div className="absolute bottom-0 left-0 right-0 p-8 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                        <span className="text-[10px] text-[var(--p)] font-black uppercase tracking-[0.3em] mb-2 block">DGO Colección</span>
                        <h3 className="text-3xl font-black uppercase tracking-tighter mb-4">{category.name}</h3>
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/50 group-hover:text-[var(--p)] transition-colors">
                          Explorar Catálogo <Plus className="w-4 h-4" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <motion.div 
                  id="categorias"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                  className="grid grid-cols-1 md:grid-cols-4 gap-6 auto-rows-[250px] py-12"
                >
                  {displayCategories.map((category) => (
                    <motion.div
                      key={category.id || category.name}
                      variants={{
                        hidden: { opacity: 0, y: 20 },
                        visible: { opacity: 1, y: 0 }
                      }}
                      whileHover={{ scale: 1.02 }}
                      onClick={() => navigate(`/categoria/${category.id || category.name.toLowerCase().replace(/\s+/g, '-')}`)}
                      className={`group relative overflow-hidden rounded-3xl bg-[#111a24] border border-white/10 p-6 flex flex-col justify-end ${category.span || 'md:col-span-1'} hover:shadow-[0_0_20px_rgba(var(--p-rgb),0.3)] transition-shadow duration-300 cursor-pointer`}
                    >
                      <div className="absolute inset-0 opacity-40">
                        <img
                          src={category.image || 'https://images.unsplash.com/photo-1591197172027-faaa07a3df57?q=80&w=600&auto=format&fit=crop'}
                          alt={category.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0a1118] via-transparent to-transparent" />
                      <div className="relative z-10">
                        <h3 className="text-2xl font-bold mb-2">{category.name}</h3>
                        <button className="text-sm text-[var(--p)] font-medium hover:text-white transition-colors">
                          Ver Catálogo →
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {/* Nosotros Section */}
              <section id="nosotros" className="py-24 border-t border-white/5 scroll-mt-24">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
                  <div className="relative">
                    <div className="absolute -inset-4 bg-[var(--p)]/20 blur-3xl rounded-full" />
                    <img 
                      src="/b0.webp" 
                      alt="Nosotros" 
                      className="relative rounded-[40px] border border-white/10 shadow-2xl"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div>
                    <span className="text-[var(--p)] text-[10px] font-black uppercase tracking-[0.3em] mb-4 block">Nuestra Historia</span>
                    <h2 className="text-5xl font-black uppercase tracking-tighter mb-8 leading-none">Pasión por la <br/> Gastronomía</h2>
                    <p className="text-gray-400 text-lg leading-relaxed mb-8">
                      Desde hace más de 15 años, DGO se ha consolidado como el socio estratégico de los principales restaurantes y hoteles del país. No solo vendemos vajilla; entregamos soluciones integrales que elevan la experiencia de cada comensal.
                    </p>
                    <div className="grid grid-cols-2 gap-8">
                      <div>
                        <h4 className="text-3xl font-black text-white mb-1">+500</h4>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Clientes Activos</p>
                      </div>
                      <div>
                        <h4 className="text-3xl font-black text-white mb-1">15+</h4>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Años de Trayectoria</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Servicios Section */}
              <section id="servicios" className="py-24 border-t border-white/5 scroll-mt-24">
                <div className="text-center mb-16">
                  <span className="text-[var(--p)] text-[10px] font-black uppercase tracking-[0.3em] mb-4 block">Lo que hacemos</span>
                  <h2 className="text-5xl font-black uppercase tracking-tighter">Servicios Premium</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {[
                    { title: 'Venta Mayorista', desc: 'Precios competitivos para equipar tu negocio desde cero.', icon: Tag },
                    { title: 'Asesoramiento', desc: 'Expertos que te ayudan a elegir la vajilla ideal para tu concepto.', icon: User },
                    { title: 'Logística Propia', desc: 'Entregas garantizadas en tiempo y forma con nuestra flota.', icon: Truck },
                  ].map((serv, i) => (
                    <div key={i} className="bg-[#111a24] p-10 rounded-[40px] border border-white/10 hover:border-[var(--p)]/50 transition-all group">
                      <div className="w-12 h-12 bg-[var(--p)]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <serv.icon className="w-6 h-6 text-[var(--p)]" />
                      </div>
                      <h3 className="text-xl font-black uppercase tracking-tight mb-4">{serv.title}</h3>
                      <p className="text-gray-400 text-sm leading-relaxed">{serv.desc}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : currentPath.startsWith('/categoria/') ? (() => {
            const categoryId = currentPath.split('/').pop() || '';
            const category = displayCategories.find(c => (c.id === categoryId) || (c.name.toLowerCase().replace(/\s+/g, '-') === categoryId));
            const categoryName = category ? category.name : categoryId.replace(/-/g, ' ');
            
            return (
              <div className="pb-24">
                {/* Narrow Category Banner */}
                <div className="relative h-48 md:h-64 mt-[-80px] pt-20 mb-12 overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-0 z-0">
                    <img 
                      src={category?.image || 'https://picsum.photos/seed/cat/1920/400'} 
                      alt={categoryName}
                      className="w-full h-full object-cover opacity-80 scale-110 transition-transform duration-700"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a1118]/20 to-[#0a1118]" />
                  </div>
                  <div className="relative z-10 text-center">
                    <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter italic">
                      {categoryName}
                    </h2>
                    <div className="h-1 w-20 bg-[var(--p)] mx-auto mt-4 rounded-full shadow-[0_0_10px_rgba(var(--p-rgb),0.5)]" />
                  </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                    <button 
                      onClick={() => {
                        navigate('/');
                        window.scrollTo(0,0);
                      }} 
                      className="text-gray-500 hover:text-white flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors"
                    >
                      ← Volver al Catálogo
                    </button>

                    <div className="flex items-center gap-4 bg-[#111a24] p-1.5 rounded-2xl border border-white/5">
                      {[
                        { id: 'relevant', label: 'Relevantes' },
                        { id: 'price-asc', label: 'Menor Precio' },
                        { id: 'price-desc', label: 'Mayor Precio' }
                      ].map(filter => (
                        <button
                          key={filter.id}
                          onClick={() => setSortBy(filter.id as any)}
                          className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${sortBy === filter.id ? 'bg-[var(--p)] text-white shadow-lg shadow-[var(--p)]/20' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8">
                    {products
                      .filter(p => p.categoryId === categoryId || p.category === categoryId || p.category === category?.name.toLowerCase().replace(/\s+/g, '-') || p.category === 'all')
                      .sort((a, b) => {
                        if (sortBy === 'price-asc') return a.price - b.price;
                        if (sortBy === 'price-desc') return b.price - a.price;
                        if (sortBy === 'relevant') {
                           if (a.featured && !b.featured) return -1;
                           if (!a.featured && b.featured) return 1;
                        }
                        return 0;
                      })
                      .map(product => (
                        <motion.div 
                          key={product.id}
                          whileHover={{ y: -10 }}
                          className="bg-[#111a24] rounded-3xl border border-white/10 overflow-hidden group relative"
                        >
                          {product.isOffer && (
                            <div className="absolute top-4 left-4 z-10 bg-red-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">
                              Sale
                            </div>
                          )}
                          <div className="aspect-square relative overflow-hidden">
                            <img src={imgSizes.card(product.image)} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                              <button onClick={() => setSelectedProduct(product)} className="p-3 bg-white text-black rounded-full hover:bg-[var(--p)] hover:text-white transition-all">
                                <Eye className="w-5 h-5" />
                              </button>
                              <button onClick={() => addToCart(product)} className="p-3 bg-[var(--p)] text-white rounded-full hover:bg-white hover:text-black transition-all">
                                <ShoppingCart className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                          <div className="p-6">
                            <p className="text-[9px] text-[var(--p)] font-black uppercase tracking-[0.2em] mb-1">{product.category}</p>
                            <h3 className="font-bold text-lg mb-2">{product.name}</h3>
                            <div className="flex items-center justify-between">
                              <div className="flex flex-col">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-white font-black text-xl">${product.price}</span>
                                  {product.wholesalePrice && (
                                    <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Mayorista 🔥</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">x {product.unitType === 'dozen' ? 'Docena' : 'Unidad'}</span>
                                  {product.isOffer && product.originalPrice && (
                                    <span className="text-[9px] text-gray-500 line-through font-bold">${product.originalPrice}</span>
                                  )}
                                </div>
                              </div>
                              <button onClick={() => addToCart(product)} className="bg-white/5 hover:bg-white/10 p-2 rounded-xl transition-all">
                                <Plus className="w-4 h-4 text-gray-400" />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    {products.filter(p => p.categoryId === categoryId || p.category === categoryId || p.category === category?.name.toLowerCase().replace(/\s+/g, '-')).length === 0 && (
                      <div className="col-span-full py-20 text-center text-gray-500 font-bold uppercase tracking-widest text-xs">
                        No hay productos en esta categoría todavía.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })() : null}
        </main>

        <footer className="bg-[#0a1118] border-t border-white/10 pt-16 pb-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
              <div className="col-span-1 md:col-span-2">
                <img src={imgSizes.logo(heroData.logoImage)} alt="Logo" className="w-24 mb-6" />
                <p className="text-gray-400 text-sm max-w-md leading-relaxed">
                  {footerData.description}
                </p>
              </div>
              <div>
                <h4 className="text-white font-bold mb-6 italic tracking-tighter uppercase text-sm">Navegación</h4>
                <ul className="space-y-4 text-xs text-gray-400 font-medium">
                  {navItems.map(item => (
                    <li key={item.label}>
                      <button 
                        onClick={() => {
                          const label = item.label?.trim().toUpperCase() || '';
                          const path = item.path || '';

                          if (label === 'CONTACTO' || path === 'whatsapp') {
                            const phone = footerData.phone.replace(/\D/g, '') || '5491100000000';
                            window.open(`https://wa.me/${phone}`, '_blank');
                            return;
                          }

                          const isHomeLink = label === 'INICIO' || path === '/' || path === '#hero';
                          const isNosotrosLink = label.includes('NOSOTROS') || path === '#nosotros';
                          const isServiciosLink = label.includes('SERVICIO') || path === '#servicios';
                          const isCategoriasLink = label.includes('CATEGOR') || path === '#categorias';

                          if (path.startsWith('#') || isHomeLink || isNosotrosLink || isServiciosLink || isCategoriasLink) {
                            const targetId = path.startsWith('#') ? path.substring(1) : 
                                           (isNosotrosLink ? 'nosotros' : 
                                           (isServiciosLink ? 'servicios' : 
                                           (isHomeLink ? 'hero' : 
                                           (isCategoriasLink ? 'categorias' : ''))));
                            
                            if (currentPath !== '/') {
                              navigate('/');
                              if (targetId) {
                                setTimeout(() => {
                                  const el = document.getElementById(targetId);
                                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                                }, 800);
                              }
                            } else {
                              if (targetId) {
                                const el = document.getElementById(targetId);
                                if (el) el.scrollIntoView({ behavior: 'smooth' });
                              } else {
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }
                            }
                          } else {
                            navigate(path);
                          }
                        }}
                        className="hover:text-[var(--p)] transition-colors uppercase tracking-widest text-[9px]"
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-white font-bold mb-6">Contacto</h4>
                <ul className="space-y-4 text-sm text-gray-400">
                  <li className="flex items-center gap-3"><Phone className="w-4 h-4 text-[var(--p)]" /> {footerData.phone}</li>
                  <li className="flex items-center gap-3"><Mail className="w-4 h-4 text-[var(--p)]" /> {footerData.email}</li>
                  <li className="flex items-center gap-3"><MapPin className="w-4 h-4 text-[var(--p)]" /> {footerData.address}</li>
                </ul>
                <div className="flex gap-4 mt-8">
                  <a href={footerData.social.instagram}><Instagram className="w-5 h-5 text-gray-400 hover:text-[var(--p)] cursor-pointer transition-colors" /></a>
                  <a href={footerData.social.facebook}><Facebook className="w-5 h-5 text-gray-400 hover:text-[var(--p)] cursor-pointer transition-colors" /></a>
                </div>
              </div>
            </div>
            <div className="border-t border-white/5 pt-8 flex flex-col md:row items-center justify-between gap-4 text-xs text-gray-500">
              <p>© 2024 Distribuidora DGO. Todos los derechos reservados.</p>
              <div className="flex gap-6">
                <a href="#" className="hover:text-white transition-colors">Términos y Condiciones</a>
                <a href="#" className="hover:text-white transition-colors">Política de Privacidad</a>
              </div>
            </div>
          </div>
        </footer>

        {/* WhatsApp Button */}
        <a 
          href={`https://wa.me/${footerData.phone.replace(/\D/g, '') || '5491100000000'}`} 
          target="_blank" 
          rel="noopener noreferrer"
          className="fixed bottom-8 right-8 z-[100] bg-[#25D366] p-4 rounded-full shadow-2xl hover:scale-110 transition-transform group"
        >
          <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 bg-white text-black px-4 py-2 rounded-xl text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl">
            ¿Necesitas ayuda? ¡Escríbenos!
          </span>
        </a>

        {/* Search Modal */}
        <AnimatePresence>
          {isSearchOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSearchOpen(false)}
                className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200]"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="fixed top-[10%] left-1/2 -translate-x-1/2 w-full max-w-2xl bg-[#111a24] border border-white/10 rounded-3xl z-[210] p-8 shadow-2xl"
              >
                <div className="flex items-center gap-4 mb-8">
                  <Search className="w-6 h-6 text-[var(--p)]" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Buscar productos..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent border-none text-2xl font-bold focus:ring-0 placeholder-gray-600"
                  />
                  <X 
                    onClick={() => setIsSearchOpen(false)}
                    className="w-6 h-6 text-gray-500 cursor-pointer hover:text-white transition-colors" 
                  />
                </div>

                <div className="max-h-[50vh] overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                  {searchQuery.trim() === '' ? (
                    <p className="text-gray-500 text-sm">Empieza a escribir para buscar...</p>
                  ) : (
                    products
                      .filter(p => p.name?.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(p => (
                        <div 
                          key={p.id}
                          onClick={() => {
                            setSelectedProduct(p);
                            setIsSearchOpen(false);
                            setSearchQuery('');
                          }}
                          className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 cursor-pointer transition-all border border-transparent hover:border-white/10"
                        >
                          <img src={imgSizes.thumb(p.images?.[0] || p.image || '/p1.webp')} className="w-16 h-16 object-cover rounded-xl" />
                          <div>
                            <h4 className="font-bold text-white text-sm">{p.name}</h4>
                            <div className="flex items-center gap-2">
                              <p className="text-[var(--p)] font-black text-sm">${p.price}</p>
                              {p.wholesalePrice && <span className="text-[8px] bg-emerald-500/10 text-emerald-500 font-black px-1 rounded">MAYORISTA</span>}
                            </div>
                          </div>
                        </div>
                      ))
                  )}
                  {searchQuery.trim() !== '' && products.filter(p => p.name?.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                    <p className="text-gray-500 text-sm">No se encontraron productos.</p>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Cart Drawer */}
        <AnimatePresence>
          {isCartOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsCartOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110]"
              />
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-[#0a1118] z-[120] shadow-2xl border-l border-white/10 flex flex-col"
              >
                <div className="p-8 border-b border-white/10 flex items-center justify-between">
                  <h3 className="text-2xl font-black uppercase tracking-tighter">Tu Carrito</h3>
                  <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-all">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 space-y-6">
                  {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4">
                      <ShoppingCart className="w-12 h-12 opacity-20" />
                      <p className="font-bold uppercase tracking-widest text-xs">El carrito está vacío</p>
                    </div>
                  ) : (
                    cart.map(item => {
                      const isWholesaleApplied = item.wholesalePrice && item.quantity >= (item.wholesaleMinQuantity || 12);
                      const currentPrice = isWholesaleApplied ? item.wholesalePrice : item.price;
                      
                      return (
                        <div key={item.id} className="flex gap-4 bg-[#111a24] p-4 rounded-2xl border border-white/5 relative overflow-hidden">
                          {isWholesaleApplied && (
                            <div className="absolute top-0 right-0 bg-emerald-500 text-[8px] font-black px-2 py-1 rounded-bl-lg uppercase tracking-widest z-10">
                              Mayorista 🔥
                            </div>
                          )}
                          <img src={imgSizes.thumb(item.image)} alt={item.name} className="w-20 h-20 object-cover rounded-xl" />
                          <div className="flex-1">
                            <h4 className="font-bold text-sm mb-1">{item.name}</h4>
                            <p className="text-[var(--p)] font-black text-lg">
                              ${currentPrice} 
                              <span className="text-[10px] text-gray-500 font-bold ml-1 uppercase">x {item.unitType === 'dozen' ? 'Docena' : 'Unidad'}</span>
                            </p>
                            <div className="flex flex-col gap-1 mt-2">
                              <div className="flex items-center gap-4">
                                <div className="flex items-center bg-black/20 rounded-lg px-2 py-1">
                                  <button onClick={() => updateQuantity(item.id, -1)} className="px-2 text-gray-400 hover:text-white">-</button>
                                  <span className="px-2 text-xs font-bold">{item.quantity}</span>
                                  <button onClick={() => updateQuantity(item.id, 1)} className="px-2 text-gray-400 hover:text-white">+</button>
                                </div>
                                <button onClick={() => removeFromCart(item.id)} className="text-red-500 hover:text-red-400 transition-all">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              {(item.minPurchaseQuantity > 1) && (
                                <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest leading-none">
                                  Incrementos de {item.minPurchaseQuantity}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="p-8 border-t border-white/10 bg-[#111a24]">
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-gray-400 font-bold uppercase tracking-widest text-xs">Total Estimado</span>
                    <span className="text-3xl font-black text-white">${cartTotal}</span>
                  </div>
                  <button 
                    onClick={() => { navigate('/checkout'); setIsCartOpen(false); }}
                    className="w-full bg-[var(--p)] text-white py-5 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20"
                  >
                    Finalizar Compra
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Product Modal */}
        <AnimatePresence>
          {selectedProduct && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedProduct(null)}
                className="fixed inset-0 bg-black/80 backdrop-blur-md z-[130]"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-4xl bg-[#0a1118] z-[140] rounded-[40px] border border-white/10 overflow-hidden flex flex-col md:flex-row shadow-2xl"
              >
                <div className="md:w-1/2 h-64 md:h-auto relative">
                  <img 
                    src={selectedProduct.images?.[0] || selectedProduct.image || '/p1.webp'} 
                    alt={selectedProduct.name} 
                    className="w-full h-full object-cover" 
                  />
                  <button onClick={() => setSelectedProduct(null)} className="absolute top-6 left-6 p-2 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition-all md:hidden">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <div className="md:w-1/2 p-10 flex flex-col">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <span className="text-[var(--p)] text-[10px] font-black uppercase tracking-[0.2em] mb-2 block">Categoría: {selectedProduct.category}</span>
                      <h3 className="text-3xl font-black uppercase tracking-tighter leading-none">{selectedProduct.name}</h3>
                    </div>
                    <button onClick={() => setSelectedProduct(null)} className="hidden md:block p-2 hover:bg-white/5 rounded-full transition-all">
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                  <p className="text-gray-400 text-sm leading-relaxed mb-8 flex-1">
                    {selectedProduct.description || 'Este producto de alta calidad está diseñado para satisfacer las demandas más exigentes del sector gastronómico profesional. Durabilidad, elegancia y funcionalidad en cada detalle.'}
                  </p>
                  <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div>
                        <span className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Precio {
                          selectedProduct.unitType === 'dozen' ? 'por Docena' : 
                          selectedProduct.unitType === 'pack10' ? 'por Pack x10' :
                          selectedProduct.unitType === 'pack6' ? 'por Pack x6' : 'Unitario'
                        }</span>
                        <div className="flex flex-col">
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-white">${selectedProduct.price}</span>
                          </div>
                          {selectedProduct.minPurchaseQuantity > 1 && (
                            <span className="text-[10px] text-emerald-500 font-black uppercase tracking-widest">
                               Mínimo {selectedProduct.minPurchaseQuantity} {selectedProduct.unitType === 'unit' ? 'unidades' : 'un'}
                            </span>
                          )}
                        </div>
                      </div>
                      {selectedProduct.wholesalePrice && (
                        <div className="text-right">
                          <span className="text-emerald-500 font-bold uppercase tracking-widest text-[10px]">Precio Mayorista</span>
                          <div className="flex items-baseline gap-1 justify-end">
                            <span className="text-2xl font-black text-emerald-500">${selectedProduct.wholesalePrice}</span>
                            <span className="text-[10px] text-emerald-500/50 font-bold uppercase tracking-widest">({selectedProduct.wholesaleMinQuantity}+ {selectedProduct.unitType === 'dozen' ? 'doc' : 'un'})</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-4">
                      <button onClick={() => { addToCart(selectedProduct); setSelectedProduct(null); }} className="flex-1 bg-white text-black py-5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-200 transition-all">
                        Agregar al Carrito
                      </button>
                      <button 
                        onClick={() => {
                          addToCart(selectedProduct);
                          setSelectedProduct(null);
                          navigate('/checkout');
                        }}
                        className="flex-1 bg-[var(--p)] text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20"
                      >
                        Comprar Ahora
                      </button>
                    </div>
                  </div>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Registration Incentive Popup */}
        <RegistrationIncentive 
          isLoggedIn={!!currentUser} 
          onRegisterClick={() => setIsAuthModalOpen(true)} 
        />

        {/* Auth Modal */}
        <AnimatePresence>
          {isAuthModalOpen && (
            <AuthModal onClose={() => setIsAuthModalOpen(false)} />
          )}
        </AnimatePresence>
      </div>
    </ThemeContext.Provider>
  );
}

function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Perfil extendido
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [locality, setLocality] = useState('');
  const [referralInput, setReferralInput] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    if (mode === 'signup' && password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      setLoading(false);
      return;
    }

    try {
      if (mode === 'login') {
        console.log('Intentando login para:', email);
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        console.log('Iniciando registro para:', email);
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        console.log('Usuario Auth creado:', cred.user.uid);

        const userData = {
          uid: cred.user.uid,
          email: email || '',
          fullName: fullName || '',
          phone: phone || '',
          address: {
            street: street || '',
            number: number || '',
            locality: locality || ''
          },
          role: 'client',
          points: 0,
          level: 'bronce',
          referralCode: generateReferralCode(cred.user.uid),
          createdAt: new Date().toISOString()
        };

        console.log('Enviando datos a Firestore:', userData);
        await setDoc(doc(db, DB_PATHS.USERS, cred.user.uid), userData);
        console.log('Perfil Firestore creado con éxito');

        // Premiar con 50 puntos por registrarse
        await awardPoints(
          cred.user.uid,
          50,
          'registration',
          'Bono de Bienvenida DGO'
        );

        // Procesar referido si ingresó un código
        if (referralInput) {
          await processReferral(cred.user.uid, referralInput);
        }
      }
      onClose();
    } catch (err: any) {
      console.error('Error en AuthModal:', err);
      if (err.code === 'auth/email-already-in-use') setError('El email ya está en uso.');
      else if (err.code === 'auth/weak-password') setError('La contraseña es muy débil.');
      else if (err.code === 'auth/invalid-email') setError('Email inválido.');
      else setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-md z-[150]"
      />
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-[#111a24] z-[160] rounded-[40px] border border-white/10 p-10 shadow-2xl overflow-hidden"
      >
        <button onClick={onClose} className="absolute top-6 right-6 text-gray-500 hover:text-white transition-colors">
          <X className="w-6 h-6" />
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg shadow-emerald-500/30">DGO</div>
          <h3 className="text-2xl font-black uppercase tracking-tighter">
            {mode === 'login' ? 'Acceso de Usuario' : 'Crear Cuenta'}
          </h3>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-1">
            {mode === 'login' ? 'Ingresa a tu cuenta' : 'Únete a nuestra exclusiva comunidad'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          {mode === 'signup' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Nombre Completo</label>
                <input 
                  type="text" 
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full bg-[#0a1118] border border-white/5 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-white font-medium" 
                  placeholder="Juan Pérez" 
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Teléfono</label>
                <input 
                  type="tel" 
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full bg-[#0a1118] border border-white/5 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-white font-medium" 
                  placeholder="11 1234-5678" 
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Calle</label>
                <input 
                  type="text" 
                  value={street}
                  onChange={e => setStreet(e.target.value)}
                  className="w-full bg-[#0a1118] border border-white/5 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-white font-medium" 
                  placeholder="Av. Rivadavia" 
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Número</label>
                <input 
                  type="text" 
                  value={number}
                  onChange={e => setNumber(e.target.value)}
                  className="w-full bg-[#0a1118] border border-white/5 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-white font-medium" 
                  placeholder="1234" 
                  required
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Localidad</label>
                <input 
                  type="text" 
                  value={locality}
                  onChange={e => setLocality(e.target.value)}
                  className="w-full bg-[#0a1118] border border-white/5 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-white font-medium" 
                  placeholder="Ciudad Autónoma de Buenos Aires" 
                  required
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Código Referido (Opcional)</label>
                <input 
                  type="text" 
                  value={referralInput}
                  onChange={e => setReferralInput(e.target.value)}
                  className="w-full bg-[#0a1118] border border-emerald-500/10 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-white font-black uppercase tracking-widest" 
                  placeholder="X1Y2Z3" 
                />
                <p className="text-[10px] text-emerald-500/60 ml-4 font-bold tracking-tight">Usá el código de un amigo para recibir un bonus extra.</p>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-[#0a1118] border border-white/5 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-white font-medium" 
              placeholder="tu@email.com" 
              required
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Contraseña</label>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[#0a1118] border border-white/5 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-white font-medium" 
                placeholder="••••••••" 
                required
              />
            </div>
            {mode === 'signup' && (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Confirmar</label>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full bg-[#0a1118] border border-white/5 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-white font-medium" 
                  placeholder="••••••••" 
                  required
                />
              </div>
            )}
          </div>
          {error && <p className="text-red-500 text-[10px] font-bold text-center uppercase tracking-widest">{error}</p>}
          <button 
            disabled={loading}
            className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-600/20 uppercase tracking-widest text-sm disabled:opacity-50"
          >
            {loading ? 'Procesando...' : (mode === 'login' ? 'Ingresar' : 'Registrarme')}
          </button>
          <div className="text-center pt-2">
            <button 
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError('');
              }}
              className="text-emerald-500 font-bold text-xs hover:underline outline-none uppercase tracking-widest"
            >
              {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia Sesión'}
            </button>
          </div>
        </form>
      </motion.div>
    </>
  );
}


