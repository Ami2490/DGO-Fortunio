/**
 * ThemePanel — Panel de configuración visual con soporte dual modo claro/oscuro.
 * Permite editar ambos modos de forma independiente por plantilla.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, Sun, Moon, Check, ChevronDown, RotateCcw } from 'lucide-react';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ModeColors {
  color1: string;       // Color primario (ej: verde esmeralda)
  color2: string;       // Color secundario
  bgPage: string;       // Fondo general de página
  bgCard: string;       // Fondo de contenedores / cards
  bgFooter: string;     // Fondo del footer
  textMain: string;     // Texto principal
  textMuted: string;    // Texto secundario / atenuado
  borderColor: string;  // Color de bordes
}

interface ThemeTemplate {
  id: string;
  name: string;
  dark: ModeColors;
  light: ModeColors;
}

interface ThemePanelProps {
  tenantId?: string;
  currentTheme?: any;
  isDarkMode: boolean;
  onToggleMode: () => void;
  onThemeChange: (theme: any) => void;
  inline?: boolean;
}

// ─── Plantillas Predefinidas ───────────────────────────────────────────────────

const PRESET_TEMPLATES: ThemeTemplate[] = [
  {
    id: 'dgo-original',
    name: 'DGO Original',
    dark: {
      color1: '#10b981',
      color2: '#06b6d4',
      bgPage: '#0a0f16',
      bgCard: '#111a24',
      bgFooter: '#0d1520',
      textMain: '#ffffff',
      textMuted: '#94a3b8',
      borderColor: 'rgba(255,255,255,0.08)',
    },
    light: {
      color1: '#10b981',
      color2: '#06b6d4',
      bgPage: '#f8fafc',
      bgCard: '#ffffff',
      bgFooter: '#e8ecf0',
      textMain: '#0f172a',
      textMuted: '#475569',
      borderColor: 'rgba(0,0,0,0.1)',
    },
  },
  {
    id: 'slate-pro',
    name: 'Slate Pro',
    dark: {
      color1: '#6366f1',
      color2: '#8b5cf6',
      bgPage: '#0f172a',
      bgCard: '#1e293b',
      bgFooter: '#0f172a',
      textMain: '#f1f5f9',
      textMuted: '#94a3b8',
      borderColor: 'rgba(255,255,255,0.08)',
    },
    light: {
      color1: '#6366f1',
      color2: '#8b5cf6',
      bgPage: '#f1f5f9',
      bgCard: '#ffffff',
      bgFooter: '#e2e8f0',
      textMain: '#0f172a',
      textMuted: '#475569',
      borderColor: 'rgba(0,0,0,0.08)',
    },
  },
  {
    id: 'amber-warm',
    name: 'Amber Warm',
    dark: {
      color1: '#f59e0b',
      color2: '#ef4444',
      bgPage: '#1c1008',
      bgCard: '#2a1a0a',
      bgFooter: '#1a1005',
      textMain: '#fef3c7',
      textMuted: '#d97706',
      borderColor: 'rgba(245,158,11,0.15)',
    },
    light: {
      color1: '#d97706',
      color2: '#dc2626',
      bgPage: '#fffbeb',
      bgCard: '#ffffff',
      bgFooter: '#fef3c7',
      textMain: '#1c1917',
      textMuted: '#78350f',
      borderColor: 'rgba(0,0,0,0.08)',
    },
  },
];

// ─── Campos editables del panel ───────────────────────────────────────────────

const COLOR_FIELDS: { key: keyof ModeColors; label: string; description: string }[] = [
  { key: 'color1', label: 'Color Principal', description: 'Botones, acentos, íconos activos' },
  { key: 'color2', label: 'Color Secundario', description: 'Degradados y efectos decorativos' },
  { key: 'bgPage', label: 'Fondo de Página', description: 'Fondo general de toda la web' },
  { key: 'bgCard', label: 'Fondo de Cards', description: 'Contenedores, modales, carrito' },
  { key: 'bgFooter', label: 'Fondo del Footer', description: 'Sección inferior de la web' },
  { key: 'textMain', label: 'Texto Principal', description: 'Títulos y textos importantes' },
  { key: 'textMuted', label: 'Texto Secundario', description: 'Subtítulos, descripciones, labels' },
  { key: 'borderColor', label: 'Color de Bordes', description: 'Bordes de cards y separadores' },
];

// ─── Función que aplica el tema al DOM ─────────────────────────────────────────

function applyModeColors(colors: ModeColors, isDark: boolean) {
  const root = document.documentElement;
  root.style.setProperty('--p', colors.color1);
  root.style.setProperty('--s', colors.color2);
  root.style.setProperty('--bg', colors.bgPage);
  root.style.setProperty('--card', colors.bgCard);
  root.style.setProperty('--footer-bg', colors.bgFooter);
  root.style.setProperty('--text', colors.textMain);
  root.style.setProperty('--text-muted', colors.textMuted);
  root.style.setProperty('--border', colors.borderColor);
  root.style.setProperty('--border-soft', colors.borderColor);
  root.style.setProperty('--header', isDark
    ? `${colors.bgPage}dd`
    : `${colors.bgCard}e6`
  );
}

// ─── Componente Principal ──────────────────────────────────────────────────────

export function ThemePanel({ tenantId, currentTheme, isDarkMode, onToggleMode, onThemeChange, inline = false }: ThemePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<'dark' | 'light'>(isDarkMode ? 'dark' : 'light');
  const [selectedTemplateId, setSelectedTemplateId] = useState('dgo-original');
  const [customTemplate, setCustomTemplate] = useState<ThemeTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sincronizar modo activo con el toggle global
  useEffect(() => {
    setActiveMode(isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Cargar template activo desde localStorage si existe
  useEffect(() => {
    try {
      const stored = localStorage.getItem('dgo-custom-theme');
      if (stored) {
        const parsed = JSON.parse(stored);
        setCustomTemplate(parsed);
        setSelectedTemplateId(parsed.id);
      }
    } catch {}
  }, []);

  const activeTemplate: ThemeTemplate = customTemplate && customTemplate.id === selectedTemplateId
    ? customTemplate
    : (PRESET_TEMPLATES.find(t => t.id === selectedTemplateId) || PRESET_TEMPLATES[0]);

  const currentModeColors = activeTemplate[activeMode];

  // Aplicar colores del modo activo en tiempo real al cambiar
  useEffect(() => {
    applyModeColors(currentModeColors, activeMode === 'dark');
  }, [currentModeColors, activeMode]);

  function handleColorChange(key: keyof ModeColors, value: string) {
    const base = { ...activeTemplate };
    base[activeMode] = { ...base[activeMode], [key]: value };
    // Marcar como custom
    base.id = selectedTemplateId.startsWith('custom-') ? selectedTemplateId : `custom-${selectedTemplateId}`;
    base.name = activeTemplate.name;
    setCustomTemplate(base);
    setSelectedTemplateId(base.id);
  }

  function handleSelectPreset(templateId: string) {
    setSelectedTemplateId(templateId);
    setCustomTemplate(null);
    localStorage.removeItem('dgo-custom-theme');
    const preset = PRESET_TEMPLATES.find(t => t.id === templateId);
    if (preset) {
      applyModeColors(preset[activeMode], activeMode === 'dark');
    }
  }

  function handleReset() {
    const baseId = selectedTemplateId.replace('custom-', '');
    const preset = PRESET_TEMPLATES.find(t => t.id === baseId) || PRESET_TEMPLATES[0];
    setSelectedTemplateId(preset.id);
    setCustomTemplate(null);
    localStorage.removeItem('dgo-custom-theme');
    applyModeColors(preset[activeMode], activeMode === 'dark');
  }

  async function handleSave() {
    setSaving(true);
    try {
      const themeToSave = customTemplate || activeTemplate;

      // Persistir en localStorage para carga inmediata
      localStorage.setItem('dgo-custom-theme', JSON.stringify(themeToSave));

      // Persistir en Firestore para multi-dispositivo
      const themePayload = {
        primaryColor: themeToSave[activeMode].color1,
        secondaryColor: themeToSave[activeMode].color2,
        defaultMode: activeMode,
        customTheme: themeToSave,
        borderRadius: currentTheme?.borderRadius || '1rem',
        fontBase: currentTheme?.fontBase || 'Inter',
        updatedAt: new Date().toISOString(),
      };

      // Si tenemos tenantId usamos la ruta de tenants, si no la ruta raíz de config (siteConfig)
      const configDocPath = tenantId 
        ? doc(db, 'tenants', tenantId, 'config', 'site')
        : doc(db, 'config', 'siteConfig');

      await setDoc(configDocPath, { theme: themePayload }, { merge: true });

      onThemeChange(themePayload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error('Error guardando tema:', err);
    }
    setSaving(false);
  }

  const content = (
    <div className={`flex flex-col h-full ${inline ? '' : 'bg-[var(--card)] text-[var(--text)]'}`}>
      {/* Header */}
      {!inline && (
        <div className="p-6 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-[var(--text)]">Panel de Tema</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mt-0.5">Personalización Visual</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-xl hover:bg-[var(--text)]/5 transition-colors"
            aria-label="Cerrar panel"
          >
            <ChevronDown className="w-5 h-5 rotate-90 text-[var(--text-muted)]" />
          </button>
        </div>
      )}

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto">

        {/* Selector modo claro/oscuro */}
        <div className="p-6 border-b border-[var(--border)]">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">Modo de Visualización</p>
          <div className="flex gap-2">
            <button
              onClick={() => { setActiveMode('dark'); if (!isDarkMode) onToggleMode(); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                activeMode === 'dark'
                  ? 'bg-[var(--p)] text-white border-[var(--p)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--p)]/50'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              Oscuro
            </button>
            <button
              onClick={() => { setActiveMode('light'); if (isDarkMode) onToggleMode(); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                activeMode === 'light'
                  ? 'bg-[var(--p)] text-white border-[var(--p)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--p)]/50'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              Claro
            </button>
          </div>
          <p className="text-[9px] text-[var(--text-muted)] mt-2 tracking-wide">
            Editás los colores del modo <strong>{activeMode === 'dark' ? 'oscuro' : 'claro'}</strong> de forma independiente.
          </p>
        </div>

        {/* Plantillas predefinidas */}
        <div className="p-6 border-b border-[var(--border)]">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">Plantillas</p>
          <div className="space-y-2">
            {PRESET_TEMPLATES.map(tpl => {
              const isActive = selectedTemplateId === tpl.id || selectedTemplateId === `custom-${tpl.id}`;
              return (
                <button
                  key={tpl.id}
                  onClick={() => handleSelectPreset(tpl.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-bold transition-all ${
                    isActive
                      ? 'border-[var(--p)] bg-[var(--p)]/10 text-[var(--text)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--p)]/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      <div className="w-4 h-4 rounded-full border border-[var(--border)]" style={{ backgroundColor: tpl[activeMode].color1 }} />
                      <div className="w-4 h-4 rounded-full border border-[var(--border)]" style={{ backgroundColor: tpl[activeMode].bgCard }} />
                      <div className="w-4 h-4 rounded-full border border-[var(--border)]" style={{ backgroundColor: tpl[activeMode].bgPage }} />
                    </div>
                    {tpl.name}
                  </div>
                  {isActive && <Check className="w-4 h-4 text-[var(--p)]" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Editor de colores */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Colores — Modo {activeMode === 'dark' ? 'Oscuro' : 'Claro'}
            </p>
            <button
              onClick={handleReset}
              className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--p)] transition-colors"
              title="Restaurar valores originales"
            >
              <RotateCcw className="w-3 h-3" />
              Resetear
            </button>
          </div>
          <div className="space-y-4">
            {COLOR_FIELDS.map(field => (
              <div key={field.key} className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--text)] truncate">{field.label}</p>
                  <p className="text-[9px] text-[var(--text-muted)] truncate">{field.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono text-[var(--text-muted)] w-20 text-right truncate">
                    {currentModeColors[field.key]}
                  </span>
                  <div
                    className="w-9 h-9 rounded-xl border-2 border-[var(--border)] overflow-hidden cursor-pointer hover:scale-110 transition-transform shadow-sm relative"
                    title={`Editar ${field.label}`}
                  >
                    <input
                      type="color"
                      value={currentModeColors[field.key].startsWith('#') ? currentModeColors[field.key] : '#10b981'}
                      onChange={e => handleColorChange(field.key, e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      aria-label={`Color para ${field.label}`}
                    />
                    <div
                      className="w-full h-full pointer-events-none"
                      style={{ backgroundColor: currentModeColors[field.key] }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer con botón guardar */}
      <div className={`p-6 border-t border-[var(--border)] shrink-0 ${inline ? 'rounded-b-[40px]' : ''}`} style={{ backgroundColor: 'var(--bg)' }}>
        <p className="text-[9px] text-[var(--text-muted)] mb-4 leading-relaxed">
          Los cambios se aplican en tiempo real. Al guardar se actualizan ambos modos en todos los dispositivos.
        </p>
        <motion.button
          onClick={handleSave}
          disabled={saving}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm text-white transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ backgroundColor: 'var(--p)', boxShadow: `0 8px 24px color-mix(in srgb, var(--p) 30%, transparent)` }}
        >
          {saving ? (
            <span className="animate-pulse">Guardando...</span>
          ) : saved ? (
            <><Check className="w-4 h-4" /> Guardado</>
          ) : (
            'Guardar Tema'
          )}
        </motion.button>
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className="bg-[#111a24] rounded-[40px] border border-white/10 shadow-xl overflow-hidden max-w-2xl mx-auto">
        {content}
      </div>
    );
  }

  return (
    <>
      {/* Botón flotante */}
      <motion.button
        onClick={() => setIsOpen(true)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 left-6 z-[200] w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl border border-[var(--border)] hover:brightness-110 transition-all"
        style={{ backgroundColor: 'var(--p)' }}
        title="Panel de Tema"
        aria-label="Abrir panel de tema"
      >
        <Palette className="w-5 h-5 text-white" />
      </motion.button>

      {/* Panel lateral */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[300]"
            />

            {/* Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed top-0 left-0 bottom-0 w-[340px] z-[310] flex flex-col shadow-2xl border-r border-[var(--border)] overflow-hidden"
              style={{ backgroundColor: 'var(--card)', color: 'var(--text)' }}
            >
              {content}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default ThemePanel;
