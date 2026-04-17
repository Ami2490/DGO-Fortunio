import React, { useState, useEffect, useCallback } from 'react';
import { db, auth, DB_PATHS } from './firebase';
import { ImageUploader } from './components/ui/ImageUploader';
import {
  doc, setDoc, onSnapshot, collection, addDoc, deleteDoc,
  query, orderBy, updateDoc
} from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  LayoutDashboard, ShoppingBag, Package, Ticket, Trophy, Star,
  BarChart3, Megaphone, Grid, Settings, LogOut, Search,
  Bell, Save, Plus, Trash2, Eye, EyeOff, GripVertical,
  TrendingUp, XCircle, Truck, ChevronRight, Edit3,
  CheckCircle, Clock, AlertCircle, RefreshCw, X, Loader2,
  DollarSign, Users, ShoppingCart, ChevronDown, Image as ImageIcon,
  FileSpreadsheet, CheckCircle2, Download, CloudUpload, Trash, Upload
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import AnalyticsView from './components/admin/AnalyticsView';
import { dbService, type Order, type Product } from './services/dbService';
import { getAllCoupons, createCoupon, deleteCoupon, toggleCoupon, type Coupon } from './services/couponService';
import { getPendingApprovals, approvePoints, adjustPoints, type PointTransaction } from './services/pointService';
import { getLevelConfigs, updateLevelConfig, type LevelConfig } from './services/levelService';
import { bulkService, type BulkPreview } from './services/bulkService';
import * as XLSX from 'xlsx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: 'Pendiente',   color: '#f59e0b', bg: '#f59e0b18' },
  confirmed:  { label: 'Confirmado',  color: '#3b82f6', bg: '#3b82f618' },
  in_transit: { label: 'En camino',   color: '#8b5cf6', bg: '#8b5cf618' },
  delivered:  { label: 'Entregado',   color: '#10b981', bg: '#10b98118' },
  cancelled:  { label: 'Cancelado',   color: '#ef4444', bg: '#ef444418' },
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

interface AdminPageProps {
  onBack?: () => void;
}

export default function AdminPage({ onBack }: AdminPageProps) {
  const SHOW_DEBUG_TOOLS = true;

  // Auth & config
  const [activeTab, setActiveTab] = useState('inicio');
  const [user,       setUser]      = useState<any>(null);
  const [config,     setConfig]    = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading,    setLoading]   = useState(true);
  const [saving,     setSaving]    = useState(false);
  const [email,      setEmail]     = useState('');
  const [password,   setPassword]  = useState('');
  const [error,      setError]     = useState('');
  const [populating, setPopulating] = useState(false);

  // Real data
  const [orders,          setOrders]          = useState<Order[]>([]);
  const [products,        setProducts]        = useState<Product[]>([]);
  const [coupons,         setCoupons]         = useState<Coupon[]>([]);
  const [pendingPoints,   setPendingPoints]   = useState<PointTransaction[]>([]);
  const [levelConfigs,    setLevelConfigs]    = useState<LevelConfig[]>([]);
  const [loadingOrders,   setLoadingOrders]   = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [orderFilter,     setOrderFilter]     = useState<string>('todos');

  // Product form modal
  const [productModal, setProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  // Coupon form
  const [couponModal, setCouponModal] = useState(false);
  const [newCoupon, setNewCoupon] = useState<Partial<Coupon>>({
    code: '', discountType: 'percent', discountValue: 10,
    minPurchase: 0, maxUses: 0, active: true,
    levelRequired: null, userIdRequired: null, expiresAt: null,
  });
  const [savingCoupon, setSavingCoupon] = useState(false);

  // Bulk Load
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkStatus, setBulkStatus] = useState<'idle' | 'validating' | 'preview' | 'uploading'>('idle');
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [mediosMapping, setMediosMapping] = useState<{ filename: string; url: string; preview: string }[]>([]);
  const [uploadingMedios, setUploadingMedios] = useState(false);

  // General modal
  const [modal, setModal] = useState<{ show: boolean; title: string; message: string; onConfirm?: () => void; type: 'confirm' | 'alert' }>({
    show: false, title: '', message: '', type: 'alert'
  });

  // ── Auth & CMS config subscriptions ──────────────────────────────────────────
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    const unsubConfig = onSnapshot(doc(db, DB_PATHS.SETTINGS, 'siteConfig'), (d) => {
      if (d.exists()) setConfig(d.data());
    });
    const unsubCats = onSnapshot(collection(db, DB_PATHS.CATEGORIES), (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubAuth(); unsubConfig(); unsubCats(); };
  }, []);

  // ── Cargar datos reales al cambiar de tab ─────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    if (activeTab === 'pedidos') loadOrders();
    if (activeTab === 'productos') loadProducts();
    if (activeTab === 'cupones') loadCoupons();
    if (activeTab === 'puntos') loadPendingPoints();
    if (activeTab === 'niveles') loadLevelConfigs();
  }, [activeTab, user]);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try { setOrders(await dbService.getOrders()); } catch (e) { console.error(e); }
    setLoadingOrders(false);
  }, []);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try { setProducts(await dbService.getProducts()); } catch (e) { console.error(e); }
    setLoadingProducts(false);
  }, []);

  const loadCoupons = async () => {
    setCoupons(await getAllCoupons());
  };

  const loadPendingPoints = async () => {
    setPendingPoints(await getPendingApprovals());
  };

  const loadLevelConfigs = async () => {
    setLevelConfigs(await getLevelConfigs());
  };

  // ── Dashboard stats calculados desde pedidos reales ──────────────────────────
  const dashOrders = orders.length > 0 ? orders : [];

  // ── Auth ────────────────────────────────────────────────────────────────────
  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError('Credenciales inválidas.');
    }
  };

  const logout = () => signOut(auth);

  const showAlert   = (title: string, message: string) => setModal({ show: true, title, message, type: 'alert' });
  const showConfirm = (title: string, message: string, onConfirm: () => void) =>
    setModal({ show: true, title, message, onConfirm, type: 'confirm' });

  // ── Poblar DB ───────────────────────────────────────────────────────────────
  const populateDatabase = async () => {
    showConfirm('¿Poblar Base de Datos?', 'Esto pobla la base de datos con valores por defecto. Puede sobrescribir configuraciones existentes.', async () => {
      setPopulating(true);
      try {
        await setDoc(doc(db, 'config', 'siteConfig'), {
          nav: [
            { label: 'INICIO', path: '/', visible: true },
            { label: 'CATEGORÍAS', path: '#categorias', visible: true },
            { label: 'NOSOTROS', path: '#nosotros', visible: true },
            { label: 'SERVICIOS', path: '#servicios', visible: true },
            { label: 'CONTACTO', path: 'whatsapp', visible: true }
          ],
          hero: {
            title: 'Soluciones Gastronómicas Integrales',
            subtitle: 'Venta por Mayor y Menor',
            bgImage: '/b0.webp', logoImage: '/logo.png',
            buttonText: 'Ver Ofertas', buttonColor: '#10b981',
            effectType: 'fade', overlayColor: 'rgba(0,0,0,0.6)', parallax: true
          },
          theme: { primaryColor: '#10b981', secondaryColor: '#3b82f6', borderRadius: '24px', fontBase: 'Inter' },
          footer: {
            description: 'Tu socio estratégico en equipamiento gastronómico.',
            phone: '+54 9 11 1234-5678', email: 'ventas@distribuidoradgo.com',
            address: 'Buenos Aires, Argentina', social: { instagram: '#', facebook: '#' }
          }
        });

        const defaultCats = [
          { name: 'Ofertas', image: 'https://picsum.photos/seed/offers/1200/400', span: 'md:col-span-2', order: -1 },
          { name: 'Platos', image: '/b1.webp', span: 'md:col-span-2 md:row-span-2', order: 0 },
          { name: 'Set de Cubiertos', image: '/b3.webp', span: 'md:col-span-1', order: 1 },
          { name: 'Copas - Vasos - Jarras', image: '/Crystal_wine_glasses_202604142143.webp', span: 'md:col-span-1', order: 2 },
          { name: 'Kits', image: '/b4.webp', span: 'md:col-span-1', order: 3 },
          { name: 'Cazuelas y Bowls', image: '/b5.webp', span: 'md:col-span-1', order: 4 },
          { name: 'Bandejas y Fuentes', image: '/b8.webp', span: 'md:col-span-1', order: 5 },
        ];
        for (const cat of defaultCats) await addDoc(collection(db, DB_PATHS.CATEGORIES), cat);

        for (const benefit of [
          { iconName: 'Truck', title: 'Envío Express', desc: 'Entregas rápidas y seguras', order: 0 },
          { iconName: 'ShieldCheck', title: 'Calidad Garantizada', desc: 'Productos de primer nivel', order: 1 },
          { iconName: 'Headset', title: 'Atención Personalizada', desc: 'Asesoramiento experto', order: 2 },
          { iconName: 'Tag', title: 'Precios Mayoristas', desc: 'Los mejores precios del mercado', order: 3 },
        ]) await addDoc(collection(db, DB_PATHS.BENEFITS), benefit);

        showAlert('Éxito', 'Base de datos inicializada. Recargá la página para ver los cambios.');
      } catch (e) {
        console.error(e);
        showAlert('Error', 'Error al poblar la base de datos.');
      }
      setPopulating(false);
    });
  };

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await setDoc(doc(db, DB_PATHS.SETTINGS, 'siteConfig'), config);
      showAlert('Éxito', 'Configuración guardada');
    } catch { showAlert('Error', 'Error al guardar.'); }
    setSaving(false);
  };

  // ── Guardar producto ─────────────────────────────────────────────────────────
  const handleSaveProduct = async () => {
    if (!editingProduct?.name || editingProduct?.price === undefined || editingProduct?.price === null) return;
    setSavingProduct(true);
    try {
      const finalImages = editingProduct.images || (editingProduct.image && !editingProduct.image.includes('logo') ? [editingProduct.image] : []);
      const primaryImage = finalImages.length > 0 ? finalImages[0] : (config?.hero?.logoImage || '/logo.png');

      // Aseguramos que el campo category sea el identificador (slug) para el filtrado en App.tsx
      const categorySlug = editingProduct.category ? editingProduct.category.toLowerCase().replace(/\s+/g, '-') : '';

      // Aseguramos la persistencia correcta
      await dbService.saveProduct({
        ...editingProduct,
        image: primaryImage,
        images: finalImages,
        category: editingProduct.category || '', // Guardamos el nombre tal cual
        categoryId: editingProduct.categoryId || '' // Y el ID para filtrado preciso
      });
      await loadProducts();
      setProductModal(false);
      setEditingProduct(null);
      showAlert('Éxito', 'Producto guardado correctamente.');
    } catch (e) { 
      console.error(e);
      showAlert('Error', 'No se pudo guardar el producto.');
    }
    setSavingProduct(false);
  };

  const handleDeleteProduct = (p: Product) => {
    showConfirm('¿Eliminar producto?', `¿Eliminar "${p.name}"? Esta acción no se puede deshacer.`, async () => {
      await dbService.deleteProduct(p.id!);
      await loadProducts();
    });
  };

  // ── Guardar cupón ────────────────────────────────────────────────────────────
  const handleSaveCoupon = async () => {
    if (!newCoupon.code) return;
    setSavingCoupon(true);
    try {
      await createCoupon({
        ...newCoupon as Omit<Coupon, 'id' | 'usedCount' | 'createdAt'>,
        createdBy: user?.email || 'admin',
      });
      await loadCoupons();
      setCouponModal(false);
      setNewCoupon({ code: '', discountType: 'percent', discountValue: 10, minPurchase: 0, maxUses: 0, active: true, levelRequired: null, userIdRequired: null, expiresAt: null });
    } catch (e) { console.error(e); }
    setSavingCoupon(false);
  };

  // ── Loading & Auth screens ───────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#0a1118] flex items-center justify-center text-white font-mono">
      BOOTING_DGO_OS...
    </div>
  );

  if (!user || (user.email !== 'admin@dgo.com' && user.email !== 'nardachonealanmartin@gmail.com')) {
    return (
      <div className="min-h-screen bg-[#0a1118] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#111a24] p-10 rounded-[40px] border border-white/5 shadow-2xl">
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-emerald-500/30">DGO</div>
          </div>
          <h1 className="text-2xl font-black text-center text-white mb-2 tracking-tighter">PANEL DE CONTROL</h1>
          <p className="text-center text-gray-500 text-[10px] mb-8 uppercase tracking-[0.2em] font-bold">Distribuidora DGO</p>
          <form onSubmit={login} className="space-y-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Email de Acceso</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-[#0a1118] border border-white/5 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-white font-medium" placeholder="admin@dgo.com" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Clave de Seguridad</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-[#0a1118] border border-white/5 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-white font-medium" placeholder="••••••••" />
            </div>
            {error && <p className="text-red-500 text-xs text-center font-bold">{error}</p>}
            <button type="submit" className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-600/20 uppercase tracking-widest text-sm">Autenticar Sistema</button>
          </form>
        </div>
      </div>
    );
  }

  // ── Sidebar item ─────────────────────────────────────────────────────────────
  const SidebarItem = ({ id, icon: Icon, image, label }: any) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-4 px-8 py-4 transition-all relative group ${activeTab === id ? 'text-emerald-500' : 'text-gray-500 hover:text-white'}`}
    >
      {activeTab === id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-r-full" />}
      <div className={`p-2 rounded-xl transition-all ${activeTab === id ? 'bg-emerald-500/10' : 'group-hover:bg-white/5'}`}>
        {image ? (
          <img src={image} alt={label} className="w-5 h-5 object-contain" />
        ) : (
          <Icon className="w-5 h-5" />
        )}
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );

  // ── Pedidos: calcular stats ──────────────────────────────────────────────────
  const deliveredOrders  = dashOrders.filter(o => o.status === 'delivered');
  const pendingOrders    = dashOrders.filter(o => o.status === 'pending' || o.status === 'confirmed' || o.status === 'in_transit');
  const cancelledOrders  = dashOrders.filter(o => o.status === 'cancelled');
  const totalRevenue     = deliveredOrders.reduce((s, o) => s + (o.total || 0), 0);
  const avgTicket        = deliveredOrders.length > 0 ? Math.round(totalRevenue / deliveredOrders.length) : 0;
  const cancelRate       = dashOrders.length > 0 ? Math.round((cancelledOrders.length / dashOrders.length) * 100) : 0;

  const filteredOrders = orderFilter === 'todos'
    ? orders
    : orders.filter(o => {
        if (orderFilter === 'pendientes') return ['pending', 'confirmed'].includes(o.status);
        if (orderFilter === 'camino')     return o.status === 'in_transit';
        if (orderFilter === 'entregados') return o.status === 'delivered';
        if (orderFilter === 'cancelados') return o.status === 'cancelled';
        return true;
      });

  // ── Gráfico de ingresos por día (calculado desde pedidos reales) ─────────────
  const incomeByDay: Record<string, number> = {};
  deliveredOrders.forEach(o => {
    if (!o.createdAt) return;
    const key = new Date(o.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    incomeByDay[key] = (incomeByDay[key] || 0) + o.total;
  });
  const incomeData = Object.entries(incomeByDay).map(([name, value]) => ({ name, value })).slice(-7);

  const orderStatusChart = [
    { name: 'ENTREGADO',  value: deliveredOrders.length,  color: '#10b981' },
    { name: 'PENDIENTE',  value: pendingOrders.length,     color: '#f59e0b' },
    { name: 'CANCELADO',  value: cancelledOrders.length,   color: '#ef4444' },
  ].filter(d => d.value > 0);

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#0a1118] flex text-white font-sans">

      {/* ── Sidebar ── */}
      <aside className="w-72 bg-[#111a24] border-r border-white/5 flex flex-col sticky top-0 h-screen">
        <div 
          onClick={() => onBack?.()} 
          className="p-10 flex items-center gap-4 hover:opacity-80 transition-opacity cursor-pointer"
        >
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-emerald-500/20">DGO</div>
          <span className="font-black text-xl tracking-tighter text-white">DISTRI_DGO</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          <SidebarItem id="inicio"    icon={LayoutDashboard} label="Inicio" />
          <SidebarItem id="pedidos"   icon={ShoppingBag}     label="Pedidos" />
          <SidebarItem id="productos" icon={Package}         label="Productos" />
          <SidebarItem id="medios"    icon={ImageIcon}       label="Medios" />
          <SidebarItem id="bulk"      image="/icono1.png"    label="Carga Masiva" />
          <SidebarItem id="cupones"   icon={Ticket}          label="Cupones" />
          <SidebarItem id="puntos"    icon={Trophy}          label="Puntos" />
          <SidebarItem id="niveles"   icon={Star}            label="Niveles" />
          <SidebarItem id="analitica" icon={BarChart3}       label="Analítica" />
          <SidebarItem id="categorias"icon={Grid}            label="Categorías" />
          <SidebarItem id="ajustes"   icon={Settings}        label="Ajustes" />
        </nav>

        <div className="p-8 border-t border-white/5">
          <button onClick={logout} className="w-full flex items-center gap-4 px-4 py-3 text-gray-500 hover:text-red-500 transition-all">
            <LogOut className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto p-12">
        <header className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
              {activeTab === 'inicio' ? 'Panel de Control' : activeTab.toUpperCase()}
            </h1>
            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-1">Admin / {activeTab}</p>
          </div>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => onBack?.()}
              className="group flex items-center gap-2 bg-white/5 px-6 py-3 rounded-2xl border border-white/5 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all"
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-all">
                <LayoutDashboard className="w-4 h-4 text-emerald-500" />
              </div>
              <span className="text-[10px] font-black text-gray-400 group-hover:text-emerald-500 uppercase tracking-widest">Volver a la Tienda</span>
            </button>

            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input type="text" placeholder="BUSCAR..." className="bg-[#111a24] border border-white/5 rounded-2xl pl-12 pr-6 py-3 text-[10px] font-bold text-gray-400 w-64 focus:ring-2 focus:ring-emerald-500 transition-all" />
            </div>
            <div className="flex items-center gap-2 bg-[#111a24] px-4 py-2 rounded-full border border-white/5">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sistema Online</span>
            </div>
          </div>
        </header>

        {/* ══════════ INICIO / DASHBOARD ══════════ */}
        {activeTab === 'inicio' && (
          <div className="space-y-12">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-emerald-500 italic uppercase tracking-tighter">Dashboard</h2>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Métricas reales de pedidos</p>
              </div>
              <button onClick={loadOrders} className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl text-gray-400 hover:text-white transition-colors text-[10px] font-black uppercase tracking-widest">
                <RefreshCw className="w-3 h-3" /> Actualizar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {[
                { label: 'Ingresos Totales', value: `$${totalRevenue.toLocaleString()}`, sub: `${deliveredOrders.length} entregados`, icon: DollarSign, color: 'emerald' },
                { label: 'Ticket Promedio',  value: `$${avgTicket.toLocaleString()}`,    sub: `${deliveredOrders.length} ventas`,    icon: BarChart3, color: 'blue' },
                { label: 'En Camino',        value: String(pendingOrders.length),        sub: 'pedidos activos',                     icon: Truck,    color: 'emerald' },
                { label: 'Tasa Cancelación', value: `${cancelRate}%`,                   sub: `${cancelledOrders.length} cancelados`, icon: XCircle,  color: 'red' },
              ].map((s, i) => (
                <div key={i} className="bg-[#111a24] p-8 rounded-[32px] border border-white/5 relative overflow-hidden group hover:border-white/10 transition-all">
                  <div className={`w-12 h-12 rounded-2xl bg-${s.color}-500/10 flex items-center justify-center mb-6`}>
                    <s.icon className={`w-6 h-6 text-${s.color}-500`} />
                  </div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">{s.label}</p>
                  <h3 className="text-3xl font-black text-white mb-2 tracking-tighter">{s.value}</h3>
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full bg-${s.color}-500`} />
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{s.sub}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-[#111a24] p-10 rounded-[40px] border border-white/5">
                <h3 className="text-xl font-black text-emerald-500 italic uppercase tracking-tighter mb-8">Evolución de Ingresos</h3>
                {incomeData.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={incomeData}>
                        <defs>
                          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: '#64748b' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: '#64748b' }} dx={-10} />
                        <Tooltip contentStyle={{ backgroundColor: '#111a24', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }} itemStyle={{ fontSize: '12px', fontWeight: 900, color: '#fff' }} />
                        <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorValue)" dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#111a24' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-600 font-black uppercase text-[10px] tracking-widest italic">
                    Sin pedidos entregados aún
                  </div>
                )}
              </div>

              <div className="bg-[#111a24] p-10 rounded-[40px] border border-white/5 flex flex-col">
                <h3 className="text-xl font-black text-emerald-500 italic uppercase tracking-tighter mb-8">Estado de Pedidos</h3>
                {orderStatusChart.length > 0 ? (
                  <>
                    <div className="flex-1 flex items-center justify-center relative">
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={orderStatusChart} innerRadius={60} outerRadius={80} paddingAngle={10} dataKey="value" stroke="none">
                            {orderStatusChart.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                        <span className="text-2xl font-black text-white">{orders.length}</span>
                        <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Total</span>
                      </div>
                    </div>
                    <div className="space-y-4 mt-4">
                      {orderStatusChart.map(d => (
                        <div key={d.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{d.name}</span>
                          </div>
                          <span className="text-xs font-black text-white">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-600 font-black uppercase text-[10px] tracking-widest italic">
                    Sin pedidos registrados
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════ PEDIDOS ══════════ */}
        {activeTab === 'pedidos' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-emerald-500 italic uppercase tracking-tighter">Gestión de Pedidos</h2>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">{orders.length} pedidos totales</p>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => {
                    const data = filteredOrders.map(o => ({
                      'ID Pedido': o.id?.substring(0, 8).toUpperCase(),
                      'Fecha': formatDate(o.createdAt || ''),
                      'Cliente': o.customerName,
                      'Teléfono': o.customerPhone,
                      'Dirección': o.customerAddress,
                      'Email': o.customerEmail || '-',
                      'Total': o.total,
                      'Estado': STATUS_MAP[o.status]?.label || o.status,
                      'Método Pago': o.paymentMethod,
                      'Productos': o.items.map(i => `${i.name} (x${i.quantity})`).join(', ')
                    }));
                    const ws = XLSX.utils.json_to_sheet(data);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Pedidos DGO");
                    XLSX.writeFile(wb, `Pedidos_DGO_${new Date().toISOString().split('T')[0]}.xlsx`);
                  }}
                  className="flex items-center gap-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-6 py-4 rounded-2xl font-black hover:bg-emerald-500 hover:text-white transition-all uppercase tracking-widest text-[10px]"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
                </button>
                <button onClick={loadOrders} className="p-3 bg-white/5 rounded-xl text-gray-400 hover:text-white transition-colors"><RefreshCw className="w-4 h-4" /></button>
                <div className="flex bg-[#111a24] p-1 rounded-2xl border border-white/5">
                  {[['todos', 'Todos'], ['pendientes', 'Pendientes'], ['camino', 'En camino'], ['entregados', 'Entregados'], ['cancelados', 'Cancelados']].map(([f, l]) => (
                    <button key={f} onClick={() => setOrderFilter(f)} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${orderFilter === f ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-gray-500 hover:text-gray-300'}`}>{l}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-[#111a24] rounded-[40px] border border-white/5 overflow-hidden">
              {loadingOrders ? (
                <div className="flex items-center justify-center py-20 gap-3 text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Cargando pedidos...</span>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="py-20 text-center text-gray-600 font-black uppercase text-[10px] tracking-widest italic">
                  No hay pedidos {orderFilter !== 'todos' ? `con estado "${orderFilter}"` : ''}
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/5">
                      {['ID Pedido', 'Cliente', 'Fecha', 'Total', 'Estado', 'Acciones'].map(h => (
                        <th key={h} className="px-8 py-6 text-[10px] font-black text-gray-500 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredOrders.map(order => {
                      const st = STATUS_MAP[order.status] || STATUS_MAP.pending;
                      const isExpanded = expandedOrder === order.id;
                      return (
                        <React.Fragment key={order.id}>
                          <tr className="hover:bg-white/5 transition-all group cursor-pointer" onClick={() => setExpandedOrder(isExpanded ? null : order.id!)}>
                            <td className="px-8 py-5 text-xs font-black text-emerald-500">
                              <div className="flex items-center gap-2">
                                <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                #{(order.id || '').substring(0, 8).toUpperCase()}
                              </div>
                            </td>
                            <td className="px-8 py-5">
                              <p className="text-sm font-black text-white">{order.customerName}</p>
                              <p className="text-[10px] font-bold text-gray-500 uppercase">{order.customerPhone}</p>
                            </td>
                            <td className="px-8 py-5 text-xs font-black text-gray-500 uppercase tracking-widest">
                              {order.createdAt ? formatDate(order.createdAt) : '—'}
                            </td>
                            <td className="px-8 py-5 text-sm font-black text-white">${order.total?.toLocaleString()}</td>
                            <td className="px-8 py-5">
                              <span className="px-3 py-1 text-[10px] font-black rounded-full uppercase tracking-widest"
                                style={{ color: st.color, backgroundColor: st.bg }}>
                                {st.label}
                              </span>
                            </td>
                            <td className="px-8 py-5" onClick={e => e.stopPropagation()}>
                              <select
                                value={order.status}
                                onChange={async (e) => {
                                  await dbService.updateOrderStatus(order.id!, e.target.value as Order['status']);
                                  await loadOrders();
                                }}
                                className="bg-[#0a1118] border border-white/10 rounded-xl px-3 py-2 text-[10px] font-black text-gray-300 outline-none hover:border-emerald-500/50 transition-colors"
                              >
                                <option value="pending">Pendiente</option>
                                <option value="confirmed">Confirmado</option>
                                <option value="in_transit">En camino</option>
                                <option value="delivered">Entregado</option>
                                <option value="cancelled">Cancelado</option>
                              </select>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-emerald-500/5 border-l-2 border-l-emerald-500">
                              <td colSpan={6} className="px-12 py-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                  <div className="space-y-6">
                                    <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Detalle del Pedido</h4>
                                    <div className="space-y-4">
                                      {order.items.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between border-b border-white/5 pb-2">
                                          <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-[#0a1118] overflow-hidden border border-white/5">
                                              <img src={item.image} className="w-full h-full object-cover opacity-70" alt={item.name} />
                                            </div>
                                            <div>
                                              <p className="text-[11px] font-black text-white uppercase">{item.name}</p>
                                              <p className="text-[9px] text-gray-500 font-bold">CANTIDAD: {item.quantity}</p>
                                            </div>
                                          </div>
                                          <span className="text-xs font-black text-white">${(item.price * item.quantity).toLocaleString()}</span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="pt-4 flex justify-between items-end">
                                      <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                                        Subtotal: ${order.subtotal?.toLocaleString()}<br/>
                                        Descuento: -${order.discount?.toLocaleString()}
                                      </div>
                                      <div className="text-right">
                                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Total</p>
                                        <p className="text-xl font-black text-white tracking-tighter">${order.total?.toLocaleString()}</p>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="space-y-6">
                                    <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Datos de Envío</h4>
                                    <div className="bg-[#0a1118] p-6 rounded-[24px] space-y-4 border border-white/5">
                                      <div>
                                        <p className="text-[8px] font-black text-gray-600 uppercase mb-1">Dirección</p>
                                        <p className="text-xs font-black text-gray-300 uppercase leading-relaxed">{order.customerAddress}</p>
                                      </div>
                                      <div>
                                        <p className="text-[8px] font-black text-gray-600 uppercase mb-1">Notas / DNI</p>
                                        <p className="text-xs font-bold text-gray-400 italic">{order.customerNote || 'Sin notas adicionales'}</p>
                                      </div>
                                      <div>
                                        <p className="text-[8px] font-black text-gray-600 uppercase mb-1">Método de Pago</p>
                                        <p className="text-xs font-black text-emerald-500 uppercase">{order.paymentMethod}</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ══════════ PRODUCTOS ══════════ */}
        {activeTab === 'productos' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-emerald-500 italic uppercase tracking-tighter">Catálogo de Productos</h2>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">{products.length} productos en Firestore</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={loadProducts} className="p-3 bg-white/5 rounded-xl text-gray-400 hover:text-white transition-colors"><RefreshCw className="w-4 h-4" /></button>
                <button
                  onClick={() => { setEditingProduct({ name: '', price: 0, category: '', categoryId: '', image: '', description: '', stock: 0 }); setProductModal(true); }}
                  className="flex items-center gap-2 bg-emerald-500 text-white px-8 py-4 rounded-2xl font-black hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-500/20 uppercase tracking-widest text-xs"
                >
                  <Plus className="w-4 h-4" /> Nuevo Producto
                </button>
              </div>
            </div>

            <div className="bg-[#111a24] rounded-[40px] border border-white/5 overflow-hidden">
              {loadingProducts ? (
                <div className="flex items-center justify-center py-20 gap-3 text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Cargando productos...</span>
                </div>
              ) : products.length === 0 ? (
                <div className="py-20 text-center text-gray-600 font-black uppercase text-[10px] tracking-widest italic">
                  No hay productos. Hacé click en "Nuevo Producto" para agregar.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/5">
                      {['Producto', 'Categoría', 'Precio', 'Stock', 'Acciones'].map(h => (
                        <th key={h} className="px-8 py-6 text-[10px] font-black text-gray-500 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {products.map(p => (
                      <tr key={p.id} className="hover:bg-white/5 transition-all group">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-4">
                            <div className="relative">
                              <div className="w-12 h-12 bg-[#0a1118] rounded-xl overflow-hidden border border-white/5 flex-shrink-0">
                                {p.image ? <img src={p.image} alt={p.name} className="w-full h-full object-cover opacity-80" /> : <Package className="w-6 h-6 text-gray-700 m-3" />}
                              </div>
                              {p.isOffer && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center border-2 border-[#0a1118]">
                                  <DollarSign className="w-2 h-2 text-white" />
                                </div>
                              )}
                              {p.featured && (
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center border-2 border-[#0a1118]">
                                  <Star className="w-2 h-2 text-white fill-current" />
                                </div>
                              )}
                            </div>
                            <div>
                                <p className="text-sm font-black text-white">{p.name}</p>
                                <p className="text-[10px] font-bold text-gray-500 uppercase">{p.sku || 'SIN SKU'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-widest">{p.category}</td>
                        <td className="px-8 py-5">
                          <div className="flex flex-col">
                            <span className="text-sm font-black text-emerald-500">${p.price?.toLocaleString()}</span>
                            {p.isOffer && p.originalPrice && (
                              <span className="text-[9px] text-gray-600 line-through font-bold">${p.originalPrice.toLocaleString()}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-8 py-5 text-xs font-black text-white">{p.stock ?? '—'}</td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => { setEditingProduct({ ...p }); setProductModal(true); }} className="p-2 text-gray-500 hover:text-emerald-500 transition-all"><Edit3 className="w-4 h-4" /></button>
                            <button onClick={() => handleDeleteProduct(p)} className="p-2 text-gray-500 hover:text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

                {/* ══════════ CUPONES ══════════ */}
        {activeTab === 'cupones' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-emerald-500 italic uppercase tracking-tighter">Cupones de Descuento</h2>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">{coupons.length} cupones creados</p>
              </div>
              <button onClick={() => setCouponModal(true)} className="flex items-center gap-2 bg-emerald-500 text-white px-8 py-4 rounded-2xl font-black hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-500/20 uppercase tracking-widest text-xs">
                <Plus className="w-4 h-4" /> Nuevo Cupón
              </button>
            </div>

            {coupons.length === 0 ? (
              <div className="bg-[#111a24] rounded-[40px] border border-white/5 py-20 text-center text-gray-600 font-black uppercase text-[10px] tracking-widest italic">
                No hay cupones. Creá el primero.
              </div>
            ) : (
              <div className="bg-[#111a24] rounded-[40px] border border-white/5 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/5">
                      {['Código', 'Tipo', 'Valor', 'Usos', 'Nivel req.', 'Estado', 'Acciones'].map(h => (
                        <th key={h} className="px-8 py-6 text-[10px] font-black text-gray-500 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {coupons.map(c => (
                      <tr key={c.id} className="hover:bg-white/5 transition-all group">
                        <td className="px-8 py-5 text-sm font-black text-emerald-400 font-mono">{c.code}</td>
                        <td className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          {c.discountType === 'percent' ? 'Porcentaje' : 'Fijo'}
                        </td>
                        <td className="px-8 py-5 text-sm font-black text-white">
                          {c.discountType === 'percent' ? `${c.discountValue}%` : `$${c.discountValue.toLocaleString()}`}
                        </td>
                        <td className="px-8 py-5 text-[10px] font-black text-gray-400">
                          {c.usedCount} / {c.maxUses === 0 ? '∞' : c.maxUses}
                        </td>
                        <td className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase">
                          {c.levelRequired || '—'}
                        </td>
                        <td className="px-8 py-5">
                          <button
                            onClick={async () => { await toggleCoupon(c.id!, !c.active); await loadCoupons(); }}
                            className={`px-3 py-1 text-[10px] font-black rounded-full uppercase tracking-widest cursor-pointer ${c.active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-gray-500/10 text-gray-500'}`}
                          >
                            {c.active ? 'Activo' : 'Inactivo'}
                          </button>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => showConfirm('¿Eliminar cupón?', `¿Eliminar el cupón "${c.code}"?`, async () => { await deleteCoupon(c.id!); await loadCoupons(); })} className="p-2 text-gray-500 hover:text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════ PUNTOS ══════════ */}
        {activeTab === 'puntos' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-emerald-500 italic uppercase tracking-tighter">Sistema de Puntos</h2>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">{pendingPoints.length} aprobaciones pendientes</p>
              </div>
              <button onClick={loadPendingPoints} className="p-3 bg-white/5 rounded-xl text-gray-400 hover:text-white transition-colors"><RefreshCw className="w-4 h-4" /></button>
            </div>

            {pendingPoints.length === 0 ? (
              <div className="bg-[#111a24] rounded-[40px] border border-white/5 py-20 text-center">
                <Trophy className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                <p className="text-gray-600 font-black uppercase text-[10px] tracking-widest italic">No hay puntos pendientes de aprobación</p>
              </div>
            ) : (
              <div className="bg-[#111a24] rounded-[40px] border border-white/5 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/5">
                      {['Usuario', 'Puntos', 'Concepto', 'Pedido', 'Acciones'].map(h => (
                        <th key={h} className="px-8 py-6 text-[10px] font-black text-gray-500 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {pendingPoints.map(tx => (
                      <tr key={tx.id} className="hover:bg-white/5 transition-all">
                        <td className="px-8 py-5 text-xs font-black text-gray-400">{tx.userId.substring(0, 12)}…</td>
                        <td className="px-8 py-5">
                          <span className="text-lg font-black text-emerald-400">+{tx.points}</span>
                          <span className="text-[10px] text-gray-600 ml-1 uppercase">pts</span>
                        </td>
                        <td className="px-8 py-5 text-[11px] font-bold text-gray-300">{tx.description}</td>
                        <td className="px-8 py-5 text-[10px] font-black text-gray-500 font-mono">{tx.reference?.substring(0, 8) || '—'}</td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => showConfirm('¿Aprobar puntos?', `Acreditarás ${tx.points} puntos al usuario.`, async () => { await approvePoints(tx.id!, user.uid); await loadPendingPoints(); })}
                              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-colors"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Aprobar
                            </button>
                            <button
                              onClick={() => showConfirm('¿Rechazar?', 'La transacción se marcará como procesada sin acreditar los puntos.', async () => { await updateDoc(doc(db, DB_PATHS.POINT_TRANSACTIONS, tx.id!), { approved: true }); await loadPendingPoints(); })}
                              className="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" /> Rechazar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════ NIVELES ══════════ */}
        {activeTab === 'niveles' && (
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-black text-emerald-500 italic uppercase tracking-tighter">Niveles de Fidelidad</h2>
              <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Configurá umbrales y beneficios por nivel</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {levelConfigs.map((lv) => (
                <div key={lv.id} className="bg-[#111a24] p-8 rounded-[32px] border border-white/5 hover:border-white/10 transition-all">
                  <div className="flex items-center gap-4 mb-6">
                    <span className="text-3xl">{lv.emoji}</span>
                    <div>
                      <h3 className="text-lg font-black text-white uppercase tracking-widest">{lv.label}</h3>
                      <div className="w-20 h-1 rounded-full mt-1" style={{ backgroundColor: lv.color }} />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Puntos mínimos</label>
                      <input
                        type="number"
                        value={lv.minPoints}
                        onChange={e => setLevelConfigs(prev => prev.map(l => l.id === lv.id ? { ...l, minPoints: parseInt(e.target.value) || 0 } : l))}
                        className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black text-white outline-none focus:border-emerald-500/50 transition-colors"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Descuento automático (%)</label>
                      <input
                        type="number"
                        value={lv.discountPercent}
                        onChange={e => setLevelConfigs(prev => prev.map(l => l.id === lv.id ? { ...l, discountPercent: parseInt(e.target.value) || 0 } : l))}
                        className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black text-white outline-none focus:border-emerald-500/50 transition-colors"
                      />
                    </div>
                    <button
                      onClick={async () => { await updateLevelConfig(lv); showAlert('Guardado', `Nivel ${lv.label} actualizado.`); }}
                      className="w-full py-3 bg-emerald-500/10 text-emerald-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-2"
                    >
                      <Save className="w-3.5 h-3.5" /> Guardar nivel
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {levelConfigs.length === 0 && (
              <div className="text-center py-20 text-gray-600 font-black uppercase text-[10px] tracking-widest italic">
                Cargando configuración de niveles...
              </div>
            )}
          </div>
        )}

        {/* ══════════ ANALÍTICA ══════════ */}
        {activeTab === 'analitica' && (
          <AnalyticsView />
        )}

        {/* ══════════ CATEGORÍAS ══════════ */}
        {activeTab === 'categorias' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-emerald-500 italic uppercase tracking-tighter">Categorías</h2>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Organizá tu catálogo</p>
              </div>
              <button onClick={async () => {
                await addDoc(collection(db, 'categories'), { name: 'NUEVA CATEGORÍA', image: '', span: 'md:col-span-1', order: categories.length });
              }} className="flex items-center gap-2 bg-emerald-500 text-white px-8 py-4 rounded-2xl font-black hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-500/20 uppercase tracking-widest text-xs">
                <Plus className="w-4 h-4" /> Nueva Categoría
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {categories.map((cat) => (
                <div key={cat.id} className="bg-[#111a24] p-8 rounded-[40px] border border-white/5 group hover:border-white/10 transition-all">
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                      <Grid className="w-6 h-6 text-emerald-500" />
                    </div>
                    <button onClick={() => {
                      showConfirm('¿Eliminar Categoría?', `¿Eliminar "${cat.name}"?`, async () => { await deleteDoc(doc(db, 'categories', cat.id)); });
                    }} className="p-2 text-gray-600 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    type="text" value={cat.name}
                    onChange={async (e) => await setDoc(doc(db, 'categories', cat.id), { ...cat, name: e.target.value })}
                    className="w-full bg-transparent border-none focus:ring-0 text-lg font-black text-white uppercase tracking-tighter p-0 mb-4"
                  />
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <ImageUploader
                        folder="categorias"
                        currentUrl={cat.image || ''}
                        label="IMAGEN DE LA CATEGORÍA"
                        compact={true}
                        allowUrl={false}
                        onUploaded={async (url) => {
                          await setDoc(doc(db, 'categories', cat.id), { ...cat, image: url });
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-gray-500 uppercase tracking-widest ml-1">Peso Visual (Bento)</label>
                      <select value={cat.span} onChange={async (e) => await setDoc(doc(db, 'categories', cat.id), { ...cat, span: e.target.value })} className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-2 text-[10px] font-bold text-gray-400 outline-none">
                        <option value="md:col-span-1">Pequeño (1×1)</option>
                        <option value="md:col-span-2">Ancho (2×1)</option>
                        <option value="md:col-span-2 md:row-span-2">Grande (2×2)</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════ CARGA MASIVA ══════════ */}
        {activeTab === 'bulk' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter leading-none mb-2">Carga Masiva</h2>
                <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.2em]">Gestión de Base de Datos vía Excel</p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => bulkService.generateTemplate(categories)}
                  className="group flex items-center gap-3 bg-white/5 border border-white/10 px-6 py-4 rounded-2xl hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all"
                >
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center group-hover:bg-emerald-500/20 transition-all">
                    <Download className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div className="text-left">
                    <span className="block text-white font-black text-[10px] uppercase tracking-widest leading-none">Descargar</span>
                    <span className="text-gray-500 text-[9px] font-bold uppercase tracking-tighter">Plantilla Oficial</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Dropzone Column */}
              <div className="md:col-span-1 space-y-6">
                <div 
                  className={`
                    relative group border-2 border-dashed rounded-[40px] p-10 flex flex-col items-center justify-center text-center transition-all duration-500 min-h-[400px]
                    ${isDragging ? 'border-emerald-500 bg-emerald-500/5 scale-[0.98]' : 'border-white/10 bg-[#111a24] hover:border-white/20'}
                  `}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file) {
                      setBulkFile(file);
                      setBulkStatus('validating');
                      try {
                        const products = await bulkService.parseAndValidate(file, categories);
                        setPreviewData(products);
                        setBulkStatus('preview');
                      } catch (err: any) {
                        setBulkStatus('idle');
                        showAlert('Error de Validación', err.message);
                      }
                    }
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-[40px]" />
                  <div className={`
                    w-24 h-24 rounded-3xl flex items-center justify-center mb-8 transition-all duration-500 overflow-hidden
                    ${isDragging ? 'bg-emerald-500 scale-110 p-4' : 'bg-white/5 group-hover:scale-110'}
                  `}>
                    {isDragging ? (
                      <FileSpreadsheet className="w-12 h-12 text-white" />
                    ) : (
                      <img src="/icono1.png" alt="Bulk Icon" className="w-20 h-20 object-contain drop-shadow-2xl" />
                    )}
                  </div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-2">Soltá tu archivo Excel</h3>
                  <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest max-w-[200px] leading-relaxed mb-8">
                    Soportamos archivos .xlsx y .xls con el formato de plantilla
                  </p>
                  
                  <input 
                    type="file" 
                    id="bulk-upload" 
                    className="hidden" 
                    accept=".xlsx,.xls"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setBulkFile(file);
                        setBulkStatus('validating');
                        try {
                          const products = await bulkService.parseAndValidate(file, categories);
                          setPreviewData(products);
                          setBulkStatus('preview');
                        } catch (err: any) {
                          setBulkStatus('idle');
                          showAlert('Error de Validación', err.message);
                        }
                      }
                    }}
                  />
                  <label 
                    htmlFor="bulk-upload"
                    className="cursor-pointer px-8 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 hover:bg-white/10 hover:text-white transition-all relative z-10"
                  >
                    Seleccionar Archivo
                  </label>
                </div>

                {bulkStatus === 'preview' && (
                  <div className="bg-[#111a24] p-8 rounded-[40px] border border-emerald-500/20 animate-in zoom-in-95 duration-500">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                      </div>
                      <div>
                        <h4 className="text-white font-black uppercase tracking-tighter">Resumen de Carga</h4>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Listo para procesar</p>
                      </div>
                    </div>
                    
                    <div className="space-y-4 mb-10">
                      <div className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/5">
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Total Productos</span>
                        <span className="text-xl font-black text-white">{previewData.length}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                          <span className="block text-[8px] font-black text-emerald-500/60 uppercase tracking-widest mb-1">Nuevos</span>
                          <span className="text-xl font-black text-emerald-500">{previewData.filter(p => !products.find(op => op.sku === p.sku)).length}</span>
                        </div>
                        <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10">
                          <span className="block text-[8px] font-black text-blue-500/60 uppercase tracking-widest mb-1">Updates</span>
                          <span className="text-xl font-black text-blue-500">{previewData.filter(p => products.find(op => op.sku === p.sku)).length}</span>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={async () => {
                        setBulkStatus('uploading');
                        try {
                          await bulkService.executeBulk(previewData, categories, (msg) => console.log(msg));
                          setBulkStatus('idle');
                          setPreviewData([]);
                          setBulkFile(null);
                          loadProducts();
                          showAlert('¡Éxito!', 'Los productos han sido cargados correctamente.');
                        } catch (err: any) {
                          setBulkStatus('preview');
                          showAlert('Error', err.message);
                        }
                      }}
                      disabled={bulkStatus === 'uploading'}
                      className="w-full py-5 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                      {bulkStatus === 'uploading' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          Procesando Base de Datos...
                        </>
                      ) : 'Confirmar y Subir'}
                    </button>
                    
                    <button 
                      onClick={() => { setBulkFile(null); setPreviewData([]); setBulkStatus('idle'); }}
                      className="w-full mt-4 py-3 text-gray-500 hover:text-white font-black text-[10px] uppercase tracking-widest transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>

              {/* Preview Column */}
              <div className="md:col-span-2">
                <div className="bg-[#111a24] rounded-[40px] border border-white/5 overflow-hidden h-full flex flex-col min-h-[600px]">
                  <div className="p-10 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                    <div>
                      <h3 className="text-lg font-black text-white uppercase tracking-tighter">Pre-visualización de Datos</h3>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest italic">Solo se muestran los primeros 100 registros</p>
                    </div>
                    <div className="px-4 py-2 bg-white/5 rounded-full border border-white/5">
                      <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Validación: OK</span>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-auto">
                    {previewData.length > 0 ? (
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-white/5 border-b border-white/5">
                            {['SKU', 'Nombre', 'Precio Unit.', 'Precio May.', 'Min. May', 'Unidad'].map(h => (
                              <th key={h} className="px-10 py-6 text-[10px] font-black text-gray-500 uppercase tracking-widest">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {previewData.slice(0, 100).map((p, i) => (
                            <tr key={i} className="hover:bg-white/5 transition-all group">
                              <td className="px-10 py-5 text-[10px] font-black text-emerald-500 font-mono tracking-tighter">{p.sku}</td>
                              <td className="px-10 py-5">
                                <span className="text-[11px] font-black text-white uppercase block leading-tight">{p.name}</span>
                                <span className="text-[9px] text-gray-600 font-bold tracking-tighter uppercase">{p.description?.substring(0, 30)}...</span>
                              </td>
                              <td className="px-10 py-5">
                                <span className="inline-flex items-center px-2.5 py-1 bg-white/5 rounded-lg border border-white/5 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                  {p.category}
                                </span>
                              </td>
                              <td className="px-10 py-5">
                                <span className="text-xs font-black text-white italic">${p.price?.toLocaleString()}</span>
                              </td>
                              <td className="px-10 py-5">
                                <span className="text-xs font-black text-emerald-500 italic">${p.wholesalePrice?.toLocaleString()}</span>
                              </td>
                              <td className="px-10 py-5 text-[10px] font-bold text-gray-400">
                                {p.wholesaleMinQuantity} {p.unitType === 'dozen' ? 'doc' : 'un'}
                              </td>
                              <td className="px-10 py-5">
                                <span className="inline-flex items-center px-2.5 py-1 bg-white/5 rounded-lg border border-white/5 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                  {p.unitType === 'dozen' ? 'Docena' : 'Unidad'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center p-20 opacity-20 grayscale">
                        <Search className="w-16 h-16 text-gray-700 mb-8" />
                        <p className="text-gray-600 font-black uppercase text-xs tracking-widest italic">No hay datos cargados para previsualizar</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ GESTOR DE MEDIOS ══════════ */}
        {activeTab === 'medios' && (
          <div className="space-y-8 max-w-7xl mx-auto">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter leading-none mb-2">Gestor de Medios Masivo</h2>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest italic">Subí todas tus imágenes y obtené un Excel con las URLs para carga masiva</p>
              </div>
              <div className="flex gap-4">
                {mediosMapping.length > 0 && (
                  <>
                    <button 
                      onClick={() => setMediosMapping([])}
                      className="px-8 py-4 bg-red-500/10 text-red-500 rounded-3xl font-black uppercase text-[10px] tracking-widest border border-red-500/10 hover:bg-red-500/20 transition-all"
                    >
                      Limpiar Todo
                    </button>
                    <button 
                      onClick={() => bulkService.exportMappingToExcel(mediosMapping.map(m => ({ filename: m.filename, url: m.url })))}
                      className="px-8 py-4 bg-emerald-500 text-[#0a0f16] rounded-3xl font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-all flex items-center gap-2 shadow-2xl shadow-emerald-500/20"
                    >
                      <Download className="w-4 h-4" /> Exportar Mapeo Excel
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Dropzone */}
              <div className="lg:col-span-1">
                <div 
                  className={`relative group bg-[#111a24] border-2 border-dashed rounded-[40px] p-12 flex flex-col items-center justify-center transition-all min-h-[400px] overflow-hidden ${
                    isDragging ? 'border-emerald-500 bg-emerald-500/5 shadow-[0_0_50px_rgba(16,185,129,0.1)]' : 'border-white/5 hover:border-white/10'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const allFiles = Array.from<File>(e.dataTransfer.files);
                    const files = allFiles.filter(f => f.type.startsWith('image/'));
                    if (files.length === 0) return;
                    
                    setUploadingMedios(true);
                    try {
                      const result = await bulkService.uploadMultipleImages(files);
                      setMediosMapping(prev => [...prev, ...result]);
                      setModal({
                        show: true,
                        title: 'Subida Exitosa',
                        message: `Se han procesado ${result.length} imágenes correctamente.`,
                        type: 'alert'
                      });
                    } catch (error) {
                      setModal({
                        show: true,
                        title: 'Error',
                        message: 'Hubo un problema al subir las imágenes.',
                        type: 'alert'
                      });
                    } finally {
                      setUploadingMedios(false);
                    }
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0a0f16]/50 pointer-events-none" />
                  
                  {uploadingMedios ? (
                    <div className="text-center relative z-10">
                      <div className="w-20 h-20 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                      <p className="text-white font-black uppercase text-xs tracking-widest animate-pulse italic">Subiendo a la nube...</p>
                    </div>
                  ) : (
                    <>
                      <div className="w-24 h-24 bg-white/5 rounded-[30px] flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500 border border-white/5 group-hover:rotate-6">
                        <Upload className="w-10 h-10 text-emerald-500" />
                      </div>
                      <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-2 italic">Soltá tus imágenes acá</h3>
                      <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest text-center px-8 leading-relaxed">Podes soltar múltiples archivos a la vez. <br/> El sistema generará el mapeo automáticamente.</p>
                      
                      <input 
                        type="file" 
                        multiple 
                        accept="image/*"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={async (e) => {
                          const files: File[] = e.target.files ? Array.from(e.target.files) : [];
                          if (files.length === 0) return;
                          setUploadingMedios(true);
                          try {
                            const result = await bulkService.uploadMultipleImages(files);
                            setMediosMapping(prev => [...prev, ...result]);
                          } finally {
                            setUploadingMedios(false);
                          }
                        }}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Table Result */}
              <div className="lg:col-span-2">
                <div className="bg-[#111a24] rounded-[40px] border border-white/5 overflow-hidden h-full flex flex-col min-h-[600px]">
                  <div className="p-10 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                    <div>
                      <h3 className="text-lg font-black text-white uppercase tracking-tighter">Imágenes Procesadas</h3>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest italic">Total: {mediosMapping.length} elementos</p>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-auto">
                    {mediosMapping.length > 0 ? (
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-white/5 border-b border-white/5">
                            <th className="px-10 py-6 text-[10px] font-black text-gray-500 uppercase tracking-widest">Preview</th>
                            <th className="px-10 py-6 text-[10px] font-black text-gray-500 uppercase tracking-widest">Archivo</th>
                            <th className="px-10 py-6 text-[10px] font-black text-gray-500 uppercase tracking-widest">URL Cloudinary</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {mediosMapping.map((m, i) => (
                            <tr key={i} className="hover:bg-white/5 transition-all group">
                              <td className="px-10 py-5">
                                <div className="w-14 h-14 rounded-2xl overflow-hidden border border-white/5 bg-black/50 aspect-square">
                                  <img src={m.preview} alt="prev" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                </div>
                              </td>
                              <td className="px-10 py-5">
                                <span className="text-[11px] font-black text-white uppercase block leading-tight">{m.filename}</span>
                                <span className="text-[9px] text-gray-600 font-bold tracking-tighter uppercase italic">Imagen lista para mapear</span>
                              </td>
                              <td className="px-10 py-5">
                                <div className="flex items-center gap-3">
                                  <code className="px-3 py-2 bg-black/40 rounded-xl text-[9px] text-emerald-500 font-mono border border-emerald-500/10 truncate max-w-[250px]">
                                    {m.url || 'SUBIENDO...'}
                                  </code>
                                  {m.url && (
                                    <button 
                                      onClick={() => {
                                        navigator.clipboard.writeText(m.url);
                                        showAlert('Copiado', 'URL copiada al portapapeles');
                                      }}
                                      className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-colors"
                                    >
                                      <FileSpreadsheet className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center p-20 opacity-20 grayscale">
                        <ImageIcon className="w-16 h-16 text-gray-700 mb-8" />
                        <p className="text-gray-600 font-black uppercase text-xs tracking-widest italic text-center">Todavía no subiste ninguna imagen.<br/>Arrástrenlas aquí para comenzar.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* ══════════ AJUSTES ══════════ */}
        {activeTab === 'ajustes' && (
          <div className="space-y-12">
            {!config ? (
              <div className="bg-[#111a24] p-12 rounded-[40px] border border-white/5 text-center flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-20 h-20 bg-orange-500/10 rounded-3xl flex items-center justify-center mb-8">
                  <Bell className="w-10 h-10 text-orange-500" />
                </div>
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Base de Datos Vacía</h2>
                <p className="text-gray-500 text-sm max-w-md mb-10 font-medium">No se detectó ninguna configuración en Firebase. Inicializá el sistema con los valores por defecto.</p>
                {SHOW_DEBUG_TOOLS && (
                  <button onClick={populateDatabase} disabled={populating} className="flex items-center gap-4 bg-orange-500 text-white px-10 py-5 rounded-2xl font-black hover:bg-orange-600 disabled:opacity-50 transition-all shadow-2xl shadow-orange-500/20 uppercase tracking-widest text-sm">
                    <Plus className="w-5 h-5" /> {populating ? 'Inicializando...' : 'Inicializar Base de Datos'}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-black text-emerald-500 italic uppercase tracking-tighter">Configuración Visual</h2>
                    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Personalizá el branding y contenido del CMS</p>
                  </div>
                  <div className="flex gap-4">
                    {SHOW_DEBUG_TOOLS && (
                      <button onClick={populateDatabase} disabled={populating} className="flex items-center gap-2 bg-orange-500/10 text-orange-500 px-6 py-4 rounded-2xl font-black hover:bg-orange-500/20 disabled:opacity-50 transition-all border border-orange-500/20 uppercase tracking-widest text-[10px]">
                        <Bell className="w-4 h-4" /> {populating ? 'Poblando...' : 'Poblar DB (Default)'}
                      </button>
                    )}
                    <button onClick={saveConfig} disabled={saving} className="flex items-center gap-2 bg-emerald-500 text-white px-8 py-4 rounded-2xl font-black hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-xl shadow-emerald-500/20 uppercase tracking-widest text-xs">
                      <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Navbar */}
                  <div className="bg-[#111a24] p-10 rounded-[40px] border border-white/5">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-lg font-black text-white uppercase tracking-widest">Navbar</h3>
                      <button onClick={() => setConfig({...config, nav: [...config.nav, {label: 'NUEVO', path: '#', visible: true}]})} className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500/20 transition-all"><Plus className="w-4 h-4" /></button>
                    </div>
                    <div className="space-y-4">
                      {config.nav.map((n: any, i: number) => (
                        <div key={i} className="flex items-center gap-4 bg-[#0a1118] p-4 rounded-2xl border border-white/5 group">
                          <GripVertical className="w-4 h-4 text-gray-700" />
                          <div className="flex-1 grid grid-cols-2 gap-4">
                            <input type="text" value={n.label} onChange={e => { const nav = [...config.nav]; nav[i].label = e.target.value; setConfig({...config, nav}); }} className="bg-transparent border-none focus:ring-0 text-[10px] font-black uppercase tracking-widest text-white" placeholder="Etiqueta" />
                            <input type="text" value={n.path} onChange={e => { const nav = [...config.nav]; nav[i].path = e.target.value; setConfig({...config, nav}); }} className="bg-transparent border-none focus:ring-0 text-[10px] font-bold text-gray-500" placeholder="Ruta" />
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => { const nav = [...config.nav]; nav[i].visible = !nav[i].visible; setConfig({...config, nav}); }} className={`p-2 rounded-lg ${n.visible ? 'text-emerald-500' : 'text-gray-700'}`}>
                              {n.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                            <button onClick={() => { const nav = config.nav.filter((_: any, idx: number) => idx !== i); setConfig({...config, nav}); }} className="p-2 text-gray-700 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Branding */}
                  <div className="bg-[#111a24] p-10 rounded-[40px] border border-white/5">
                    <h3 className="text-lg font-black text-white uppercase tracking-widest mb-8">Branding</h3>
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Color Primario</label>
                          <div className="flex gap-2">
                            <input type="color" value={config.theme.primaryColor} onChange={e => setConfig({...config, theme: {...config.theme, primaryColor: e.target.value}})} className="w-10 h-10 rounded-xl border-none cursor-pointer bg-transparent" />
                            <input type="text"  value={config.theme.primaryColor} onChange={e => setConfig({...config, theme: {...config.theme, primaryColor: e.target.value}})} className="bg-[#0a1118] border border-white/5 rounded-xl px-4 text-[10px] font-black flex-1 text-white" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Color Secundario</label>
                          <div className="flex gap-2">
                            <input type="color" value={config.theme.secondaryColor} onChange={e => setConfig({...config, theme: {...config.theme, secondaryColor: e.target.value}})} className="w-10 h-10 rounded-xl border-none cursor-pointer bg-transparent" />
                            <input type="text"  value={config.theme.secondaryColor} onChange={e => setConfig({...config, theme: {...config.theme, secondaryColor: e.target.value}})} className="bg-[#0a1118] border border-white/5 rounded-xl px-4 text-[10px] font-black flex-1 text-white" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Border Radius</label>
                          <input type="text" value={config.theme.borderRadius} onChange={e => setConfig({...config, theme: {...config.theme, borderRadius: e.target.value}})} className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black text-white" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Estética de Categorías */}
                  <div className="bg-[#111a24] p-10 rounded-[40px] border border-white/5">
                    <h3 className="text-lg font-black text-white uppercase tracking-widest mb-8">Diseño de Categorías</h3>
                    <div className="flex items-center justify-between p-6 bg-[#0a1118] rounded-2xl border border-white/5">
                      <div>
                        <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1">Selector de Layout</p>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Bento vs Masonry</p>
                      </div>
                      <div className="flex bg-[#111a24] p-1 rounded-xl border border-white/5">
                        <button 
                          onClick={() => setConfig({...config, layoutStyle: 'bento'})}
                          className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${config.layoutStyle === 'bento' || !config.layoutStyle ? 'bg-emerald-500 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                        >
                          Bento
                        </button>
                        <button 
                          onClick={() => setConfig({...config, layoutStyle: 'masonry'})}
                          className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${config.layoutStyle === 'masonry' ? 'bg-emerald-500 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                        >
                          Masonry
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Hero */}
                  <div className="md:col-span-2 bg-[#111a24] p-10 rounded-[40px] border border-white/5">
                    <h3 className="text-lg font-black text-white uppercase tracking-widest mb-8">Hero Section</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Título Principal</label>
                          <textarea value={config.hero.title} onChange={e => setConfig({...config, hero: {...config.hero, title: e.target.value}})} className="w-full bg-[#0a1118] border border-white/5 rounded-2xl px-6 py-4 text-xs font-bold min-h-[100px] text-white" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Subtítulo</label>
                          <input type="text" value={config.hero.subtitle} onChange={e => setConfig({...config, hero: {...config.hero, subtitle: e.target.value}})} className="w-full bg-[#0a1118] border border-white/5 rounded-2xl px-6 py-4 text-xs font-bold text-white" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Texto Botón</label>
                            <input type="text" value={config.hero.buttonText} onChange={e => setConfig({...config, hero: {...config.hero, buttonText: e.target.value}})} className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black text-white" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Overlay Color</label>
                            <input type="text" value={config.hero.overlayColor} onChange={e => setConfig({...config, hero: {...config.hero, overlayColor: e.target.value}})} className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black text-white" placeholder="rgba(0,0,0,0.6)" />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-6">
                        <ImageUploader
                          folder="hero"
                          currentUrl={config.hero.bgImage}
                          label="Hero Background"
                          compact={false}
                          allowUrl={true}
                          onUploaded={(url) => setConfig({...config, hero: {...config.hero, bgImage: url}})}
                        />
                        <ImageUploader
                          folder="logos"
                          currentUrl={config.hero.logoImage}
                          label="Logo Image"
                          compact={true}
                          allowUrl={true}
                          onUploaded={(url) => setConfig({...config, hero: {...config.hero, logoImage: url}})}
                        />
                        <div className="flex items-center justify-between p-6 bg-[#0a1118] rounded-2xl border border-white/5">
                          <span className="text-[10px] font-black text-white uppercase tracking-widest">Efecto Parallax</span>
                          <button onClick={() => setConfig({...config, hero: {...config.hero, parallax: !config.hero.parallax}})} className={`w-12 h-6 rounded-full transition-all relative ${config.hero.parallax ? 'bg-emerald-500' : 'bg-gray-800'}`}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${config.hero.parallax ? 'left-7' : 'left-1'}`} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="md:col-span-2 bg-[#111a24] p-10 rounded-[40px] border border-white/5">
                    <h3 className="text-lg font-black text-white uppercase tracking-widest mb-8">Footer Section</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Descripción Empresa</label>
                          <textarea value={config.footer.description} onChange={e => setConfig({...config, footer: {...config.footer, description: e.target.value}})} className="w-full bg-[#0a1118] border border-white/5 rounded-2xl px-6 py-4 text-xs font-bold min-h-[120px] text-white" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Instagram URL</label>
                            <input type="text" value={config.footer.social.instagram} onChange={e => setConfig({...config, footer: {...config.footer, social: {...config.footer.social, instagram: e.target.value}}})} className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black text-white" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Facebook URL</label>
                            <input type="text" value={config.footer.social.facebook} onChange={e => setConfig({...config, footer: {...config.footer, social: {...config.footer.social, facebook: e.target.value}}})} className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black text-white" />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Teléfono</label>
                          <input type="text" value={config.footer.phone} onChange={e => setConfig({...config, footer: {...config.footer, phone: e.target.value}})} className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black text-white" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Email</label>
                          <input type="text" value={config.footer.email} onChange={e => setConfig({...config, footer: {...config.footer, email: e.target.value}})} className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black text-white" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Dirección</label>
                          <input type="text" value={config.footer.address} onChange={e => setConfig({...config, footer: {...config.footer, address: e.target.value}})} className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black text-white" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* ── Modal genérico ── */}
      {modal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#111a24] border border-white/10 rounded-[32px] p-8 shadow-2xl">
            <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-4">{modal.title}</h3>
            <p className="text-gray-400 text-sm font-medium mb-8 leading-relaxed">{modal.message}</p>
            <div className="flex gap-4">
              {modal.type === 'confirm' && (
                <button onClick={() => setModal({ ...modal, show: false })} className="flex-1 px-6 py-4 rounded-2xl bg-white/5 text-gray-400 font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all">Cancelar</button>
              )}
              <button onClick={() => { if (modal.onConfirm) modal.onConfirm(); setModal({ ...modal, show: false }); }} className="flex-1 px-6 py-4 rounded-2xl bg-emerald-500 text-white font-black uppercase tracking-widest text-[10px] hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20">
                {modal.type === 'confirm' ? 'Confirmar' : 'Entendido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Producto ── */}
      {productModal && editingProduct !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#111a24] border border-white/10 rounded-[32px] p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">{editingProduct.id ? 'Editar Producto' : 'Nuevo Producto'}</h3>
              <button onClick={() => { setProductModal(false); setEditingProduct(null); }} className="p-2 text-gray-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-5">
              {/* Nombre */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Nombre</label>
                <input
                  type="text"
                  value={editingProduct.name || ''}
                  onChange={e => setEditingProduct(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ej: Plato Playo Porcelana"
                  className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-sm font-medium text-white outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>

              {/* SKU */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">SKU (Identificador Único para Carga Masiva)</label>
                <input
                  type="text"
                  value={editingProduct.sku || ''}
                  onChange={e => setEditingProduct(prev => ({ ...prev, sku: e.target.value.toUpperCase() }))}
                  placeholder="Ej: PROD-001"
                  className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-sm font-black text-emerald-500 outline-none focus:border-emerald-500/50 transition-colors tracking-widest"
                />
              </div>

              {/* Upload de imagenes (hasta 5) */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Imágenes (Opcional, máx 5)</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {(editingProduct.images || (editingProduct.image && !editingProduct.image.includes('logo') ? [editingProduct.image] : [])).map((imgUrl, idx) => (
                    <div key={idx} className="relative aspect-square bg-[#0a1118] rounded-xl overflow-hidden border border-white/5 group">
                      <img src={imgUrl} alt={`Img ${idx}`} className="w-full h-full object-cover opacity-80" />
                      <button 
                        onClick={() => {
                          const currentImgs = editingProduct.images || (editingProduct.image && !editingProduct.image.includes('logo') ? [editingProduct.image] : []);
                          const newImgs = currentImgs.filter((_, i) => i !== idx);
                          setEditingProduct(prev => ({ 
                            ...prev, 
                            images: newImgs,
                            image: newImgs.length > 0 ? newImgs[0] : ''
                          }));
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-red-500/80 text-white rounded-lg hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100 shadow-lg"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {((editingProduct.images || (editingProduct.image && !editingProduct.image.includes('logo') ? [editingProduct.image] : [])).length < 5) && (
                    <div className="aspect-square">
                      <ImageUploader
                        folder="productos"
                        currentUrl=""
                        label=""
                        compact={true}
                        allowUrl={false}
                        onUploaded={(url) => {
                          const currentImgs = (editingProduct.images || (editingProduct.image && !editingProduct.image.includes('logo') ? [editingProduct.image] : []));
                          const newImgs = [...currentImgs, url];
                          setEditingProduct(prev => ({ 
                            ...prev, 
                            images: newImgs,
                            image: newImgs[0]
                          }));
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Precios y Venta */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Precio Unitario</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-black text-xs">$</span>
                    <input
                      type="number"
                      value={editingProduct.price || ''}
                      onChange={e => setEditingProduct(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
                      className="w-full bg-[#0a1118] border border-white/5 rounded-xl pl-8 pr-4 py-3 text-sm font-black text-white outline-none focus:border-emerald-500/50 transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Precio Mayorista</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500/50 font-black text-xs">$</span>
                    <input
                      type="number"
                      value={editingProduct.wholesalePrice || ''}
                      onChange={e => setEditingProduct(prev => ({ ...prev, wholesalePrice: parseFloat(e.target.value) }))}
                      className="w-full bg-[#0a1118] border border-white/5 rounded-xl pl-8 pr-4 py-3 text-sm font-black text-emerald-500 outline-none focus:border-emerald-500/50 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Min. Mayorista (Cant.)</label>
                  <input
                    type="number"
                    value={editingProduct.wholesaleMinQuantity || ''}
                    onChange={e => setEditingProduct(prev => ({ ...prev, wholesaleMinQuantity: parseInt(e.target.value) }))}
                    placeholder="Ej: 12"
                    className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-sm font-medium text-white outline-none focus:border-emerald-500/50 transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Min. Compra (Arranque)</label>
                  <input
                    type="number"
                    value={editingProduct.minPurchaseQuantity || 1}
                    onChange={e => setEditingProduct(prev => ({ ...prev, minPurchaseQuantity: parseInt(e.target.value) || 1 }))}
                    className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-sm font-black text-white outline-none focus:border-emerald-500/50 transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Paso Incremento (+)</label>
                  <input
                    type="number"
                    value={editingProduct.purchaseStep || 1}
                    onChange={e => setEditingProduct(prev => ({ ...prev, purchaseStep: parseInt(e.target.value) || 1 }))}
                    className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-sm font-black text-emerald-500 outline-none focus:border-emerald-500/50 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Se vende por</label>
                  <select
                    value={editingProduct.unitType || 'unit'}
                    onChange={e => {
                      const val = e.target.value;
                      let min = editingProduct.minPurchaseQuantity || 1;
                      if (val === 'dozen') min = 12;
                      if (val === 'pack10') min = 10;
                      if (val === 'pack6') min = 6;
                      setEditingProduct(prev => ({ ...prev, unitType: val as any, minPurchaseQuantity: min }));
                    }}
                    className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-sm font-medium text-white outline-none focus:border-emerald-500/50 transition-colors"
                  >
                    <option value="unit">Unidad</option>
                    <option value="dozen">Docena (12)</option>
                    <option value="pack10">Pack x10</option>
                    <option value="pack6">Pack x6</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Stock Disponible</label>
                  <input
                    type="number"
                    value={editingProduct.stock || 0}
                    onChange={e => setEditingProduct(prev => ({ ...prev, stock: parseInt(e.target.value) }))}
                    className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-sm font-medium text-white outline-none focus:border-emerald-500/50 transition-colors"
                  />
                </div>
              </div>

              {/* Categoría */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Categoría</label>
                <div className="relative">
                  <select
                    value={editingProduct.categoryId || ''}
                    onChange={e => {
                      const selectedCat = categories.find(c => c.id === e.target.value);
                      setEditingProduct(prev => ({ 
                        ...prev, 
                        categoryId: e.target.value,
                        category: selectedCat ? selectedCat.name : ''
                      }));
                    }}
                    className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-sm font-medium text-white outline-none focus:border-emerald-500/50 transition-colors appearance-none"
                  >
                    <option value="" disabled>Seleccionar categoría</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-gray-500">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Ajustes Comerciales */}
              <div className="bg-white/5 p-6 rounded-[24px] border border-white/5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-white uppercase tracking-widest">Oferta Especial</p>
                    <p className="text-[9px] text-gray-500 font-bold uppercase">Muestra precio anterior tachado</p>
                  </div>
                  <button 
                    onClick={() => setEditingProduct(p => ({ ...p, isOffer: !p?.isOffer }))}
                    className={`w-12 h-6 rounded-full transition-all relative ${editingProduct.isOffer ? 'bg-emerald-500' : 'bg-gray-700'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${editingProduct.isOffer ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
                
                {editingProduct.isOffer && (
                  <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest ml-1">Precio Original ($)</label>
                    <input 
                      type="number" 
                      value={editingProduct.originalPrice || 0} 
                      onChange={e => setEditingProduct(prev => ({ ...prev, originalPrice: parseFloat(e.target.value) || 0 }))} 
                      className="w-full bg-[#0a1118] border border-emerald-500/20 rounded-xl px-4 py-3 text-sm font-medium text-white outline-none focus:border-emerald-500/50 transition-colors" 
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <div>
                    <p className="text-[10px] font-black text-white uppercase tracking-widest">Producto Destacado</p>
                    <p className="text-[9px] text-gray-500 font-bold uppercase">Aparece en carruseles y filtros relevantes</p>
                  </div>
                  <button 
                    onClick={() => setEditingProduct(p => ({ ...p, featured: !p?.featured }))}
                    className={`w-12 h-6 rounded-full transition-all relative ${editingProduct.featured ? 'bg-amber-500' : 'bg-gray-700'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${editingProduct.featured ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Descripción</label>
                <textarea value={editingProduct.description || ''} onChange={e => setEditingProduct(prev => ({ ...prev, description: e.target.value }))} rows={3} className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-sm font-medium text-white outline-none focus:border-emerald-500/50 transition-colors resize-none" />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => { setProductModal(false); setEditingProduct(null); }} className="flex-1 py-4 rounded-2xl bg-white/5 text-gray-400 font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all">Cancelar</button>
              <button onClick={handleSaveProduct} disabled={savingProduct || !editingProduct.name} className="flex-1 py-4 rounded-2xl bg-emerald-500 text-white font-black uppercase tracking-widest text-[10px] hover:bg-emerald-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {savingProduct ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><Save className="w-4 h-4" /> Guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Cupón ── */}
      {couponModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#111a24] border border-white/10 rounded-[32px] p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Nuevo Cupón</h3>
              <button onClick={() => setCouponModal(false)} className="p-2 text-gray-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Código</label>
                <input
                  type="text"
                  value={newCoupon.code}
                  onChange={e => setNewCoupon(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                  placeholder="DESCUENTO20"
                  className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-sm font-black text-white uppercase outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Tipo</label>
                  <select value={newCoupon.discountType} onChange={e => setNewCoupon(p => ({ ...p, discountType: e.target.value as 'percent' | 'fixed' }))} className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black text-white outline-none">
                    <option value="percent">Porcentaje (%)</option>
                    <option value="fixed">Fijo ($)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Valor</label>
                  <input type="number" value={newCoupon.discountValue} onChange={e => setNewCoupon(p => ({ ...p, discountValue: parseFloat(e.target.value) || 0 }))} className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-sm font-black text-white outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Compra mín. ($)</label>
                  <input type="number" value={newCoupon.minPurchase} onChange={e => setNewCoupon(p => ({ ...p, minPurchase: parseFloat(e.target.value) || 0 }))} className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-sm font-black text-white outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Usos máximos (0=∞)</label>
                  <input type="number" value={newCoupon.maxUses} onChange={e => setNewCoupon(p => ({ ...p, maxUses: parseInt(e.target.value) || 0 }))} className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-sm font-black text-white outline-none" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Nivel requerido (opcional)</label>
                <select value={newCoupon.levelRequired || ''} onChange={e => setNewCoupon(p => ({ ...p, levelRequired: e.target.value || null }))} className="w-full bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black text-white outline-none">
                  <option value="">Sin requisito de nivel</option>
                  <option value="plata">Plata</option>
                  <option value="oro">Oro</option>
                  <option value="diamante">Diamante</option>
                </select>
              </div>
            </div>
            <div className="flex gap-4 mt-6">
              <button onClick={() => setCouponModal(false)} className="flex-1 py-4 rounded-2xl bg-white/5 text-gray-400 font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all">Cancelar</button>
              <button onClick={handleSaveCoupon} disabled={savingCoupon || !newCoupon.code} className="flex-1 py-4 rounded-2xl bg-emerald-500 text-white font-black uppercase tracking-widest text-[10px] hover:bg-emerald-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {savingCoupon ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando...</> : <><Plus className="w-4 h-4" /> Crear Cupón</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
