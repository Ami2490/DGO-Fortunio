import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  User, 
  LogOut, 
  ChevronRight, 
  Award, 
  Users, 
  History, 
  ShoppingBag, 
  Gift, 
  X, 
  Copy, 
  CheckCircle2,
  TrendingUp,
  Star,
  Tag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, DB_PATHS } from '../firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { LEVEL_CONFIG, getLevelFromPoints, getUserTransactions, PointTransaction } from '../services/pointService';

interface UserBadgeProps {
  user: any;
  onClose?: () => void;
}

export const UserBadge: React.FC<UserBadgeProps> = ({ user, onClose }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showReferrals, setShowReferrals] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      try {
        const docRef = doc(db, DB_PATHS.USERS, user.uid);
        const docSnap = await getDoc(docRef);
        let currentProfile;
        
        if (docSnap.exists()) {
          currentProfile = docSnap.data();
        } else {
          // Si el usuario se logueó por primera vez y no tiene perfil en Firebase, lo creamos
          currentProfile = {
            email: user.email || '',
            fullName: user.displayName || 'Usuario DGO',
            level: 'bronce',
            points: 0,
            role: 'client',
            createdAt: new Date().toISOString(),
            referralCode: `DGO${Math.random().toString(36).substring(2,6).toUpperCase()}`
          };
          await setDoc(docRef, currentProfile);
        }
        
        setProfile(currentProfile);
        
        // Cargar transacciones recientes
        const txs = await getUserTransactions(user.uid);
        setTransactions(txs.slice(0, 5));

        // Cargar referidos
        const usersRef = collection(db, DB_PATHS.USERS);
        const q = query(usersRef, where('referredBy', '==', user.uid));
        const rSnap = await getDocs(q);
        setReferrals(rSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Cargar Mis Compras
        const ordersRef = collection(db, DB_PATHS.ORDERS);
        const oq = query(
          ordersRef, 
          where('userId', '==', user.uid),
          limit(20)
        );
        const oSnap = await getDocs(oq);
        const userOrders = oSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        userOrders.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setOrders(userOrders.slice(0, 10));
        
      } catch (err) {
        console.error('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const handleLogout = () => {
    signOut(auth);
    setIsOpen(false);
    if (onClose) onClose();
  };

  const copyReferralCode = () => {
    if (profile?.referralCode) {
      navigator.clipboard.writeText(profile.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!user) return null;
  if (loading || !profile) {
    return (
      <div className="flex items-center gap-3 p-2 rounded-2xl bg-white/5 border border-white/10 shrink-0">
         <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-gray-500 animate-pulse">
           <User size={20} />
         </div>
      </div>
    );
  }

  const currentLevel = LEVEL_CONFIG[profile.level || 'bronce'];
  const nextLevel = profile.level === 'diamante' ? null : 
                   profile.level === 'oro' ? LEVEL_CONFIG.diamante :
                   profile.level === 'plata' ? LEVEL_CONFIG.oro : LEVEL_CONFIG.plata;
  
  const progress = nextLevel 
    ? ((profile.points - currentLevel.minPoints) / (nextLevel.minPoints - currentLevel.minPoints)) * 100 
    : 100;

  return (
    <>
      <div className="relative">
        <button 
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-3 p-2 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
            <User size={20} />
          </div>
          <div className="hidden md:block text-left pr-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{currentLevel.label}</p>
            <p className="text-xs font-bold text-white truncate max-w-[120px]">{profile.fullName || 'Usuario'}</p>
          </div>
          <ChevronRight size={14} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        </button>

        {createPortal(
          <AnimatePresence>
            {isOpen && (
              <>
                {/* Overlay */}
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsOpen(false)}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
                />
                
                {/* Sidebar Panel */}
                <motion.div 
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="fixed top-0 right-0 h-full w-full max-w-sm bg-[#0a1118] z-[210] border-l border-white/10 shadow-2xl overflow-y-auto custom-scrollbar text-white"
                >
                  <div className="p-8">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xl font-black uppercase tracking-tighter text-white">Mi Panel DGO</h3>
                      <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors text-white">
                        <X size={24} />
                      </button>
                    </div>

                    {/* Perfil Header */}
                    <div className="bg-[#111a24] rounded-[32px] p-6 border border-white/5 mb-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4">
                        <span className="text-3xl">{currentLevel.emoji}</span>
                      </div>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-2xl font-bold shadow-xl">
                          {profile.fullName?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <h4 className="text-lg font-bold text-white leading-tight">{profile.fullName}</h4>
                          <p className="text-xs text-gray-500">{profile.email}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-bold uppercase tracking-widest text-[#555]">PROGRESO {currentLevel.label}</span>
                          <span className="font-bold text-white">{profile.points} / {nextLevel?.minPoints || 'MAX'} PTS</span>
                        </div>
                        <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
                          />
                        </div>
                        {nextLevel && (
                          <p className="text-[10px] text-gray-500 font-medium italic">
                            Te faltan {nextLevel.minPoints - profile.points} puntos para el nivel {nextLevel.label}.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Acciones Rápidas */}
                    <div className="grid grid-cols-3 gap-2 mb-8">
                      <button 
                        onClick={() => setShowReferrals(true)}
                        className="bg-[#111a24] p-3 rounded-2xl border border-white/5 hover:border-emerald-500/50 transition-all text-center group"
                      >
                        <Users size={18} className="mx-auto mb-1 text-emerald-500 group-hover:scale-110 transition-transform" />
                        <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Referidos</p>
                        <p className="text-xs font-bold text-white">{referrals.length}</p>
                      </button>
                      <button 
                        onClick={() => setShowHistory(true)}
                        className="bg-[#111a24] p-3 rounded-2xl border border-white/5 hover:border-emerald-500/50 transition-all text-center group"
                      >
                        <History size={18} className="mx-auto mb-1 text-emerald-500 group-hover:scale-110 transition-transform" />
                        <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Puntos</p>
                        <p className="text-xs font-bold text-white">{profile.points}</p>
                      </button>
                      <button 
                        onClick={() => setShowOrders(true)}
                        className="bg-[#111a24] p-3 rounded-2xl border border-white/5 hover:border-emerald-500/50 transition-all text-center group"
                      >
                        <ShoppingBag size={18} className="mx-auto mb-1 text-emerald-500 group-hover:scale-110 transition-transform" />
                        <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Compras</p>
                        <p className="text-xs font-bold text-white">{orders.length}</p>
                      </button>
                    </div>

                    {/* Código de Referido */}
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 mb-8 text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-3">Tu Código de Referido</p>
                      <div className="bg-black/40 py-3 px-6 rounded-xl flex items-center justify-between gap-4 border border-white/5">
                        <span className="text-xl font-black tracking-widest text-white">{profile.referralCode}</span>
                        <button 
                          onClick={copyReferralCode}
                          className="p-2 hover:bg-white/10 rounded-lg transition-colors text-emerald-500"
                        >
                          {copied ? <CheckCircle2 size={20} /> : <Copy size={20} />}
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-4 leading-relaxed font-medium">
                        Compartí tu código y ganá <span className="text-white">30 puntos</span> por cada amigo que se registre. 
                        ¡Tus amigos también reciben <span className="text-white">50 puntos</span> de bienvenida!
                      </p>
                    </div>

                    {/* Beneficios por Nivel */}
                    <div className="mb-8">
                      <h5 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-4 px-2">Mis Beneficios</h5>
                      <div className="space-y-3">
                        <div className="flex items-center gap-4 bg-[#111a24] p-4 rounded-2xl border border-white/5">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <Tag size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">Descuento {currentLevel.label}</p>
                            <p className="text-[10px] text-gray-500">{currentLevel.discount}% OFF en todas tus compras</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 bg-[#111a24] p-4 rounded-2xl border border-white/5">
                          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                            <Gift size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">Puntos x Compra</p>
                            <p className="text-[10px] text-gray-500">Sumás puntos que podés canjear por descuentos</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer Acciones */}
                    <div className="pt-8 border-t border-white/5">
                      <button 
                        onClick={handleLogout}
                        className="w-full py-4 rounded-2xl bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 transition-all font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
                      >
                        <LogOut size={16} />
                        Cerrar Sesión
                      </button>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}

        {/* Modal de Historial */}
        {createPortal(
          <AnimatePresence>
            {showHistory && (
              <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowHistory(false)}
                  className="absolute inset-0 bg-black/80 backdrop-blur-md"
                />
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="relative bg-[#111a24] w-full max-w-lg rounded-[40px] border border-white/10 p-10 max-h-[80vh] overflow-y-auto custom-scrollbar shadow-2xl text-white"
                >
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-2xl font-black uppercase tracking-tighter text-white">Historial de Puntos</h3>
                    <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors text-white">
                      <X size={24} />
                    </button>
                  </div>
                  
                  {transactions.length === 0 ? (
                    <div className="text-center py-20 opacity-30 text-white">
                      <History size={64} className="mx-auto mb-4" />
                      <p className="font-bold uppercase tracking-widest text-sm">Sin movimientos aún</p>
                    </div>
                  ) : (
                    <div className="space-y-4 text-white">
                      {transactions.map((tx, idx) => (
                        <div key={tx.id || idx} className="flex items-center justify-between p-5 rounded-3xl bg-black/20 border border-white/5">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                              tx.points > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                            }`}>
                              {tx.points > 0 ? <TrendingUp size={20} /> : <TrendingUp size={20} className="rotate-180" />}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">{tx.description}</p>
                              <p className="text-[10px] text-gray-500">{new Date(tx.createdAt).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className={`text-lg font-black ${tx.points > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {tx.points > 0 ? '+' : ''}{tx.points}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

        {/* Modal de Referidos */}
        {createPortal(
          <AnimatePresence>
            {showReferrals && (
              <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowReferrals(false)}
                  className="absolute inset-0 bg-black/80 backdrop-blur-md"
                />
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="relative bg-[#111a24] w-full max-w-lg rounded-[40px] border border-white/10 p-10 max-h-[80vh] overflow-y-auto custom-scrollbar shadow-2xl text-white"
                >
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-2xl font-black uppercase tracking-tighter text-white">Amigos Invitados</h3>
                    <button onClick={() => setShowReferrals(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors text-white">
                      <X size={24} />
                    </button>
                  </div>
                  
                  {referrals.length === 0 ? (
                    <div className="text-center py-20 opacity-30 text-white">
                      <Users size={64} className="mx-auto mb-4" />
                      <p className="font-bold uppercase tracking-widest text-sm">Aún no has invitado a nadie</p>
                    </div>
                  ) : (
                    <div className="space-y-4 text-white">
                      {referrals.map((ref, idx) => (
                        <div key={ref.id || idx} className="flex items-center justify-between p-5 rounded-3xl bg-black/20 border border-white/5">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                              <Star size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">{ref.fullName}</p>
                              <p className="text-[10px] text-gray-500">Se unió el {new Date(ref.createdAt).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full">
                            +30 PTS
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

        {/* Modal de Mis Compras */}
        {createPortal(
          <AnimatePresence>
            {showOrders && (
              <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowOrders(false)}
                  className="absolute inset-0 bg-black/80 backdrop-blur-md"
                />
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="relative bg-[#111a24] w-full max-w-lg rounded-[40px] border border-white/10 p-10 max-h-[80vh] overflow-y-auto custom-scrollbar shadow-2xl text-white"
                >
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-2xl font-black uppercase tracking-tighter text-white">Mis Compras</h3>
                    <button onClick={() => setShowOrders(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors text-white">
                      <X size={24} />
                    </button>
                  </div>
                  
                  {orders.length === 0 ? (
                    <div className="text-center py-20 opacity-30 text-white">
                      <ShoppingBag size={64} className="mx-auto mb-4" />
                      <p className="font-bold uppercase tracking-widest text-sm">No tenés compras aún</p>
                    </div>
                  ) : (
                    <div className="space-y-6 text-white">
                      {orders.map((order, idx) => (
                        <div key={order.id || idx} className="p-6 rounded-[24px] bg-[#1a232d] border border-white/10 shadow-lg relative overflow-hidden">
                          {/* Order Header */}
                          <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-4">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-1">Orden #{order.id.substring(0, 6).toUpperCase()}</p>
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-medium text-gray-400">{new Date(order.createdAt).toLocaleDateString()}</p>
                                <span className="w-1 h-1 rounded-full bg-gray-600 border border-transparent" />
                                <p className="text-xs font-black uppercase tracking-widest text-gray-300">{order.status || 'PROCESANDO'}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Total</p>
                              <p className="text-xl font-black text-white">${order.total.toLocaleString('es-AR')}</p>
                            </div>
                          </div>

                          {/* Order Items */}
                          <div className="space-y-4">
                            {order.items?.map((item: any, i: number) => (
                              <div key={i} className="flex gap-4 items-center bg-black/20 p-3 rounded-2xl border border-white/5">
                                <div className="w-14 h-14 rounded-xl bg-black/40 flex-shrink-0 border border-white/5 overflow-hidden">
                                  {item.image ? (
                                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                                      <ShoppingBag size={20} />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-white truncate">{item.name}</p>
                                  <p className="text-[10px] text-gray-400 font-medium">Cant: <span className="text-white">{item.quantity}</span></p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-emerald-400">${(item.price * item.quantity).toLocaleString('es-AR')}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                          
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
      </div>
    </>
  );
};
