import React, { useState, useRef } from 'react';
import { Camera, Upload, Trash2, Check, Star, Sparkles, Image as ImageIcon, X, AlertCircle } from 'lucide-react';
import { ShootEvent, EnvironmentReference } from '../types';
import { resizeImageFile } from '../lib/imageProcessor';
import { saveImageToDB, deleteImageFromDB } from '../lib/imageStorage';
import { backupEnvironmentImage } from '../lib/cloudBackup';
import { motion, AnimatePresence } from 'motion/react';

interface EnvironmentSectionProps {
  event: ShootEvent;
  onUpdateEvent: (updates: Partial<ShootEvent>) => void;
}

export function EnvironmentSection({ event, onUpdateEvent }: EnvironmentSectionProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New Environment Modal State
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [envName, setEnvName] = useState('');
  const [envDescription, setEnvDescription] = useState('');

  // Delete confirmation
  const [deletingEnvId, setDeletingEnvId] = useState<string | null>(null);

  // Lightbox preview
  const [previewEnv, setPreviewEnv] = useState<EnvironmentReference | null>(null);

  const environments = event.environments || [];
  const activeEnvId = event.activeEnvironmentId || (environments.length > 0 ? environments[0].id : undefined);

  const handleFileSelected = async (file: File) => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // Downsample/optimize camera photo to practical resolution for storage and API transmission
      const dataUrl = await resizeImageFile(file, { maxDimension: 1600, quality: 0.85 });
      setPendingImageUrl(dataUrl);

      // Default numbered name
      const nextNum = (environments.length + 1).toString().padStart(2, '0');
      setEnvName(`Environment ${nextNum}`);
      setEnvDescription('');
      setShowSaveModal(true);
    } catch (err: any) {
      console.error('Failed to process environment photo:', err);
      setErrorMessage(err?.message || 'Unable to process this photograph. Please try another image.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveEnvironment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pendingImageUrl) return;

    const trimmedName = envName.trim() || `Environment ${(environments.length + 1).toString().padStart(2, '0')}`;
    const newEnvId = `env_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newEnv: EnvironmentReference = {
      id: newEnvId,
      name: trimmedName,
      imageUrl: pendingImageUrl,
      capturedAt: new Date().toISOString(),
      description: envDescription.trim() || undefined,
    };

    try {
      // Save full photo to IndexedDB for reliable offline persistence
      await saveImageToDB(`${event.id}_env_${newEnvId}`, pendingImageUrl);

      const updatedEnvs = [...environments, newEnv];
      const updates: Partial<ShootEvent> = {
        environments: updatedEnvs,
      };

      // If no active environment yet, activate this new one automatically
      if (!event.activeEnvironmentId || environments.length === 0) {
        updates.activeEnvironmentId = newEnvId;
      }

      onUpdateEvent(updates);
      setShowSaveModal(false);
      setPendingImageUrl(null);
      setEnvName('');
      setEnvDescription('');

      // Non-blocking asynchronous cloud backup (best-effort)
      backupEnvironmentImage(event.id, newEnv).catch(console.warn);
    } catch (err: any) {
      console.error('Failed to save environment:', err);
      setErrorMessage('Failed to save environment reference. Please try again.');
    }
  };

  const handleSetActive = (envId: string) => {
    onUpdateEvent({ activeEnvironmentId: envId });
  };

  const handleDeleteEnvironment = async (envId: string) => {
    try {
      await deleteImageFromDB(`${event.id}_env_${envId}`);

      const filteredEnvs = environments.filter((e) => e.id !== envId);
      const updates: Partial<ShootEvent> = {
        environments: filteredEnvs,
      };

      // If active environment is deleted, fall back to first remaining or undefined
      if (activeEnvId === envId) {
        updates.activeEnvironmentId = filteredEnvs.length > 0 ? filteredEnvs[0].id : undefined;
      }

      // If any poses had this specific environment assigned, reset to undefined (falls back to active)
      if (event.poses && event.poses.length > 0) {
        const updatedPoses = event.poses.map((p) => {
          if (p.environmentId === envId) {
            const copy = { ...p };
            delete copy.environmentId;
            return copy;
          }
          return p;
        });
        updates.poses = updatedPoses;
      }

      onUpdateEvent(updates);
      setDeletingEnvId(null);
    } catch (err: any) {
      console.error('Failed to delete environment:', err);
    }
  };

  // Count how many poses are grounded in a specific environment
  const getPoseCountForEnv = (envId: string) => {
    if (!event.poses) return 0;
    return event.poses.filter((p) => {
      if (p.environmentId) {
        return p.environmentId === envId;
      }
      return activeEnvId === envId;
    }).length;
  };

  return (
    <div className="w-full bg-[#161616] border border-[#2A2A2A] rounded-2xl p-5 sm:p-7 space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#242424] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] font-bold">
              Venue & Location Reference
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-light text-white tracking-tight">
            Environment References
          </h3>
          <p className="text-xs text-[#A1A1AA] mt-1 font-light max-w-2xl leading-relaxed">
            Photograph actual venue spaces (Reception Lounge, Mandap, Stage, Corridor) using your phone camera. AI reference generation will preserve the recognizable architecture, furniture, and decor.
          </p>
        </div>

        {/* Action Buttons (Large touch-friendly for mobile) */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
          {/* Native Mobile Camera Input */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelected(e.target.files[0]);
              }
              e.target.value = '';
            }}
          />

          {/* Standard Upload File Input */}
          <input
            ref={uploadInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelected(e.target.files[0]);
              }
              e.target.value = '';
            }}
          />

          {/* Take Photo Button (Primary on Mobile) */}
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={isProcessing}
            className="min-h-[44px] px-4 py-2.5 bg-[#D4AF37] hover:bg-white text-black font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50 flex-1 sm:flex-initial"
          >
            <Camera size={16} />
            <span>Take Photo</span>
          </button>

          {/* Upload Photo Button */}
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={isProcessing}
            className="min-h-[44px] px-4 py-2.5 bg-[#222] hover:bg-[#2C2C2C] text-white border border-[#333] hover:border-[#D4AF37]/50 font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 flex-1 sm:flex-initial"
          >
            <Upload size={15} />
            <span>Upload Photo</span>
          </button>
        </div>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="p-3.5 bg-red-950/40 border border-red-900/60 rounded-xl text-red-200 text-xs flex items-center gap-2.5">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Empty State */}
      {environments.length === 0 ? (
        <div className="p-8 border border-dashed border-[#2E2E2E] rounded-xl bg-[#121212] text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#1E1E1E] border border-[#333] flex items-center justify-center mx-auto text-[#D4AF37]">
            <Camera size={22} />
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">No Venue Environments Captured Yet</h4>
            <p className="text-xs text-[#888] mt-1 max-w-md mx-auto leading-relaxed">
              Arrive at the shoot location and photograph the key areas. These photos ground your AI pose references directly in the actual venue.
            </p>
          </div>
          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="text-xs uppercase tracking-wider font-bold text-[#D4AF37] hover:underline flex items-center gap-1.5"
            >
              <Camera size={14} />
              <span>Tap to Take First Photo</span>
            </button>
          </div>
        </div>
      ) : (
        /* Environments Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {environments.map((env, index) => {
            const isActive = activeEnvId === env.id;
            const poseCount = getPoseCountForEnv(env.id);

            return (
              <div
                key={env.id}
                className={`group relative rounded-xl border transition-all overflow-hidden flex flex-col ${
                  isActive
                    ? 'bg-[#1C1C1C] border-[#D4AF37] shadow-lg shadow-[#D4AF37]/5'
                    : 'bg-[#141414] border-[#2A2A2A] hover:border-[#3E3E3E]'
                }`}
              >
                {/* Image Thumbnail with Aspect Ratio */}
                <div
                  onClick={() => setPreviewEnv(env)}
                  className="relative aspect-[4/3] bg-black cursor-pointer overflow-hidden group/img"
                >
                  <img
                    src={env.imageUrl}
                    alt={env.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover/img:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />

                  {/* Environment Number Badge */}
                  <span className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-black/80 backdrop-blur-md text-[#D4AF37] border border-[#D4AF37]/30 text-[10px] font-mono font-bold rounded">
                    {(index + 1).toString().padStart(2, '0')}
                  </span>

                  {/* Active Badge */}
                  {isActive && (
                    <span className="absolute top-2.5 right-2.5 px-2.5 py-1 bg-[#D4AF37] text-black text-[9px] font-bold uppercase tracking-wider rounded-full shadow-md flex items-center gap-1">
                      <Star size={10} fill="currentColor" />
                      <span>Active</span>
                    </span>
                  )}

                  {/* Poses Count Overlay */}
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-[11px] text-white/90">
                    <span className="font-semibold truncate drop-shadow">{env.name}</span>
                    <span className="text-[10px] text-white/70 bg-black/60 px-2 py-0.5 rounded backdrop-blur-sm shrink-0">
                      {poseCount} {poseCount === 1 ? 'pose' : 'poses'}
                    </span>
                  </div>
                </div>

                {/* Card Controls */}
                <div className="p-3.5 bg-[#141414] flex items-center justify-between gap-2 mt-auto border-t border-[#222]">
                  {!isActive ? (
                    <button
                      onClick={() => handleSetActive(env.id)}
                      className="text-[10px] uppercase tracking-wider font-bold text-[#A1A1AA] hover:text-[#D4AF37] flex items-center gap-1.5 transition-colors py-1 px-2 rounded hover:bg-[#1E1E1E]"
                    >
                      <Check size={12} />
                      <span>Set as Active</span>
                    </button>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[#D4AF37] flex items-center gap-1.5 py-1 px-2">
                      <Star size={12} fill="currentColor" />
                      <span>Default for Poses</span>
                    </span>
                  )}

                  {/* Delete Environment Button */}
                  <button
                    onClick={() => setDeletingEnvId(env.id)}
                    className="p-1.5 text-[#777] hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors"
                    title="Delete environment"
                    aria-label="Delete environment"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================
          SAVE ENVIRONMENT MODAL (Prompt for name & preview)
          ======================================================== */}
      <AnimatePresence>
        {showSaveModal && pendingImageUrl && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSaveModal(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%', opacity: 0.8 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              className="relative w-full sm:max-w-md bg-[#141414] border-t sm:border border-[#2E2E2E] rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 z-10 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] font-bold block mb-1">
                    Captured Photo
                  </span>
                  <h3 className="text-lg font-light text-white">Save Environment Reference</h3>
                </div>
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="p-1.5 text-[#888] hover:text-white bg-[#1E1E1E] rounded-full"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Photo Preview */}
              <div className="relative aspect-[16/10] bg-black rounded-xl overflow-hidden border border-[#2A2A2A]">
                <img
                  src={pendingImageUrl}
                  alt="Captured venue environment"
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Form */}
              <form onSubmit={handleSaveEnvironment} className="space-y-3.5">
                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase tracking-widest text-[#A1A1AA] font-bold">
                    Environment Name
                  </label>
                  <input
                    type="text"
                    required
                    value={envName}
                    onChange={(e) => setEnvName(e.target.value)}
                    placeholder="e.g., Reception Lounge, Main Stage, Mandap, Garden"
                    className="w-full bg-[#0D0D0D] border border-[#333] focus:border-[#D4AF37] rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {['Reception Lounge', 'Main Stage', 'Mandap', 'Bridal Room', 'Garden Setup', 'Corridor'].map((sugg) => (
                      <button
                        key={sugg}
                        type="button"
                        onClick={() => setEnvName(sugg)}
                        className="text-[10px] px-2 py-0.5 bg-[#1C1C1C] hover:bg-[#252525] text-[#A1A1AA] hover:text-white border border-[#2E2E2E] rounded transition-colors"
                      >
                        {sugg}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] uppercase tracking-widest text-[#A1A1AA]">
                    Optional Notes (Decor / Lighting)
                  </label>
                  <input
                    type="text"
                    value={envDescription}
                    onChange={(e) => setEnvDescription(e.target.value)}
                    placeholder="e.g., Warm chandeliers, floral arches, velvet sofa"
                    className="w-full bg-[#0D0D0D] border border-[#333] focus:border-[#D4AF37] rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-[#555] focus:outline-none transition-colors"
                  />
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowSaveModal(false)}
                    className="flex-1 h-11 bg-[#1E1E1E] hover:bg-[#282828] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] h-11 bg-[#D4AF37] hover:bg-white text-black text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg"
                  >
                    <Check size={14} />
                    <span>Save Environment</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          DELETE CONFIRMATION MODAL
          ======================================================== */}
      <AnimatePresence>
        {deletingEnvId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingEnvId(null)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm bg-[#141414] border border-[#2E2E2E] rounded-2xl p-5 z-10 shadow-2xl space-y-3"
            >
              <h4 className="text-base font-light text-white">Delete Environment Reference?</h4>
              <p className="text-xs text-[#A1A1AA] leading-relaxed">
                This will remove the venue photograph. Poses will remain intact and fall back to the active environment or default location settings.
              </p>
              <div className="pt-2 flex items-center gap-2.5">
                <button
                  onClick={() => setDeletingEnvId(null)}
                  className="flex-1 h-10 bg-[#1E1E1E] hover:bg-[#282828] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteEnvironment(deletingEnvId)}
                  className="flex-1 h-10 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          FULL RESOLUTION PREVIEW MODAL (LIGHTBOX)
          ======================================================== */}
      <AnimatePresence>
        {previewEnv && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewEnv(null)}
              className="fixed inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative max-w-3xl w-full bg-[#111] border border-[#2E2E2E] rounded-2xl overflow-hidden z-10 shadow-2xl"
            >
              <div className="p-4 border-b border-[#222] flex items-center justify-between bg-[#161616]">
                <div>
                  <h4 className="text-sm font-semibold text-white">{previewEnv.name}</h4>
                  {previewEnv.description && (
                    <p className="text-xs text-[#888] mt-0.5">{previewEnv.description}</p>
                  )}
                </div>
                <button
                  onClick={() => setPreviewEnv(null)}
                  className="p-1.5 text-[#888] hover:text-white bg-[#222] rounded-full"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="max-h-[75vh] overflow-hidden flex items-center justify-center bg-black">
                <img
                  src={previewEnv.imageUrl}
                  alt={previewEnv.name}
                  className="max-w-full max-h-[75vh] object-contain"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
