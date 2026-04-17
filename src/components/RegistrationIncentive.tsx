import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, X, Star, Users } from 'lucide-react';

interface RegistrationIncentiveProps {
  onRegisterClick: () => void;
  isLoggedIn: boolean;
}

export const RegistrationIncentive: React.FC<RegistrationIncentiveProps> = ({ onRegisterClick, isLoggedIn }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      const timer = setTimeout(() => {
        const dismissed = localStorage.getItem('registration_incentive_dismissed');
        if (!dismissed) setShow(true);
      }, 5000); // Mostrar a los 5 segundos
      return () => clearTimeout(timer);
    }
  }, [isLoggedIn]);

  if (isLoggedIn) return null;

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
          >
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-4 flex justify-between items-center text-white">
            <div className="flex items-center gap-2">
              <Gift size={20} className="animate-bounce" />
              <span className="font-bold">¡Regalo de Bienvenida!</span>
            </div>
            <button 
              onClick={() => {
                setShow(false);
                localStorage.setItem('registration_incentive_dismissed', 'true');
              }}
              className="hover:bg-white/20 p-1 rounded-full transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          
          <div className="p-6">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              Ganá 50 puntos al registrarte
            </h3>
            <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-4">
              Unite a nuestro programa de fidelidad, subí de nivel para obtener mejores descuentos y referí amigos para ganar más.
            </p>
            
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-lg text-amber-600">
                  <Star size={16} />
                </div>
                <span>Puntos por cada compra ($100 = 1 punto)</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg text-blue-600">
                  <Users size={16} />
                </div>
                <span>30 puntos por cada amigo que se registre</span>
              </div>
            </div>

            <button
              onClick={() => {
                onRegisterClick();
                setShow(false);
              }}
              className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold py-3 rounded-xl hover:opacity-90 transition-all transform active:scale-95"
            >
              Registrarme Ahora
            </button>
          </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
