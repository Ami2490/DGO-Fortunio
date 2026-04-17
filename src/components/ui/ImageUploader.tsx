import React, { useState, useRef, useCallback } from 'react';

import {
  Upload, X, CheckCircle, AlertCircle,
  Loader2, Image as ImageIcon, Link
} from 'lucide-react';
import {
  uploadToCloudinary,
  validateImageFile,
  formatFileSize,
  type UploadFolder
} from '../../services/cloudinaryService';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ImageUploaderProps {
  /** URL actual de la imagen (para mostrar preview inicial) */
  currentUrl?: string;
  /** Carpeta destino en Cloudinary */
  folder?: UploadFolder;
  /** Callback al completar la subida con la nueva URL segura */
  onUploaded: (url: string) => void;
  /** Texto auxiliar (ej: "Imagen del producto") */
  label?: string;
  /** Modo compacto para usar inline en formularios */
  compact?: boolean;
  /** Permite también pegar una URL directamente */
  allowUrl?: boolean;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function ImageUploader({
  currentUrl = '',
  folder = 'general',
  onUploaded,
  label = 'Imagen',
  compact = false,
  allowUrl = true,
}: ImageUploaderProps) {
  const [preview, setPreview]     = useState<string>(currentUrl);
  const [progress, setProgress]   = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState<string>('');
  const [success, setSuccess]     = useState(false);
  const [dragging, setDragging]   = useState(false);
  const [urlMode, setUrlMode]     = useState(false);
  const [urlInput, setUrlInput]   = useState(currentUrl);
  const [fileInfo, setFileInfo]   = useState<{ name: string; size: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // ── Procesar archivo ──────────────────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    setError('');
    setSuccess(false);

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(validation.error!);
      return;
    }

    // Preview local inmediata mientras sube
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setFileInfo({ name: file.name, size: file.size });
    setUploading(true);
    setProgress(0);

    try {
      const result = await uploadToCloudinary(file, folder, (pct) => setProgress(pct));
      setPreview(result.url);
      setSuccess(true);
      setProgress(100);
      onUploaded(result.url);
      // Limpiar memory URI
      URL.revokeObjectURL(localUrl);
    } catch (err: any) {
      setError(err.message || 'Error al subir la imagen. Revisá las credenciales de Cloudinary.');
      setPreview(currentUrl); // revert al original
    } finally {
      setUploading(false);
    }
  }, [folder, currentUrl, onUploaded]);

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  // ── Input normal ──────────────────────────────────────────────────────────
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  // ── URL directa ───────────────────────────────────────────────────────────
  const applyUrl = () => {
    if (!urlInput.trim()) return;
    setPreview(urlInput.trim());
    setSuccess(true);
    setUrlMode(false);
    onUploaded(urlInput.trim());
  };

  // ── Limpiar ───────────────────────────────────────────────────────────────
  const clear = () => {
    setPreview('');
    setUrlInput('');
    setFileInfo(null);
    setError('');
    setSuccess(false);
    setProgress(0);
    onUploaded('');
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (urlMode) {
    return (
      <div className="space-y-2">
        {label && <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">{label}</label>}
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyUrl()}
            placeholder="https://res.cloudinary.com/..."
            className="flex-1 bg-[#0a1118] border border-white/5 rounded-xl px-4 py-3 text-[10px] font-bold text-white outline-none focus:border-emerald-500/50 transition-colors"
          />
          <button onClick={applyUrl} className="px-4 py-3 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-colors">
            Usar
          </button>
          <button onClick={() => setUrlMode(false)} className="px-4 py-3 bg-white/5 text-gray-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</label>
          {allowUrl && (
            <button
              onClick={() => setUrlMode(true)}
              className="flex items-center gap-1 text-[9px] font-black text-gray-600 hover:text-emerald-500 transition-colors uppercase tracking-widest"
            >
              <Link size={10} /> Pegar URL
            </button>
          )}
        </div>
      )}

      {/* Preview / Drop zone */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`relative rounded-2xl border-2 border-dashed cursor-pointer overflow-hidden transition-all ${
          dragging
            ? 'border-emerald-500 bg-emerald-500/10 scale-[1.01]'
            : preview
            ? 'border-white/10 bg-[#0a1118]'
            : 'border-white/10 bg-[#0a1118] hover:border-emerald-500/50 hover:bg-emerald-500/5'
        } ${compact ? 'h-28' : 'h-44'}`}
      >
        {/* Imagen preview */}
        {preview && !uploading && (
          <>
            <img
              src={preview}
              alt="Preview"
              className="w-full h-full object-cover opacity-80"
              onError={() => { setPreview(''); setError('No se pudo cargar la imagen.'); }}
            />
            {/* Overlay con botón de quitarla */}
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); /* abre file picker */ inputRef.current?.click(); }}
                className="px-3 py-2 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-colors"
              >
                Cambiar
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); clear(); }}
                className="p-2 bg-red-500/80 text-white rounded-xl hover:bg-red-600 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </>
        )}

        {/* Estado sin imagen */}
        {!preview && !uploading && (
          <div className="h-full flex flex-col items-center justify-center gap-3 px-4">
            <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center">
              <Upload size={18} className="text-gray-500" />
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                {dragging ? 'Soltá la imagen aquí' : 'Arrastrá o hacé click'}
              </p>
              <p className="text-[9px] text-gray-600 font-bold mt-0.5">JPG, PNG, WebP — máx. 10MB</p>
            </div>
          </div>
        )}

        {/* Estado subiendo */}
        {uploading && (
          <div className="h-full flex flex-col items-center justify-center gap-4 bg-[#0a1118]">
            {preview && (
              <img src={preview} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
            )}
            <div className="relative z-10 flex flex-col items-center gap-3">
              <Loader2 size={24} className="text-emerald-500 animate-spin" />
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Subiendo... {progress}%
              </p>
              {/* Barra de progreso */}
              <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {fileInfo && (
                <p className="text-[9px] text-gray-600 font-bold">
                  {fileInfo.name} — {formatFileSize(fileInfo.size)}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Estado / error / éxito */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertCircle size={12} className="text-red-500 flex-shrink-0" />
          <p className="text-[9px] font-black text-red-400 uppercase tracking-widest">{error}</p>
        </div>
      )}
      {success && !error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <CheckCircle size={12} className="text-emerald-500 flex-shrink-0" />
          <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">
            Imagen subida exitosamente a Cloudinary
          </p>
        </div>
      )}

      {/* Input de archivo oculto */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/avif"
        onChange={onFileChange}
        className="hidden"
      />
    </div>
  );
}
