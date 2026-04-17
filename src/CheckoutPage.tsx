import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, ShoppingBag, User, Phone, MapPin,
  MessageSquare, CreditCard, CheckCircle, Loader2, Tag, X,
  ExternalLink, Wallet, Landmark, CreditCard as CardIcon, ReceiptText
} from 'lucide-react';
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { dbService, type Order } from './services/dbService';
import { applyCoupon } from './services/couponService';
import { requestPointsForOrder } from './services/pointService';
import { trackEvent, Events } from './lib/analytics';
import { imgSizes } from './lib/cloudinaryUtils';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CartItem {
  id: string;
  name: string;
  price: number;
  wholesalePrice?: number;
  wholesaleMinQuantity?: number;
  unitType?: 'unit' | 'dozen' | 'pack10' | 'pack6' | 'pack';
  quantity: number;
  image: string;
}

interface CheckoutPageProps {
  cart: CartItem[];
  onBack: () => void;
  onSuccess: () => void;
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemoveItem: (id: string) => void;
  userId?: string | null;
  userLevel?: string | null;
  userEmail?: string | null;
  supportPhone?: string;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function CheckoutPage({
  cart,
  onBack,
  onSuccess,
  onUpdateQuantity,
  onRemoveItem,
  userId = null,
  userLevel = null,
  userEmail = null,
  supportPhone = '5491112345678', // Default si no viene de config
}: CheckoutPageProps) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    note: '',
    paymentMethod: 'whatsapp_manual', // whatsapp_manual | mp_simulated
    subMethod: 'efectivo', // efectivo | transferencia | debito | credito
  });
  
  const [couponCode, setCouponCode]     = useState('');
  const [couponMsg, setCouponMsg]       = useState('');
  const [couponOk, setCouponOk]         = useState(false);
  const [discount, setDiscount]         = useState(0);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [success, setSuccess]           = useState(false);
  const [orderNumber, setOrderNumber]   = useState('');
  const [errors, setErrors]             = useState<Record<string, string>>({});

  // Simulación de Mercado Pago
  const [mpStep, setMpStep] = useState(false);
  const [cardData, setCardData] = useState({ number: '', expiry: '', cvc: '' });

  const subtotal = cart.reduce((s, i) => {
    const price = (i.wholesalePrice && i.quantity >= (i.wholesaleMinQuantity || 12)) 
      ? i.wholesalePrice 
      : i.price;
    return s + price * i.quantity;
  }, 0);
  const total    = Math.max(0, subtotal - discount);

  // ── Validar cupón ──────────────────────────────────────────────────────────
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setApplyingCoupon(true);
    setCouponMsg('');
    try {
      const result = await applyCoupon(couponCode, userId, userLevel, subtotal);
      if (result.valid) {
        setDiscount(result.discount);
        setCouponOk(true);
        setCouponMsg(`✓ Cupón aplicado — ahorrás $${result.discount.toLocaleString()}`);
        trackEvent(Events.COUPON_SUCCESS, { code: couponCode }, userId);
      } else {
        setCouponOk(false);
        setCouponMsg(result.error || 'Cupón inválido');
        trackEvent(Events.COUPON_FAIL, { code: couponCode, reason: result.error }, userId);
      }
    } catch {
      setCouponMsg('Error al validar el cupón. Intentá de nuevo.');
    }
    setApplyingCoupon(false);
  };

  // ── Auto-completado de Perfil ──────────────────────────────────────────────
  useEffect(() => {
    if (userId) {
      const fetchProfile = async () => {
        try {
          const profile = await dbService.getUserProfile(userId);
          if (profile) {
            setForm(prev => ({
              ...prev,
              name: profile.fullName || prev.name,
              phone: profile.phone || prev.phone,
              address: profile.address 
                ? `${profile.address.street} ${profile.address.number}, ${profile.address.locality}` 
                : prev.address,
            }));
          }
        } catch (error) {
          console.error("Error al cargar perfil:", error);
        }
      };
      fetchProfile();
    }
  }, [userId]);

  const removeCoupon = () => {
    setCouponCode('');
    setCouponMsg('');
    setCouponOk(false);
    setDiscount(0);
  };

  // ── Validar formulario ─────────────────────────────────────────────────────
  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim())    errs.name    = 'El nombre es obligatorio';
    if (!form.phone.trim())   errs.phone   = 'El teléfono es obligatorio';
    if (!form.address.trim()) errs.address = 'La dirección es obligatoria';
    
    if (form.paymentMethod === 'mp_simulated' && mpStep) {
      if (cardData.number.length < 16) errs.card = 'Número de tarjeta incompleto';
      if (!cardData.expiry.includes('/')) errs.card = 'Vencimiento inválido';
      if (cardData.cvc.length < 3) errs.card = 'CVV inválido';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Generar WhatsApp de pedido ─────────────────────────────────────────────
  const sendWhatsApp = (num: string) => {
    const itemsText = cart.map(i => {
      const isWholesale = (i.wholesalePrice && i.wholesalePrice > 0) && (i.wholesaleMinQuantity && i.quantity >= i.wholesaleMinQuantity);
      const currentPrice = isWholesale ? i.wholesalePrice : i.price;
      const unitLabel = i.unitType === 'dozen' ? 'doc' : 
                        i.unitType === 'pack10' ? 'pack x10' :
                        i.unitType === 'pack6' ? 'pack x6' : 'un';
      return `- *${i.name}* x${i.quantity} ${unitLabel} ($${(currentPrice * i.quantity).toLocaleString()})${isWholesale ? ' [MAYORISTA]' : ''}`;
    }).join('\n');
    const msg = `*NUEVO PEDIDO - DGO (#${num})*\n` +
                `---------------------------\n` +
                `👤 *Cliente:* ${form.name}\n` +
                `📞 *WhatsApp:* ${form.phone}\n` +
                `📍 *Dirección:* ${form.address}\n` +
                `💳 *Método:* ${form.subMethod.toUpperCase()}\n\n` +
                `📦 *PRODUCTOS:*\n${itemsText}\n\n` +
                `💰 *TOTAL:* $${total.toLocaleString()}\n` +
                `---------------------------\n` +
                (form.note ? `📝 *Nota:* ${form.note}\n` : '') +
                `Enviado desde Distribuidora DGO`;

    const encoded = encodeURIComponent(msg);
    const phone = supportPhone.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');
  };

  // ── Confirmar pedido ───────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;
    if (cart.length === 0) return;

    setSubmitting(true);
    trackEvent(Events.BEGIN_CHECKOUT, { total, items: cart.length }, userId);

    try {
      const order: Omit<Order, 'id' | 'status' | 'createdAt'> = {
        customerName:    form.name.trim(),
        customerPhone:   form.phone.trim(),
        customerAddress: form.address.trim(),
        customerNote:    form.note.trim() || null,
        customerEmail:   userEmail || null,
        userId:          userId || null,
        items:           cart.map(i => {
          const isWholesale = (i.wholesalePrice && i.wholesalePrice > 0) && (i.wholesaleMinQuantity && i.quantity >= i.wholesaleMinQuantity);
          return {
            productId: i.id,
            name:      i.name,
            price:     isWholesale ? (i.wholesalePrice || i.price) : i.price,
            quantity:  i.quantity,
            image:     i.image,
            isWholesale,
            unitType:  i.unitType
          };
        }),
        subtotal,
        discount,
        total,
        couponCode: couponOk ? (couponCode || '').toUpperCase() : null,
        paymentMethod: `${form.paymentMethod}:${form.subMethod}`,
      };

      const orderId = await dbService.addOrder(order);
      const num = orderId.substring(0, 6).toUpperCase();
      setOrderNumber(num);

      // Registrar puntos si hay usuario
      if (userId) {
        try {
          await requestPointsForOrder(userId, orderId, total);
        } catch (pointErr) {
          console.error('Error al registrar puntos:', pointErr);
          // No bloqueamos el pedido por esto
        }
      }

      trackEvent(Events.CHECKOUT_COMPLETE, { orderId, total, items: cart.length }, userId);

      // Si es flujo de WhatsApp, disparamos el mensaje
      if (form.paymentMethod === 'whatsapp_manual') {
        sendWhatsApp(num);
      }

      setSuccess(true);
      setTimeout(onSuccess, 8000); // Damos más tiempo para leer el mensaje
    } catch (err: any) {
      console.error('Error al guardar pedido:', err);
      // Extraemos el mensaje de error si es posible
      const errMsg = err?.message || 'Hubo un error al procesar el pedido.';
      setErrors({ submit: `Error: ${errMsg}. Por favor intentá de nuevo.` });
    }
    setSubmitting(false);
  };

  // ── Pantalla de éxito ──────────────────────────────────────────────────────
  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-[#0a1118] flex items-center justify-center p-6 text-white"
      >
        <div className="bg-[#111a24] rounded-[var(--br)] p-12 max-w-md w-full text-center shadow-2xl border border-white/10">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="w-24 h-24 bg-[var(--p)]/20 rounded-full flex items-center justify-center mx-auto mb-8"
          >
            <CheckCircle size={48} className="text-[var(--p)] shadow-[0_0_20px_rgba(var(--p-rgb),0.4)]" />
          </motion.div>
          <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-2">¡PEDIDO RECIBIDO!</h2>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500 mb-8">
            {form.paymentMethod === 'whatsapp_manual' 
              ? 'Serás redirigido a WhatsApp para finalizar' 
              : 'Tu solicitud ha sido procesada con éxito'}
          </p>
          
          <div className="bg-white/5 rounded-3xl p-6 mb-8 border border-white/5">
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">N° Identificador</p>
            <p className="text-2xl font-black italic text-[var(--p)]">DGO-{orderNumber}</p>
          </div>

          <p className="text-sm text-gray-400 mb-8 leading-relaxed">
            {form.paymentMethod === 'whatsapp_manual'
              ? '¡Gracias por tu compra! En unos segundos se abrirá tu chat de WhatsApp para que podamos coordinar la entrega y el pago.'
              : '¡Pago aprobado! El equipo de DGO ya está preparando tu pedido. Pronto nos pondremos en contacto.'}
          </p>

          <button 
            onClick={onSuccess}
            className="w-full py-4 rounded-full bg-[var(--p)] hover:brightness-110 text-white text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg shadow-[var(--p)]/20"
          >
            Volver a la Tienda
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1118] text-white">
      {/* Header Premium */}
      <header className="sticky top-0 z-50 bg-[#0a1118]/80 backdrop-blur-md border-b border-white/10 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-5">
            <button
              onClick={onBack}
              className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all group"
            >
              <ArrowLeft size={20} className="text-gray-400 group-hover:text-white" />
            </button>
            <div className="hidden sm:block h-8 w-[1px] bg-white/10" />
            <div>
              <h1 className="text-xl font-black italic uppercase tracking-tighter leading-none mb-1">Finalizar Compra</h1>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--p)]">
                {cart.length} Artículos • Total: ${total.toLocaleString()}
              </p>
            </div>
          </div>
          <ShoppingBag className="text-white/20 w-8 h-8 hidden md:block" />
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6 md:p-10 grid lg:grid-cols-12 gap-10">

        {/* ── Columna Izquierda: Formularios ── */}
        <div className="lg:col-span-7 space-y-10">

          {!mpStep ? (
            <>
              {/* Sección 1: Datos Personales */}
              <section className="bg-[#111a24] rounded-[var(--br)] p-8 border border-white/5 shadow-xl">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-[var(--p)]/10 flex items-center justify-center">
                    <User size={20} className="text-[var(--p)]" />
                  </div>
                  <h2 className="text-lg font-black italic uppercase tracking-tight">Datos del Comprador</h2>
                </div>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 block mb-3">
                      Nombre Completo
                    </label>
                    <input
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Ej: Juan Pérez"
                      className={`w-full bg-[#0a1118] border ${errors.name ? 'border-red-500/50' : 'border-white/10'} rounded-2xl px-5 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--p)]/30 focus:border-[var(--p)] transition-all`}
                    />
                    {errors.name && <p className="text-[9px] text-red-500 font-black uppercase tracking-widest mt-2">← {errors.name}</p>}
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 block mb-3">
                      WhatsApp / Teléfono
                    </label>
                    <input
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="Ej: 11 2345 6789"
                      className={`w-full bg-[#0a1118] border ${errors.phone ? 'border-red-500/50' : 'border-white/10'} rounded-2xl px-5 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--p)]/30 focus:border-[var(--p)] transition-all`}
                    />
                    {errors.phone && <p className="text-[9px] text-red-500 font-black uppercase tracking-widest mt-2">← {errors.phone}</p>}
                  </div>
                </div>
              </section>

              {/* Sección 2: Entrega */}
              <section className="bg-[#111a24] rounded-[var(--br)] p-8 border border-white/5 shadow-xl">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-[var(--p)]/10 flex items-center justify-center">
                    <MapPin size={20} className="text-[var(--p)]" />
                  </div>
                  <h2 className="text-lg font-black italic uppercase tracking-tight">Lugar de Entrega</h2>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 block mb-3">
                      Dirección de Envío
                    </label>
                    <input
                      value={form.address}
                      onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                      placeholder="Calle, Altura, Localidad..."
                      className={`w-full bg-[#0a1118] border ${errors.address ? 'border-red-300/50' : 'border-white/10'} rounded-2xl px-5 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--p)]/30 transition-all`}
                    />
                    {errors.address && <p className="text-[9px] text-red-500 font-black uppercase tracking-widest mt-2">← {errors.address}</p>}
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 block mb-3">
                      Notas para la logística
                    </label>
                    <textarea
                      value={form.note}
                      onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                      placeholder="¿Alguna aclaración? (Piso, entrada, timbre...)"
                      rows={2}
                      className="w-full bg-[#0a1118] border border-white/10 rounded-2xl px-5 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--p)]/30 transition-all resize-none"
                    />
                  </div>
                </div>
              </section>

              {/* Sección 3: Método de Pago */}
              <section className="bg-[#111a24] rounded-[var(--br)] p-8 border border-white/5 shadow-xl">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-[var(--p)]/10 flex items-center justify-center">
                    <Wallet size={20} className="text-[var(--p)]" />
                  </div>
                  <h2 className="text-lg font-black italic uppercase tracking-tight">Forma de Pago</h2>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  {/* Opción WhatsApp */}
                  <button
                    onClick={() => setForm(f => ({ ...f, paymentMethod: 'whatsapp_manual', subMethod: 'efectivo' }))}
                    className={`relative p-6 rounded-3xl border-2 text-left transition-all ${
                      form.paymentMethod === 'whatsapp_manual'
                        ? 'border-[var(--p)] bg-[var(--p)]/5 text-white'
                        : 'border-white/5 bg-[#0a1118] text-gray-500 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${form.paymentMethod === 'whatsapp_manual' ? 'bg-[var(--p)]' : 'bg-white/5'}`}>
                        <MessageSquare size={14} className={form.paymentMethod === 'whatsapp_manual' ? 'text-white' : 'text-gray-500'} />
                      </div>
                      {form.paymentMethod === 'whatsapp_manual' && <CheckCircle size={16} className="text-[var(--p)]" />}
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1">Finalizar por</p>
                    <p className="text-sm font-black italic uppercase tracking-tight">Efectivo / Transferencia</p>
                    <p className="text-[9px] font-medium text-gray-400 mt-2 opacity-60 italic">Se coordina por WhatsApp</p>
                  </button>

                  {/* Opción MP */}
                  <button
                    onClick={() => setForm(f => ({ ...f, paymentMethod: 'mp_simulated', subMethod: 'credito' }))}
                    className={`relative p-6 rounded-3xl border-2 text-left transition-all ${
                      form.paymentMethod === 'mp_simulated'
                        ? 'border-[var(--p)] bg-[var(--p)]/5 text-white'
                        : 'border-white/5 bg-[#0a1118] text-gray-500 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${form.paymentMethod === 'mp_simulated' ? 'bg-[var(--p)]' : 'bg-white/5'}`}>
                        <CardIcon size={14} className={form.paymentMethod === 'mp_simulated' ? 'text-white' : 'text-gray-500'} />
                      </div>
                      {form.paymentMethod === 'mp_simulated' && <CheckCircle size={16} className="text-[var(--p)]" />}
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1">Pago Online</p>
                    <p className="text-sm font-black italic uppercase tracking-tight">Débito / Crédito</p>
                    <p className="text-[9px] font-medium text-gray-400 mt-2 opacity-60 italic">M. Pago Checkout Pro</p>
                  </button>
                </div>

                {/* Sub-selector según el método */}
                <AnimatePresence mode="wait">
                  {form.paymentMethod === 'whatsapp_manual' && (
                    <motion.div
                      key="wa-sub"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-6 pt-6 border-t border-white/5 grid grid-cols-2 gap-3"
                    >
                      <button
                        onClick={() => setForm(f => ({ ...f, subMethod: 'efectivo' }))}
                        className={`py-3 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${form.subMethod === 'efectivo' ? 'bg-[var(--p)] text-white' : 'bg-white/5 text-gray-500'}`}
                      >
                        Billete Efectivo
                      </button>
                      <button
                        onClick={() => setForm(f => ({ ...f, subMethod: 'transferencia' }))}
                        className={`py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${form.subMethod === 'transferencia' ? 'bg-[var(--p)] text-white' : 'bg-white/5 text-gray-500'}`}
                      >
                        Transferencia
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            </>
          ) : (
            /* PASO DE TARJETA (MERCADO PAGO SIMULADO) */
            <motion.section 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-[#111a24] rounded-[var(--br)] p-10 border border-white/5 shadow-xl"
            >
              <div className="flex items-center justify-between mb-10">
                <button onClick={() => setMpStep(false)} className="text-[10px] font-black uppercase tracking-widest text-[#666] hover:text-white flex items-center gap-2 transition-colors">
                  <ArrowLeft size={14} /> Atrás
                </button>
                <img src="https://upload.wikimedia.org/wikipedia/commons/b/b8/Mercado_Pago_logo.svg" className="h-5 opacity-80" alt="MP" />
              </div>

              <div className="max-w-md mx-auto space-y-8">
                <h2 className="text-2xl font-black italic uppercase tracking-tight text-center">Datos de Pago</h2>
                
                {/* Tarjeta Visual (Simulada) */}
                <div className="aspect-[1.6/1] bg-gradient-to-br from-indigo-600 via-indigo-500 to-indigo-800 rounded-3xl p-8 relative shadow-2xl overflow-hidden group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-white/20 transition-all duration-700" />
                  <div className="flex justify-between items-start mb-10">
                    <CardIcon size={32} className="text-white/60" />
                    <div className="w-12 h-10 bg-yellow-400/80 rounded-lg blur-[0.5px]" />
                  </div>
                  <p className="text-2xl font-mono tracking-[0.2em] text-white/90 mb-8 truncate">
                    {cardData.number || '•••• •••• •••• ••••'}
                  </p>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[8px] uppercase tracking-widest text-white/40 mb-1">Titular</p>
                      <p className="text-xs font-bold uppercase tracking-widest text-white">{form.name || 'TU NOMBRE'}</p>
                    </div>
                    <div>
                      <p className="text-[8px] uppercase tracking-widest text-white/40 mb-1">Vence</p>
                      <p className="text-xs font-bold uppercase tracking-widest text-white">{cardData.expiry || 'MM/AA'}</p>
                    </div>
                  </div>
                </div>

                {/* Formulario Tarjeta */}
                <div className="space-y-4">
                  <div>
                    <input
                      type="text"
                      maxLength={16}
                      placeholder="Número de tarjeta"
                      value={cardData.number}
                      onChange={e => setCardData(c => ({ ...c, number: e.target.value.replace(/\D/g, '') }))}
                      className="w-full bg-[#0a1118] border border-white/10 rounded-2xl px-5 py-4 text-sm font-medium focus:outline-none focus:border-[var(--p)] transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      placeholder="Venc. (MM/AA)"
                      maxLength={5}
                      value={cardData.expiry}
                      onChange={e => setCardData(c => ({ ...c, expiry: e.target.value }))}
                      className="bg-[#0a1118] border border-white/10 rounded-2xl px-5 py-4 text-sm font-medium focus:outline-none focus:border-[var(--p)] transition-all"
                    />
                    <input
                      placeholder="CVV"
                      maxLength={3}
                      type="password"
                      value={cardData.cvc}
                      onChange={e => setCardData(c => ({ ...c, cvc: e.target.value.replace(/\D/g, '') }))}
                      className="bg-[#0a1118] border border-white/10 rounded-2xl px-5 py-4 text-sm font-medium focus:outline-none focus:border-[var(--p)] transition-all"
                    />
                  </div>
                </div>
                
                {errors.card && <p className="text-[9px] text-red-500 font-black uppercase text-center mt-2 tracking-widest">{errors.card}</p>}
              </div>
            </motion.section>
          )}
        </div>

        {/* ── Columna Derecha: Detalle de Orden ── */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Items */}
          <div className="bg-[#111a24] rounded-[var(--br)] border border-white/5 overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Tu Pedido</h3>
              <ShoppingBag size={16} className="text-[var(--p)]" />
            </div>
            <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar">
              {cart.map(item => {
                const isWholesale = item.wholesalePrice && item.quantity >= (item.wholesaleMinQuantity || 12);
                const currentPrice = isWholesale ? item.wholesalePrice : item.price;
                
                return (
                  <div key={item.id} className="flex items-center gap-4 p-4 rounded-3xl hover:bg-white/5 transition-colors group relative">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden bg-black/40 border border-white/5 flex-shrink-0">
                      <img src={imgSizes.thumb(item.image)} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[11px] font-black uppercase tracking-wide text-white/90 leading-tight truncate">{item.name}</p>
                        {isWholesale && <span className="text-[7px] bg-emerald-500 text-white font-black px-1.5 py-0.5 rounded uppercase">M</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center bg-black/30 rounded-lg border border-white/5 h-7">
                          <button 
                            onClick={() => onUpdateQuantity(item.id, -1)}
                            className="w-7 h-full flex items-center justify-center text-white/50 hover:text-white transition-colors"
                          >
                            -
                          </button>
                          <span className="text-[10px] font-black w-4 text-center">{item.quantity}</span>
                          <button 
                            onClick={() => onUpdateQuantity(item.id, 1)}
                            className="w-7 h-full flex items-center justify-center text-white/50 hover:text-white transition-colors"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest leading-none">
                          x {
                            item.unitType === 'dozen' ? 'Doc' : 
                            item.unitType === 'pack10' ? 'P10' :
                            item.unitType === 'pack6' ? 'P6' : 'Un'
                          }
                        </span>
                      </div>
                    </div>
                    <p className="text-sm font-black text-white self-center">
                      ${((currentPrice || 0) * item.quantity).toLocaleString()}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cupón */}
          <div className="bg-[#111a24] rounded-[var(--br)] p-6 border border-white/5">
            <div className="flex items-center gap-2 mb-4">
              <Tag size={14} className="text-[var(--p)]" />
              <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Cupón de Descuento</h3>
            </div>
            {couponOk ? (
              <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-5 py-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 underline decoration-2">{couponCode.toUpperCase()}</p>
                  <p className="text-[11px] font-black text-emerald-500 mt-1">−${discount.toLocaleString()}</p>
                </div>
                <button onClick={removeCoupon} className="p-2 rounded-full h-8 w-8 bg-emerald-500/10 flex items-center justify-center hover:bg-emerald-500/20 transition-all">
                  <X size={14} className="text-emerald-500" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={couponCode}
                  onChange={e => { setCouponCode(e.target.value); setCouponMsg(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                  placeholder="Código"
                  className="flex-1 bg-[#0a1118] border border-white/10 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest text-white focus:outline-none focus:border-[var(--p)] transition-all"
                />
                <button
                  onClick={handleApplyCoupon}
                  disabled={applyingCoupon || !couponCode.trim()}
                  className="px-6 py-3 bg-[var(--p)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[var(--p)]/80 disabled:opacity-50 transition-all shadow-[0_4px_10px_rgba(var(--p-rgb),0.3)]"
                >
                  {applyingCoupon ? <Loader2 size={14} className="animate-spin" /> : 'Aplicar'}
                </button>
              </div>
            )}
            {couponMsg && (
              <p className={`text-[9px] font-black uppercase tracking-widest mt-3 px-1 ${couponOk ? 'text-emerald-500' : 'text-red-400'}`}>
                {couponMsg}
              </p>
            )}
          </div>

          {/* Resumen Final */}
          <div className="bg-[#111a24] rounded-[var(--br)] p-8 border border-white/5 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <ReceiptText size={120} className="text-white" />
            </div>
            
            <div className="space-y-4 mb-8">
              <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest text-gray-500">
                <span>Subtotal</span>
                <span>${subtotal.toLocaleString()}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest text-emerald-500">
                  <span>Descuento Aplicado</span>
                  <span>−${discount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest text-gray-500">
                <span>Envío</span>
                <span className="text-white/40 italic">A convenir</span>
              </div>
              <div className="h-[1px] bg-white/5 my-4" />
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-1">Total a Pagar</p>
                  <p className="text-4xl font-black italic text-white tracking-tighter">${total.toLocaleString()}</p>
                </div>
                <motion.div 
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="w-3 h-3 rounded-full bg-[var(--p)] shadow-[0_0_10px_var(--p)] mb-2 px-1"
                />
              </div>
            </div>

            {errors.submit && (
              <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 mb-6 flex items-start gap-3">
                <X size={16} className="text-red-500 mt-1 flex-shrink-0" />
                <p className="text-[10px] font-black uppercase tracking-widest text-red-500">{errors.submit}</p>
              </div>
            )}

            <button
              onClick={() => {
                if (form.paymentMethod === 'mp_simulated' && !mpStep) {
                  if (validate()) setMpStep(true);
                } else {
                  handleSubmit();
                }
              }}
              disabled={submitting || cart.length === 0}
              style={{ backgroundColor: 'var(--p)' }}
              className="w-full py-5 rounded-[var(--br)] text-white font-black italic uppercase tracking-tighter text-lg transition-all hover:brightness-110 shadow-xl shadow-white/5 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {submitting ? (
                <>
                  <Loader2 size={24} className="animate-spin" />
                  Confirmando...
                </>
              ) : (
                <>
                  {form.paymentMethod === 'whatsapp_manual' ? (
                     <><ExternalLink size={20} /> Pedir por WhatsApp</>
                  ) : (
                    <>{mpStep ? <CheckCircle size={20} /> : <CardIcon size={20} />} {mpStep ? 'Confirmar Pago' : 'Pagar con Tarjeta'}</>
                  )}
                </>
              )}
            </button>
            <p className="text-[8px] font-black uppercase tracking-widest text-center mt-5 text-gray-600">
               Distribución Segura desde Buenos Aires, Argentina
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
