import React, { useState, useEffect } from 'react';

import { motion } from 'motion/react';
import { collection, query, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db, DB_PATHS } from '../../firebase';
import { PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { TrendingUp, Users, Clock, Search, XCircle, ShoppingCart, Trash2, DollarSign, Eye } from 'lucide-react';

const ANALYTICS_PATH = DB_PATHS.ANALYTICS;

interface AnalyticsData {
  totalVisits: number;
  uniqueVisitors: number;
  registeredVisits: number;
  anonymousVisits: number;
  deviceBreakdown: { name: string; value: number; color: string }[];
  pageViews: { page: string; count: number }[];
  topProducts: { name: string; clicks: number; views: number }[];
  topSearches: { query: string; count: number }[];
  funnelData: { step: string; count: number; color: string }[];
  dailyVisits: { day: string; visits: number; unique: number }[];
  avgTimeOnPage: number;
  cartAbandonRate: number;
  mostAddedToCart: { name: string; count: number }[];
  mostRemovedFromCart: { name: string; count: number }[];
  mostPurchased: { name: string; count: number }[];
  topAbandonedProducts: { name: string; count: number }[];
  referrers: { source: string; count: number; percentage: number }[];
  revenueBySource: { source: string; revenue: number; percentage: number }[];
  estimatedRevenue: number;
  averageOrderValue: number;
  conversionRate: number;
  returningRate: number;
  locations: { city: string; count: number }[];
  hourlyActivity: { hour: string; count: number }[];
}

interface Category {
  id: string;
  name: string;
  slug?: string;
}

export default function AnalyticsView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('week');
  const [activeTab, setActiveTab] = useState<'ventas' | 'audiencia' | 'comportamiento'>('ventas');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [categories, setCategories] = useState<Category[]>([]);
  const [allEvents, setAllEvents] = useState<any[]>([]);

  useEffect(() => {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(2020, 0, 1);
    }
 
    const unsubCats = onSnapshot(collection(db, DB_PATHS.CATEGORIES), (snapshot) => {
      setCategories(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    });

    const q = query(
      collection(db, ANALYTICS_PATH),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const events = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((e: any) => {
          if (!e.timestamp) return false;
          const eventDate = e.timestamp instanceof Timestamp ? e.timestamp.toDate() : new Date(e.timestamp);
          return eventDate >= startDate;
        });

      setAllEvents(events);
      setLoading(false);
      setLastUpdate(new Date());
    }, (err) => {
      console.error('Error en tiempo real:', err);
      setLoading(false);
    });

    return () => { unsubscribe(); unsubCats(); };
  }, [period]);

  useEffect(() => {
    if (allEvents.length > 0) {
      processData(allEvents);
    }
  }, [allEvents, categories]);

  const processData = (events: any[]) => {
    const totalVisits = events.filter((e: any) => e.type?.toLowerCase() === 'page_view').length;
    const uniqueVisitorIds = new Set(events.map((e: any) => e.userId).filter(Boolean));
    const uniqueVisitors = uniqueVisitorIds.size;
    const registeredVisitorIds = new Set(events.filter((e: any) => e.userId && !e.userId.startsWith('anon_')).map(e => e.userId));
    const registeredVisits = registeredVisitorIds.size;
    const anonymousVisits = events.filter((e: any) => e.userId?.startsWith('anon_')).length;

    // Gente Real por Dispositivo (Únicos)
    const deviceUsers: Record<string, Set<string>> = {};
    events.forEach((e: any) => {
      if (e.device && e.userId) {
        if (!deviceUsers[e.device]) deviceUsers[e.device] = new Set();
        deviceUsers[e.device].add(e.userId);
      }
    });
    const deviceBreakdown = Object.entries(deviceUsers).map(([name, userSet]) => ({
      name: name === 'mobile' ? 'Celular' : name === 'desktop' ? 'PC' : 'Tablet',
      value: userSet.size,
      color: name === 'mobile' ? '#00ADEE' : name === 'desktop' ? '#0072BC' : '#7BF1FA'
    }));

    const pageCounts: Record<string, number> = {};
    events.filter((e: any) => e.type?.toLowerCase() === 'page_view').forEach((e: any) => {
      pageCounts[e.page] = (pageCounts[e.page] || 0) + 1;
    });
    const pageViews = Object.entries(pageCounts)
      .map(([page, count]) => {
        let pageLabel = page === '/' ? 'Inicio' : page.replace('/', '').charAt(0).toUpperCase() + page.replace('/', '').slice(1);
        
        // Mapeo inteligente de categorías
        if (page.includes('categoria/')) {
          const catIdOrSlug = page.split('categoria/')[1];
          const cat = categories.find(c => c.id === catIdOrSlug || c.slug === catIdOrSlug);
          if (cat) pageLabel = `Cat: ${cat.name}`;
        }
        
        return { page: pageLabel, count };
      })
      .sort((a, b) => b.count - a.count);

    const productClicks: Record<string, { clicks: number; views: number; name: string }> = {};
    events.forEach((e: any) => {
      const type = e.type?.toLowerCase();
      if (e.productId && (type === 'product_click' || type === 'product_view' || type === 'view_product')) {
        if (!productClicks[e.productId]) productClicks[e.productId] = { clicks: 0, views: 0, name: e.productName || e.productId };
        if (type === 'product_click') productClicks[e.productId].clicks++;
        if (type === 'product_view' || type === 'view_product') productClicks[e.productId].views++;
      }
    });
    const topProducts = Object.values(productClicks)
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10)
      .map(p => ({ name: p.name.split(' ').slice(0, 3).join(' '), clicks: p.clicks, views: p.views }));

    const searchCounts: Record<string, number> = {};
    allEvents.filter((e: any) => e.type?.toLowerCase() === 'search_query' || e.type?.toLowerCase() === 'search').forEach((e: any) => {
      if (e.query) searchCounts[e.query.toLowerCase()] = (searchCounts[e.query.toLowerCase()] || 0) + 1;
    });
    const topSearches = Object.entries(searchCounts)
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const addToCartCount = allEvents.filter((e: any) => e.type?.toLowerCase() === 'add_to_cart').length;
    const beginCheckoutCount = allEvents.filter((e: any) => e.type?.toLowerCase() === 'begin_checkout' || e.type?.toLowerCase() === 'initiate_checkout').length;
    const purchaseEvents = allEvents.filter((e: any) => e.type?.toLowerCase() === 'checkout_complete' || e.type?.toLowerCase() === 'purchase');
    const purchaseCount = purchaseEvents.length;
    const estimatedRevenue = purchaseEvents.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);
    const averageOrderValue = purchaseCount > 0 ? Math.round(estimatedRevenue / purchaseCount) : 0;

    const funnelData = [
      { step: 'Visitas', count: totalVisits, color: '#00ADEE' },
      { step: 'Productos', count: Object.keys(productClicks).length, color: '#0072BC' },
      { step: 'Carrito', count: addToCartCount, color: '#7BF1FA' },
      { step: 'Checkout', count: beginCheckoutCount, color: '#FFB800' },
      { step: 'Compra', count: purchaseCount, color: '#10B981' }
    ].filter(d => d.count > 0);

    const dailyMap: Record<string, { visits: number; unique: Set<string> }> = {};
    allEvents.filter((e: any) => e.type?.toLowerCase() === 'page_view').forEach((e: any) => {
      const date = e.timestamp instanceof Timestamp ? e.timestamp.toDate() : new Date(e.timestamp);
      const dayKey = date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
      if (!dailyMap[dayKey]) dailyMap[dayKey] = { visits: 0, unique: new Set() };
      dailyMap[dayKey].visits++;
      dailyMap[dayKey].unique.add(e.userId);
    });
    const dailyVisits = Object.entries(dailyMap)
      .map(([day, data]) => ({ day, visits: data.visits, unique: data.unique.size }))
      .slice(-14);

    const cartAbandonRate = addToCartCount > 0 ? Math.round(((addToCartCount - purchaseCount) / addToCartCount) * 100) : 0;

    const timeEvents = allEvents.filter((e: any) => e.type === 'time_on_page' && e.seconds);
    const avgTimeOnPage = timeEvents.length > 0
      ? Math.round(timeEvents.reduce((sum: number, e: any) => sum + e.seconds, 0) / timeEvents.length)
      : 0;

    // Productos abandonados (Agregados - Comprados)
    const abandonedMap: Record<string, number> = {};
    allEvents.filter((e: any) => e.type === 'add_to_cart' && e.productName).forEach((e: any) => {
      abandonedMap[e.productName] = (abandonedMap[e.productName] || 0) + 1;
    });
    purchaseEvents.forEach((e: any) => {
      if (e.productName) {
        if (abandonedMap[e.productName]) abandonedMap[e.productName]--;
      }
    });

    const topAbandonedProducts = Object.entries(abandonedMap)
      .map(([name, count]) => ({ name: name.split(' ').slice(0, 4).join(' '), count }))
      .filter(p => p.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const addToCartCounts: Record<string, number> = {};
    allEvents.filter((e: any) => e.type === 'add_to_cart' && e.productName).forEach((e: any) => {
      addToCartCounts[e.productName] = (addToCartCounts[e.productName] || 0) + 1;
    });
    const mostAddedToCart = Object.entries(addToCartCounts)
      .map(([name, count]) => ({ name: name.split(' ').slice(0, 4).join(' '), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const removeFromCartCounts: Record<string, number> = {};
    allEvents.filter((e: any) => e.type === 'remove_from_cart' && e.productName).forEach((e: any) => {
      removeFromCartCounts[e.productName] = (removeFromCartCounts[e.productName] || 0) + 1;
    });
    const mostRemovedFromCart = Object.entries(removeFromCartCounts)
      .map(([name, count]) => ({ name: name.split(' ').slice(0, 4).join(' '), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const purchaseProducts: Record<string, number> = {};
    allEvents.filter((e: any) => (e.type === 'checkout_complete' || e.type === 'purchase') && (e.productName || e.items)).forEach((e: any) => {
      if (e.productName) {
        purchaseProducts[e.productName] = (purchaseProducts[e.productName] || 0) + 1;
      }
    });
    const mostPurchased = Object.entries(purchaseProducts)
      .map(([name, count]) => ({ name: name.split(' ').slice(0, 4).join(' '), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const referrerCounts: Record<string, number> = {};
    const revenueBySourceMap: Record<string, number> = {};

    allEvents.forEach((e: any) => {
      let source = 'Directo';
      if (e.referrer && e.referrer !== 'direct') {
        try {
          const url = new URL(e.referrer);
          const host = url.hostname.toLowerCase();
          if (host.includes('facebook') || host.includes('fb.')) source = 'Facebook';
          else if (host.includes('instagram')) source = 'Instagram';
          else if (host.includes('google')) source = 'Google';
          else if (host.includes('tiktok')) source = 'TikTok';
          else if (host.includes('twitter') || host.includes('x.com')) source = 'Twitter/X';
          else if (host.includes('whatsapp')) source = 'WhatsApp';
          else if (host.includes('linkedin')) source = 'LinkedIn';
          else source = host.replace('www.', '');
        } catch {
          source = 'Directo';
        }
      }

      if (e.type === 'page_view') {
        referrerCounts[source] = (referrerCounts[source] || 0) + 1;
      }

      const isPurchase = e.type?.toLowerCase() === 'checkout_complete' || e.type?.toLowerCase() === 'purchase';
      if (isPurchase && e.total) {
        revenueBySourceMap[source] = (revenueBySourceMap[source] || 0) + (Number(e.total) || 0);
      }
    });

    const totalRefs = Object.values(referrerCounts).reduce((sum, c) => sum + c, 0);
    const referrers = Object.entries(referrerCounts)
      .map(([source, count]) => ({
        source,
        count,
        percentage: totalRefs > 0 ? Math.round((count / totalRefs) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const totalRevenue = Object.values(revenueBySourceMap).reduce((sum, r) => sum + r, 0);
    const revenueBySource = Object.entries(revenueBySourceMap)
      .map(([source, revenue]) => ({
        source,
        revenue,
        percentage: totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 100) : 0
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Gente Real por Ubicación (Únicos) - Clave para publicidad
    const locationUsers: Record<string, Set<string>> = {};
    allEvents.forEach((e: any) => {
      if (e.location?.city && e.userId) {
        const key = `${e.location.city}, ${e.location.region || ''}`;
        if (!locationUsers[key]) locationUsers[key] = new Set();
        locationUsers[key].add(e.userId);
      }
    });
    const locations = Object.entries(locationUsers)
      .map(([city, userSet]) => ({ city, count: userSet.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const hourlyCounts: Record<string, number> = {};
    for (let i = 0; i < 24; i++) hourlyCounts[i.toString().padStart(2, '0')] = 0;
    
    allEvents.forEach((e: any) => {
      const date = e.timestamp instanceof Timestamp ? e.timestamp.toDate() : new Date(e.timestamp);
      const hour = date.getHours().toString().padStart(2, '0');
      hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1;
    });
    const hourlyActivity = Object.entries(hourlyCounts).map(([hour, count]) => ({ hour: `${hour}h`, count }));

    const conversionRate = uniqueVisitors > 0 ? Number(((purchaseCount / uniqueVisitors) * 100).toFixed(2)) : 0;
    
    // Tasa de retorno: Usuarios con más de 1 visita
    const userVisitCounts: Record<string, number> = {};
    allEvents.filter(e => e.type === 'page_view' && e.userId).forEach(e => {
      userVisitCounts[e.userId] = (userVisitCounts[e.userId] || 0) + 1;
    });
    const returningUsersCount = Object.values(userVisitCounts).filter(count => count > 1).length;
    const returningRate = uniqueVisitors > 0 ? Math.round((returningUsersCount / uniqueVisitors) * 100) : 0;

    setData({
      totalVisits, uniqueVisitors, registeredVisits, anonymousVisits,
      deviceBreakdown, pageViews, topProducts, topSearches, funnelData,
      dailyVisits, avgTimeOnPage, cartAbandonRate,
      mostAddedToCart, mostRemovedFromCart, mostPurchased, topAbandonedProducts,
      referrers, revenueBySource, estimatedRevenue, averageOrderValue,
      conversionRate, returningRate, locations, hourlyActivity
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40">
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 rounded-full border-4 border-white/5 border-t-[#00ADEE] shadow-[0_0_20px_rgba(0,173,238,0.3)]" 
        />
        <p className="mt-6 text-[10px] font-black uppercase tracking-[0.5em] text-gray-500 animate-pulse">Sincronizando Big Data...</p>
      </div>
    );
  }

  if (!data || (data.totalVisits === 0 && data.funnelData.length === 0)) {
    return (
      <div className="text-center py-32 bg-white/5 backdrop-blur-xl rounded-[3rem] border border-white/10 mx-4">
        <div className="w-20 h-20 bg-gray-900/50 rounded-full flex items-center justify-center mx-auto mb-8 border border-white/5">
          <TrendingUp size={32} className="text-gray-700" />
        </div>
        <p className="text-2xl font-black uppercase tracking-tighter text-gray-400 mb-3 italic">ESTRADAS VACÍAS</p>
        <p className="text-[10px] text-gray-600 font-black uppercase tracking-[0.3em] max-w-xs mx-auto leading-relaxed">
          El motor de analítica está listo. Los datos aparecerán automáticamente con el tráfico real.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20 px-4">
      {/* Header Fusion */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-[#0072BC] to-[#00ADEE] rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(0,173,238,0.4)]">
              <TrendingUp size={24} className="text-white" />
            </div>
            <div>
              <h3 className="text-4xl font-black italic uppercase tracking-tighter text-white leading-none">COMMAND<span className="text-[#00ADEE]">CENTER</span></h3>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-green-500/80">Inteligencia de Datos Pro</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-black/40 backdrop-blur-md p-1.5 rounded-2xl border border-white/5 shadow-2xl">
            {([['ventas', 'Comercial'], ['audiencia', 'Audiencia'], ['comportamiento', 'Conducta']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-500 ${activeTab === key ? 'bg-white/10 text-[#00ADEE] border border-white/10 shadow-[inner_0_0_20px_rgba(255,255,255,0.05)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 bg-black/40 backdrop-blur-md p-1.5 rounded-2xl border border-white/5 shadow-2xl">
          {([['today', 'Hoy'], ['week', '7D'], ['month', '30D'], ['all', 'Total']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setLoading(true); setPeriod(key); }}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${period === key ? 'bg-[#00ADEE] text-white shadow-[0_10px_20px_rgba(0,173,238,0.3)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-10"
      >
        {activeTab === 'ventas' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              <KPICard title="INGRESOS VENTAS" value={`$${data.estimatedRevenue.toLocaleString()}`} icon={<DollarSign size={18} />} color="#10B981" subtitle={`Vía ${data.funnelData.find(v => v.step === 'Compra')?.count || 0} pedidos`} />
              <KPICard title="TICKET PROM (AOV)" value={`$${data.averageOrderValue.toLocaleString()}`} icon={<ShoppingCart size={18} />} color="#8B5CF6" subtitle="Valor promedio pedido" />
              <KPICard title="TASA CONVERSIÓN" value={`${data.conversionRate}%`} icon={<TrendingUp size={18} />} color="#00ADEE" subtitle="Compras vs Visitantes" />
              <KPICard title="SALTO DE CARRITO" value={`${data.cartAbandonRate}%`} icon={<XCircle size={18} />} color={data.cartAbandonRate > 70 ? '#EF4444' : '#10B981'} subtitle="Sin finalizar compra" />
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              {/* Funnel Visualizer */}
              <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-2xl relative overflow-hidden h-full">
                <div className="absolute top-0 right-0 w-80 h-80 bg-[#00ADEE]/5 blur-[100px] rounded-full -mr-40 -mt-40" />
                <h4 className="font-black italic uppercase text-xs tracking-[0.2em] text-[#00ADEE] mb-10">EMBUDO TRANSACCIONAL</h4>
                <div className="flex flex-col gap-6 relative z-10">
                  {data.funnelData.map((step, i) => {
                    const nextStep = data.funnelData[i+1];
                    const conversion = nextStep ? Math.round((nextStep.count / step.count) * 100) : null;
                    return (
                      <div key={i} className="flex items-center gap-6">
                        <div className="flex-1 bg-white/5 px-6 py-4 rounded-2xl border border-white/5 flex items-center justify-between group hover:border-white/20 transition-all">
                          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{step.step}</span>
                          <span className="text-xl font-black italic text-white">{step.count}</span>
                        </div>
                        {conversion !== null && (
                          <div className="flex flex-col items-center">
                            <div className="w-px h-6 bg-gradient-to-b from-[#00ADEE] to-transparent opacity-30" />
                            <div className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                              <span className="text-[8px] font-black text-green-500">{conversion}%</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Revenue by Source Chart */}
              <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-2xl relative overflow-hidden">
                <h4 className="font-black italic uppercase text-xs tracking-[0.2em] text-[#10B981] mb-8">RENTABILIDAD POR ORIGEN</h4>
                <div className="space-y-6 relative z-10">
                  {data.revenueBySource.map((r, i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase">
                        <span className="text-gray-400">{r.source}</span>
                        <span className="text-white italic">${r.revenue.toLocaleString()}</span>
                      </div>
                      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${r.percentage}%` }} className="h-full bg-gradient-to-r from-[#10B981] to-[#059669]" />
                      </div>
                      <p className="text-[8px] font-black text-gray-600 tracking-widest text-right">{r.percentage}% DEL TOTAL</p>
                    </div>
                  ))}
                  {data.revenueBySource.length === 0 && (
                    <p className="text-[10px] font-black uppercase text-gray-600 text-center py-20">Esperando primeras ventas...</p>
                  )}
                </div>
              </div>
            </div>

              {/* Relevance Chart */}
              <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-2xl">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-2 bg-[#F59E0B]/10 rounded-xl text-[#F59E0B]">
                    <Eye size={16} />
                  </div>
                  <h4 className="font-black italic uppercase text-xs tracking-[0.2em] text-white">RELEVANCIA DE PRODUCTOS</h4>
                </div>
                <div className="space-y-4">
                  {data.topProducts.slice(0, 5).map((p, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase">
                        <span className="text-gray-200 truncate pr-4">{p.name}</span>
                        <span className="text-[#00ADEE] italic">{p.clicks} clics</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${(p.clicks / (data.topProducts[0]?.clicks || 1)) * 100}%` }} className="h-full bg-[#00ADEE]" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            <div className="grid lg:grid-cols-3 gap-8">
              <ActionableList title="CARRITO: ALTAS" data={data.mostAddedToCart} color="#00ADEE" icon={<ShoppingCart size={14} />} />
              <ActionableList title="CARRITO: BAJAS" data={data.mostRemovedFromCart} color="#EF4444" icon={<Trash2 size={14} />} />
              <ActionableList title="ÉXITOS DE VENTAS" data={data.mostPurchased} color="#10B981" icon={<DollarSign size={14} />} />
            </div>
          </>
        )}

        {activeTab === 'audiencia' && (
          <div className="space-y-10">
            <div className="grid lg:grid-cols-4 gap-8">
              <KPICard title="RETORNO CLIENTE" value={`${data.returningRate}%`} icon={<TrendingUp size={18} />} color="#F59E0B" subtitle="Visitantes que vuelven" />
              <KPICard title="USUARIOS REG" value={data.registeredVisits.toLocaleString()} icon={<Users size={18} />} color="#00ADEE" subtitle="Con cuenta creada" />
              <KPICard title="TIEMPO SESIÓN" value={`${data.avgTimeOnPage}s`} icon={<Clock size={18} />} color="#10B981" subtitle="Promedio de permanencia" />
              <KPICard title="RADIO MÓVIL" value={data.deviceBreakdown.find(d => d.name === 'Celular')?.value ? `${Math.round((data.deviceBreakdown.find(d => d.name === 'Celular')!.value / data.totalVisits) * 100)}%` : '0%'} icon={<Users size={18} />} color="#7BF1FA" subtitle="Tráfico desde celular" />
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              {/* Geolocation */}
              <div className="lg:col-span-2 bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-2xl">
                <div className="flex items-center justify-between mb-8">
                  <h4 className="font-black italic uppercase text-xs tracking-[0.2em] text-[#00ADEE]">ZONAS DE CALOR (CIUDADES)</h4>
                  <span className="text-[9px] font-black text-gray-500 uppercase">Gente Real (Únicos)</span>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {data.locations.length > 0 ? data.locations.map((loc, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/10 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-[10px] font-black text-gray-600 border border-white/5">0{i+1}</div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-300 group-hover:text-white line-clamp-1">{loc.city}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-12 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-[#00ADEE]" style={{ width: `${(loc.count / (data.locations[0]?.count || 1)) * 100}%` }} />
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-xs font-black italic text-[#00ADEE]">{loc.count}</span>
                          <span className="text-[7px] font-black text-gray-600 uppercase">Personas</span>
                        </div>
                      </div>
                    </div>
                  )) : <p className="text-[10px] font-black uppercase text-gray-600 py-10 text-center col-span-2">Esperando primeras coordenadas...</p>}
                </div>
              </div>

              {/* Devices */}
              <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-2xl">
                <h4 className="font-black italic uppercase text-xs tracking-[0.2em] text-[#0072BC] mb-8">DISPOSITIVOS (POR PERSONA)</h4>
                <div className="space-y-6">
                  {data.deviceBreakdown.map((d, i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                        <span className="text-gray-400">{d.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] text-gray-600">{d.value} Pers.</span>
                          <span className="text-white">{Math.round((d.value / (data.uniqueVisitors || 1)) * 100)}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${(d.value / (data.uniqueVisitors || 1)) * 100}%` }} className="h-full" style={{ backgroundColor: d.color }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-10 p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10">
                  <p className="text-[8px] font-black text-blue-400 uppercase leading-relaxed text-center">
                    Optimizá tu web para {data.deviceBreakdown.sort((a,b) => b.value - a.value)[0]?.name || 'móviles'}. Es el dispositivo dominante.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-2xl">
              <h4 className="font-black italic uppercase text-xs tracking-[0.2em] text-white mb-8">FUENTES DE TRÁFICO (ADS)</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {data.referrers.map((r, i) => (
                  <div key={i} className="bg-white/5 p-6 rounded-3xl border border-white/5 text-center group hover:border-[#8B5CF6]/50 transition-all">
                    <p className="text-[9px] font-black uppercase text-gray-500 tracking-tighter mb-2">{r.source}</p>
                    <p className="text-2xl font-black italic text-white leading-none">{r.percentage}%</p>
                    <p className="text-[8px] font-black text-gray-700 uppercase mt-2">{r.count} visitas</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'comportamiento' && (
          <div className="space-y-10">
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Heatmap Hourly Activity */}
              <div className="lg:col-span-2 bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-2xl">
                <h4 className="font-black italic uppercase text-xs tracking-[0.2em] text-[#00ADEE] mb-8">INTENSIDAD HORARIA (HEATMAP)</h4>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.hourlyActivity}>
                      <defs>
                        <linearGradient id="heatColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#FBBF24" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#FBBF24" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#222" opacity={0.3} />
                      <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#666' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#666' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: 16 }} />
                      <Area type="monotone" dataKey="count" stroke="#FBBF24" strokeWidth={4} fill="url(#heatColor)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[9px] font-black text-gray-600 uppercase mt-4 tracking-widest leading-relaxed">
                  TIP PRO: Programá tus campañas de Ads y posteos orgánicos para los picos de intensidad. A las {[...data.hourlyActivity].sort((a,b) => b.count - a.count)[0]?.hour} es tu punto máximo.
                </p>
              </div>

              {/* Top Abandoned Products */}
              <ActionableList title="TOP ABANDONADOS" data={data.topAbandonedProducts} color="#EF4444" icon={<XCircle size={14} />} />
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-2xl">
                <h4 className="font-black italic uppercase text-xs tracking-[0.2em] text-[#F59E0B] mb-8">INTENCIÓN DE BÚSQUEDA</h4>
                <div className="flex flex-wrap gap-2">
                  {data.topSearches.map((s, i) => (
                    <div key={i} className="bg-white/5 px-4 py-2 rounded-full border border-white/5 flex items-center gap-2 group hover:border-[#F59E0B]/50 transition-all">
                      <span className="text-[10px] font-black uppercase text-gray-400 group-hover:text-white">{s.query}</span>
                      <span className="text-[10px] font-black italic text-[#F59E0B]">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden">
                <h4 className="font-black italic uppercase text-xs tracking-[0.2em] text-white mb-8">CONDUCTA EN PÁGINAS</h4>
                <div className="grid grid-cols-2 gap-4">
                  {data.pageViews.slice(0, 6).map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5 group hover:border-[#00ADEE]/40 transition-all">
                      <span className="text-[10px] font-black uppercase text-gray-400 truncate group-hover:text-white">{p.page}</span>
                      <span className="text-sm font-black italic text-white">{p.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function ActionableList({ title, data, color, icon }: { title: string; data: any[]; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[3.5rem] border border-white/10 shadow-2xl relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-32 h-32 blur-[60px] opacity-10 transition-all group-hover:opacity-20 translate-x-[-20%] translate-y-[-20%]" style={{ backgroundColor: color }} />
      <div className="flex items-center gap-3 mb-8 relative z-10">
        <div style={{ color }} className="p-2 bg-white/5 rounded-xl border border-white/5">{icon}</div>
        <h4 className="font-black italic uppercase text-[10px] tracking-[0.2em]" style={{ color }}>{title}</h4>
      </div>
      {data.length > 0 ? (
        <div className="space-y-4 relative z-10">
          {data.slice(0, 5).map((p, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5 hover:border-white/20 transition-all">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black italic text-gray-600">#{i+1}</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-gray-300 truncate max-w-[120px]">{p.name}</span>
              </div>
              <span className="text-sm font-black italic" style={{ color }}>{p.count}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center py-10 text-gray-600 italic relative z-10">
          <p className="text-[9px] font-black uppercase tracking-widest">Esperando volumen...</p>
        </div>
      )}
    </div>
  );
}

function KPICard({ title, value, icon, color, subtitle }: { title: string; value: string; icon: React.ReactNode; color: string; subtitle?: string }) {
  return (
    <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[3.5rem] border border-white/10 relative overflow-hidden group hover:border-white/30 transition-all duration-700 shadow-2xl">
      <div className="absolute top-0 right-0 w-32 h-32 blur-[100px] opacity-10 transition-all group-hover:opacity-30 group-hover:scale-150" style={{ backgroundColor: color }} />
      <div className="flex items-center gap-3 mb-4 relative z-10">
        <div className="p-3 rounded-2xl bg-white/5 border border-white/5 shadow-inner" style={{ color }}>{icon}</div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-gray-500">{title}</p>
          {subtitle && <p className="text-[7px] font-black uppercase tracking-widest text-gray-600 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <p className="text-4xl font-black italic tracking-tighter text-white relative z-10">{value}</p>
    </div>
  );
}
