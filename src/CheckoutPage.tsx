import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, ShoppingBag, User, Phone, MapPin,
  MessageSquare, CreditCard, CheckCircle, Loader2, Tag, X,
  ExternalLink, Wallet, Landmark, CreditCard as CardIcon, ReceiptText, ChevronRight
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
  config?: any;
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
  supportPhone = '5491112345678',
  config
}: CheckoutPageProps) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    street: '',
    number: '',
    zipCode: '',
    locality: '',
    note: '',
    guestEmail: '', // Para pagos online sin login
    paymentMethod: config?.enabledPaymentMethods?.ualabis ? 'ualabis_pro' : 
                   (config?.enabledPaymentMethods?.mercadopago !== false) ? 'mercadopago_pro' : 'whatsapp_manual',
    subMethod: 'efectivo', 
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
    const fields = config?.checkoutFields;

    if (fields?.name !== false && !form.name.trim()) errs.name = 'El nombre es obligatorio';
    if (fields?.phone !== false && !form.phone.trim()) errs.phone = 'El teléfono es obligatorio';
    
    // Si no hay configuración de campos detallados, validamos el campo 'address' tradicional
    if (!fields?.street && !fields?.locality) {
      if (!form.address.trim()) errs.address = 'La dirección es obligatoria';
    } else {
      if (fields?.street && !form.street.trim()) errs.street = 'La calle es obligatoria';
      if (fields?.number && !form.number.trim()) errs.number = 'El número es obligatorio';
      if (fields?.locality && !form.locality.trim()) errs.locality = 'La localidad es obligatoria';
      if (fields?.zipCode && !form.zipCode.trim()) errs.zipCode = 'El código postal es obligatorio';
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
    const fullAddress = config?.checkoutFields?.street 
      ? `${form.street} ${form.number}${form.locality ? `, ${form.locality}` : ''}${form.zipCode ? ` (CP: ${form.zipCode})` : ''}`
      : form.address;

    const msg = `*NUEVO PEDIDO - DGO (#${num})*\n` +
                `---------------------------\n` +
                (config?.checkoutFields?.name !== false ? `👤 *Cliente:* ${form.name}\n` : '') +
                (config?.checkoutFields?.phone !== false ? `📞 *WhatsApp:* ${form.phone}\n` : '') +
                `📍 *Dirección:* ${fullAddress}\n` +
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
        customerAddress: config?.checkoutFields?.street 
                         ? `${form.street} ${form.number}, ${form.locality}` 
                         : form.address.trim(),
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
        paymentMethod: form.paymentMethod === 'mercadopago_pro' 
          ? 'mercadopago_pro' 
          : form.paymentMethod === 'ualabis_pro' 
            ? 'ualabis_pro' 
            : `${form.paymentMethod}:${form.subMethod}`,
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
        }
      }

      trackEvent(Events.CHECKOUT_COMPLETE, { orderId, total, items: cart.length }, userId);

      // --- FLUJO MERCADO PAGO REAL ---
      if (form.paymentMethod === 'mercadopago_pro') {
        const emailToUse = userEmail || (form.guestEmail.trim() || 'invitado@temp.com');
        const response = await fetch('/.netlify/functions/create-preference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: orderId,
            items: order.items,
            customerEmail: emailToUse,
            total: total
          })
        });

        if (!response.ok) {
          const rawText = await response.text();
          let errorMsg = 'Error al iniciar Mercado Pago';
          try {
            const errData = JSON.parse(rawText);
            errorMsg = errData.error || errorMsg;
          } catch (e) {
            errorMsg = `Error del servidor (${response.status}): ${rawText.substring(0, 50)}...`;
          }
          throw new Error(errorMsg);
        }

        const data = await response.json();
        window.location.href = data.init_point;
        return; 
      }

      // --- FLUJO UALA BIS ---
      if (form.paymentMethod === 'ualabis_pro') {
        const emailToUse = userEmail || (form.guestEmail.trim() || 'invitado@temp.com');
        const response = await fetch('/.netlify/functions/create-ualabis-preference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: orderId,
            items: order.items,
            customerEmail: emailToUse,
            total: total
          })
        });

        if (!response.ok) {
          const rawText = await response.text();
          let errorMsg = 'Error al iniciar Ualá Bis';
          try {
            const errData = JSON.parse(rawText);
            errorMsg = errData.error || errorMsg;
          } catch (e) {
            errorMsg = `Error del servidor (${response.status}): ${rawText.substring(0, 50)}...`;
          }
          throw new Error(errorMsg);
        }

        const data = await response.json();
        window.location.href = data.checkout_url;
        return;
      }

      // Si es flujo de WhatsApp, disparamos el mensaje
      if (form.paymentMethod === 'whatsapp_manual') {
        sendWhatsApp(num);
      }

      setSuccess(true);
      setTimeout(onSuccess, 8000); 
    } catch (err: any) {
      console.error('Error al guardar pedido:', err);
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
        className="min-h-screen flex items-center justify-center p-6"
        style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}
      >
        <div className="rounded-[var(--br)] p-12 max-w-md w-full text-center shadow-2xl border border-[var(--border)]" style={{ backgroundColor: 'var(--card)' }}>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="w-24 h-24 bg-[var(--p)]/20 rounded-full flex items-center justify-center mx-auto mb-8"
          >
            <CheckCircle size={48} className="text-[var(--p)] shadow-[0_0_20px_rgba(var(--p-rgb),0.4)]" />
          </motion.div>
          <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-2">¡PEDIDO RECIBIDO!</h2>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--p)] mb-8">
            {form.paymentMethod === 'whatsapp_manual' 
              ? 'Serás redirigido a WhatsApp para finalizar' 
              : 'Tu solicitud ha sido procesada con éxito'}
          </p>
          
          <div className="rounded-3xl p-6 mb-8 border border-[var(--border)]" style={{ backgroundColor: 'var(--bg)' }}>
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">N° Identificador</p>
            <p className="text-2xl font-black italic text-[var(--p)]">DGO-{orderNumber}</p>
          </div>

          <p className="text-sm text-[var(--text-muted)] mb-8 leading-relaxed">
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
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
      {/* Header Premium */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b border-[var(--border)] px-6 py-5" style={{ backgroundColor: 'var(--header)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-5">
            <button
              onClick={onBack}
              className="w-12 h-12 rounded-2xl bg-[var(--text)]/5 border border-[var(--border)] flex items-center justify-center hover:bg-[var(--text)]/10 transition-all group"
            >
              <ArrowLeft size={20} className="text-[var(--text-muted)] group-hover:text-[var(--text)]" />
            </button>
            <div className="hidden sm:block h-8 w-[1px] bg-[var(--border)]" />
            <div>
              <h1 className="text-xl font-black italic uppercase tracking-tighter leading-none mb-1">Finalizar Compra</h1>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--p)]">
                {cart.length} Artículos • Total: ${total.toLocaleString()}
              </p>
            </div>
          </div>
          <ShoppingBag className="text-[var(--text-muted)]/20 w-8 h-8 hidden md:block" />
        </div>
      </header>

      {/* Layout: en mobile stack vertical, en desktop grid de 12 columnas */}
      <div className="max-w-6xl mx-auto p-4 md:p-10 flex flex-col lg:grid lg:grid-cols-12 gap-6 lg:gap-10">

        {/* ── Columna Izquierda: Formularios (en mobile va PRIMERO) ── */}
        <div className="lg:col-span-7 space-y-6 order-1 lg:order-1 pb-24 lg:pb-0">

              {/* Sección 1: Datos Personales */}
              <section className="rounded-[var(--br)] p-8 border border-[var(--border)] shadow-xl" style={{ backgroundColor: 'var(--card)' }}>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-[var(--p)]/10 flex items-center justify-center">
                    <User size={20} className="text-[var(--p)]" />
                  </div>
                  <h2 className="text-lg font-black italic uppercase tracking-tight">Datos del Comprador</h2>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {config?.checkoutFields?.name !== false && (
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] block mb-3">
                        Nombre Completo
                      </label>
                      <input
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Ej: Juan Pérez"
                        className={`w-full bg-[var(--bg)] border ${errors.name ? 'border-red-500/50' : 'border-[var(--border)]'} rounded-2xl px-5 py-4 text-sm font-medium text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--p)]/30 focus:border-[var(--p)] transition-all`}
                      />
                      {errors.name && <p className="text-[9px] text-red-500 font-black uppercase tracking-widest mt-2">← {errors.name}</p>}
                    </div>
                  )}
                  {config?.checkoutFields?.phone !== false && (
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] block mb-3">
                        WhatsApp / Teléfono
                      </label>
                      <input
                        value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="Ej: 11 2345 6789"
                        className={`w-full bg-[var(--bg)] border ${errors.phone ? 'border-red-500/50' : 'border-[var(--border)]'} rounded-2xl px-5 py-4 text-sm font-medium text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--p)]/30 focus:border-[var(--p)] transition-all`}
                      />
                      {errors.phone && <p className="text-[9px] text-red-500 font-black uppercase tracking-widest mt-2">← {errors.phone}</p>}
                    </div>
                  )}
                </div>
              </section>

              {/* Sección 2: Entrega */}
              <section className="rounded-[var(--br)] p-8 border border-[var(--border)] shadow-xl" style={{ backgroundColor: 'var(--card)' }}>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-[var(--p)]/10 flex items-center justify-center">
                    <MapPin size={20} className="text-[var(--p)]" />
                  </div>
                  <h2 className="text-lg font-black italic uppercase tracking-tight">Lugar de Entrega</h2>
                </div>
                
                <div className="space-y-6">
                  {(!config?.checkoutFields?.street && !config?.checkoutFields?.locality) ? (
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 block mb-3">
                        Dirección de Envío
                      </label>
                      <input
                        value={form.address}
                        onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                        placeholder="Calle, Altura, Localidad..."
                        className={`w-full bg-[var(--bg)] border ${errors.address ? 'border-red-300/50' : 'border-[var(--border)]'} rounded-2xl px-5 py-4 text-sm font-medium text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--p)]/30 transition-all`}
                      />
                      {errors.address && <p className="text-[9px] text-red-500 font-black uppercase tracking-widest mt-2">← {errors.address}</p>}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      {config?.checkoutFields?.street && (
                        <div className="md:col-span-3">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 block mb-3">Calle</label>
                          <input
                            value={form.street}
                            onChange={e => setForm(f => ({ ...f, street: e.target.value }))}
                            placeholder="Nombre de la calle"
                            className={`w-full bg-[var(--bg)] border ${errors.street ? 'border-red-500/50' : 'border-[var(--border)]'} rounded-2xl px-5 py-4 text-sm font-medium text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--p)]/30 transition-all`}
                          />
                          {errors.street && <p className="text-[9px] text-red-500 font-black uppercase tracking-widest mt-1">{errors.street}</p>}
                        </div>
                      )}
                      {config?.checkoutFields?.number && (
                        <div className="md:col-span-1">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 block mb-3">Nro</label>
                          <input
                            value={form.number}
                            onChange={e => setForm(f => ({ ...f, number: e.target.value }))}
                            placeholder="1234"
                            className={`w-full bg-[var(--bg)] border ${errors.number ? 'border-red-500/50' : 'border-[var(--border)]'} rounded-2xl px-5 py-4 text-sm font-medium text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--p)]/30 transition-all`}
                          />
                          {errors.number && <p className="text-[9px] text-red-500 font-black uppercase tracking-widest mt-1">{errors.number}</p>}
                        </div>
                      )}
                      {config?.checkoutFields?.locality && (
                        <div className="md:col-span-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 block mb-3">Localidad</label>
                          <input
                            value={form.locality}
                            onChange={e => setForm(f => ({ ...f, locality: e.target.value }))}
                            placeholder="Ej: Lanús"
                            className={`w-full bg-[var(--bg)] border ${errors.locality ? 'border-red-500/50' : 'border-[var(--border)]'} rounded-2xl px-5 py-4 text-sm font-medium text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--p)]/30 transition-all`}
                          />
                          {errors.locality && <p className="text-[9px] text-red-500 font-black uppercase tracking-widest mt-1">{errors.locality}</p>}
                        </div>
                      )}
                      {config?.checkoutFields?.zipCode && (
                        <div className="md:col-span-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 block mb-3">Código Postal</label>
                          <input
                            value={form.zipCode}
                            onChange={e => setForm(f => ({ ...f, zipCode: e.target.value }))}
                            placeholder="Ej: 1824"
                            className={`w-full bg-[var(--bg)] border ${errors.zipCode ? 'border-red-500/50' : 'border-[var(--border)]'} rounded-2xl px-5 py-4 text-sm font-medium text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--p)]/30 transition-all`}
                          />
                          {errors.zipCode && <p className="text-[9px] text-red-500 font-black uppercase tracking-widest mt-1">{errors.zipCode}</p>}
                        </div>
                      )}
                    </div>
                  )}
                  {config?.checkoutFields?.note !== false && (
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 block mb-3">
                        Notas para la logística
                      </label>
                      <textarea
                        value={form.note}
                        onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                        placeholder="¿Alguna aclaración? (Piso, entrada, timbre...)"
                        rows={2}
                        className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-5 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--p)]/30 transition-all resize-none"
                      />
                    </div>
                  )}
                </div>
              </section>

              {/* Sección 3: Método de Pago */}
              <section className="rounded-[var(--br)] p-8 border border-[var(--border)] shadow-xl" style={{ backgroundColor: 'var(--card)' }}>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-[var(--p)]/10 flex items-center justify-center">
                    <Wallet size={20} className="text-[var(--p)]" />
                  </div>
                  <h2 className="text-lg font-black italic uppercase tracking-tight">Forma de Pago</h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Opción WhatsApp */}
                  {(config?.enabledPaymentMethods?.whatsapp !== false) && (
                    <button
                      onClick={() => setForm(f => ({ ...f, paymentMethod: 'whatsapp_manual', subMethod: 'efectivo' }))}
                      className={`relative p-6 rounded-3xl border-2 text-left transition-all ${
                        form.paymentMethod === 'whatsapp_manual'
                          ? 'border-[var(--p)] bg-[var(--p)]/10'
                          : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--p)]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          form.paymentMethod === 'whatsapp_manual' ? 'bg-[var(--p)]' : 'bg-[var(--text)]/10'
                        }`}>
                          <MessageSquare size={14} className={form.paymentMethod === 'whatsapp_manual' ? 'text-white' : 'text-[var(--text-muted)]'} />
                        </div>
                        {form.paymentMethod === 'whatsapp_manual' && <CheckCircle size={16} className="text-[var(--p)]" />}
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1 text-[var(--text)]">Finalizar por</p>
                      <p className="text-sm font-black italic uppercase tracking-tight text-[var(--text)]">Efectivo / Transf.</p>
                      <p className="text-[9px] font-medium text-[var(--text-muted)] mt-2 italic">Coordinar Chat</p>
                    </button>
                  )}

                  {/* Opción MP */}
                  {(config?.enabledPaymentMethods?.mercadopago !== false) && (
                    <button
                      onClick={() => setForm(f => ({ ...f, paymentMethod: 'mercadopago_pro', subMethod: 'online' }))}
                      className={`relative p-6 rounded-3xl border-2 text-left transition-all ${
                        form.paymentMethod === 'mercadopago_pro'
                          ? 'border-[var(--p)] bg-[var(--p)]/10'
                          : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--p)]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          form.paymentMethod === 'mercadopago_pro' ? 'bg-[#009EE3]' : 'bg-[var(--text)]/10'
                        }`}>
                          <Wallet size={14} className="text-white" />
                        </div>
                        {form.paymentMethod === 'mercadopago_pro' && <CheckCircle size={16} className="text-[var(--p)]" />}
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1 text-[var(--text)]">Pago Online</p>
                      <p className="text-sm font-black italic uppercase tracking-tight text-[var(--text)]">Mercado Pago</p>
                      <p className="text-[9px] font-medium text-[var(--text-muted)] mt-2 italic">Pasarela Oficial</p>
                    </button>
                  )}

                  {/* Opción Ualá Bis */}
                  {(config?.enabledPaymentMethods?.ualabis !== false) && (
                    <button
                      onClick={() => setForm(f => ({ ...f, paymentMethod: 'ualabis_pro', subMethod: 'online' }))}
                      className={`relative p-6 rounded-3xl border-2 text-left transition-all ${
                        form.paymentMethod === 'ualabis_pro'
                          ? 'border-[var(--p)] bg-[var(--p)]/10'
                          : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--p)]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          form.paymentMethod === 'ualabis_pro' ? 'bg-[#00D1FF]' : 'bg-[var(--text)]/10'
                        }`}>
                          <CardIcon size={14} className="text-white" />
                        </div>
                        {form.paymentMethod === 'ualabis_pro' && <CheckCircle size={16} className="text-[var(--p)]" />}
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1 text-[var(--text)]">Pago Online</p>
                      <p className="text-sm font-black italic uppercase tracking-tight text-[var(--text)]">Ualá Bis</p>
                      <p className="text-[9px] font-bold text-[var(--p)] mt-2 italic">¡Más cuotas!</p>
                    </button>
                  )}
                </div>

                {/* Sub-selector según el método */}
                <AnimatePresence mode="wait">
                  {form.paymentMethod === 'whatsapp_manual' && (
                    <motion.div
                      key="wa-sub"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-6 pt-6 border-t border-[var(--border)] grid grid-cols-2 gap-3"
                    >
                      <button
                        onClick={() => setForm(f => ({ ...f, subMethod: 'efectivo' }))}
                        className={`py-3 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                          form.subMethod === 'efectivo'
                            ? 'bg-[var(--p)] text-white'
                            : 'border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--p)]/40'
                        }`}
                      >
                        Billete Efectivo
                      </button>
                      <button
                        onClick={() => setForm(f => ({ ...f, subMethod: 'transferencia' }))}
                        className={`py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          form.subMethod === 'transferencia'
                            ? 'bg-[var(--p)] text-white'
                            : 'border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--p)]/40'
                        }`}
                      >
                        Transferencia
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
                {/* Campo email para invitados en pagos online */}
                {!userId && (form.paymentMethod === 'mercadopago_pro' || form.paymentMethod === 'ualabis_pro') && (
                  <motion.div
                    key="guest-email"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-5 pt-5 border-t border-[var(--border)]"
                  >
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] block mb-3">
                      Tu Email <span className="text-[var(--p)]">(Recomendado para recibir el comprobante)</span>
                    </label>
                    <input
                      type="email"
                      value={form.guestEmail}
                      onChange={e => setForm(f => ({ ...f, guestEmail: e.target.value }))}
                      placeholder="tu@email.com"
                      className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-5 py-4 text-sm font-medium text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--p)]/30 focus:border-[var(--p)] transition-all"
                    />
                    <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest mt-2 italic">
                      Sin cuenta podés comprar igual. El email es solo para el comprobante.
                    </p>
                  </motion.div>
                )}
              </section>
        </div>

        {/* ── Columna Derecha: Detalle (en mobile va al FINAL) ── */}
        <div className="lg:col-span-5 space-y-4 order-2 lg:order-2">
          
          {/* Items */}
          <div className="rounded-[var(--br)] border border-[var(--border)] overflow-hidden" style={{ backgroundColor: 'var(--card)' }}>
            <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">Tu Pedido</h3>
              <ShoppingBag size={16} className="text-[var(--p)]" />
            </div>
            <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar">
              {cart.map(item => {
                const isWholesale = item.wholesalePrice && item.quantity >= (item.wholesaleMinQuantity || 12);
                const currentPrice = isWholesale ? item.wholesalePrice : item.price;
                
                return (
                  <div key={item.id} className="flex items-center gap-4 p-4 rounded-3xl hover:bg-[var(--text)]/5 transition-colors group relative">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden border border-[var(--border)] flex-shrink-0" style={{ backgroundColor: 'var(--bg)' }}>
                      <img src={imgSizes.thumb(item.image)} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[11px] font-black uppercase tracking-wide text-[var(--text)] leading-tight truncate">{item.name}</p>
                        {isWholesale && <span className="text-[7px] bg-[var(--p)] text-white font-black px-1.5 py-0.5 rounded uppercase">M</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center rounded-lg border border-[var(--border)] h-7" style={{ backgroundColor: 'var(--bg)' }}>
                          <button 
                            onClick={() => onUpdateQuantity(item.id, -1)}
                            className="w-7 h-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                          >
                            -
                          </button>
                          <span className="text-[10px] font-black w-4 text-center text-[var(--text)]">{item.quantity}</span>
                          <button 
                            onClick={() => onUpdateQuantity(item.id, 1)}
                            className="w-7 h-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest leading-none">
                          x {
                            item.unitType === 'dozen' ? 'Doc' : 
                            item.unitType === 'pack10' ? 'P10' :
                            item.unitType === 'pack6' ? 'P6' : 'Un'
                          }
                        </span>
                      </div>
                    </div>
                    <p className="text-sm font-black text-[var(--text)] self-center">
                      ${((currentPrice || 0) * item.quantity).toLocaleString()}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cupón */}
          <div className="rounded-[var(--br)] p-6 border border-[var(--border)]" style={{ backgroundColor: 'var(--card)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Tag size={14} className="text-[var(--p)]" />
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Cupón de Descuento</h3>
            </div>
            {couponOk ? (
              <div className="flex items-center justify-between bg-[var(--p)]/10 border border-[var(--p)]/20 rounded-2xl px-5 py-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-[var(--p)] underline decoration-2">{couponCode.toUpperCase()}</p>
                  <p className="text-[11px] font-black text-[var(--p)] mt-1">−${discount.toLocaleString()}</p>
                </div>
                <button onClick={removeCoupon} className="p-2 rounded-full h-8 w-8 bg-[var(--p)]/10 flex items-center justify-center hover:bg-[var(--p)]/20 transition-all">
                  <X size={14} className="text-[var(--p)]" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={couponCode}
                  onChange={e => { setCouponCode(e.target.value); setCouponMsg(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                  placeholder="Código"
                  className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--p)] transition-all"
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
              <p className={`text-[9px] font-black uppercase tracking-widest mt-3 px-1 ${couponOk ? 'text-[var(--p)]' : 'text-red-400'}`}>
                {couponMsg}
              </p>
            )}
          </div>

          {/* Resumen Final */}
          <div className="rounded-[var(--br)] p-8 border border-[var(--border)] shadow-2xl relative overflow-hidden" style={{ backgroundColor: 'var(--card)' }}>
            <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
              <ReceiptText size={120} className="text-[var(--text)]" />
            </div>
            
            <div className="space-y-4 mb-8">
              <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                <span>Subtotal</span>
                <span className="text-[var(--text)]">${subtotal.toLocaleString()}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest text-[var(--p)]">
                  <span>Descuento Aplicado</span>
                  <span>−${discount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                <span>Envío</span>
                <span className="text-[var(--text-muted)] italic">A convenir</span>
              </div>
              <div className="h-[1px] my-4" style={{ backgroundColor: 'var(--border)' }} />
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] mb-1">Total a Pagar</p>
                  <p className="text-4xl font-black italic text-[var(--text)] tracking-tighter">${total.toLocaleString()}</p>
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
              onClick={handleSubmit}
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
                  {form.paymentMethod === 'ualabis_pro' ? (
                    <><CardIcon size={20} /> Pagar con Ualá Bis</>
                  ) : form.paymentMethod === 'mercadopago_pro' ? (
                    <><Wallet size={20} /> Pagar con Mercado Pago</>
                  ) : (
                    <><ExternalLink size={20} /> Pedir por WhatsApp</>
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

      {/* ── BOTÓN DE PAGO FLOTANTE (SOLO MOBILE) ── */}
      <AnimatePresence>
        {cart.length > 0 && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="lg:hidden fixed bottom-0 left-0 right-0 z-[60] p-4 bg-[#0a1118]/80 backdrop-blur-xl border-t border-white/5 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
          >
            <div className="max-w-md mx-auto flex items-center gap-4">
              <div className="flex-1">
                <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-0.5">Total a Pagar</p>
                <p className="text-xl font-black italic text-white tracking-tighter">${total.toLocaleString()}</p>
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-[2] py-4 rounded-2xl text-white font-black italic uppercase tracking-tighter text-sm transition-all shadow-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--p)' }}
              >
                {submitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    {form.paymentMethod === 'ualabis_pro' ? 'Pagar c/ Ualá' : 
                     form.paymentMethod === 'mercadopago_pro' ? 'Pagar c/ MP' : 
                     'Pedir x WA'}
                    <ChevronRight size={18} />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
