import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Upload,
  AlertCircle,
  X,
  Check,
  Lock,
  FileText,
  Copy,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  RefreshCw,
  Edit3,
  MapPin,
  Image as ImageIcon,
} from 'lucide-react';
import { Pose, ShootEvent, ReferenceImageData, EnvironmentReference } from '../types';
import {
  ReferenceEngine,
  ReferenceProvider,
  ReferencePromptBuilder,
  ReferenceProviderId,
} from '../lib/referenceEngine';
import { fetchProviderStatuses } from '../lib/api';

interface ReferenceEngineModalProps {
  isOpen: boolean;
  onClose: () => void;
  pose: Pose | null;
  event?: ShootEvent;
  onSelectUpload: (pose: Pose, file: File) => void;
  onSelectAI?: (pose: Pose, refData: ReferenceImageData) => void;
}

export function ReferenceEngineModal({
  isOpen,
  onClose,
  pose,
  event,
  onSelectUpload,
  onSelectAI,
}: ReferenceEngineModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setTick] = useState(0);

  // Sync provider status from server on open
  useEffect(() => {
    if (isOpen) {
      fetchProviderStatuses()
        .then((status) => {
          ReferenceEngine.syncStatus(status.reference);
          setTick((t) => t + 1);
        })
        .catch((err) => {
          console.warn('Failed to sync reference provider status on modal open:', err);
        });
    }
  }, [isOpen]);

  const providers = ReferenceEngine.getProviders();

  // Environment Grounding State
  const [selectedEnvId, setSelectedEnvId] = useState<string | 'none'>('none');

  // Prompt inspector & review state
  const [activeStep, setActiveStep] = useState<'providers' | 'prompt_review'>('providers');
  const [selectedAIProvider, setSelectedAIProvider] = useState<ReferenceProvider | null>(null);
  const [promptText, setPromptText] = useState('');
  const [showPromptInspector, setShowPromptInspector] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const environments = event?.environments || [];

  // Determine active environment on mount/open
  useEffect(() => {
    if (event && pose) {
      const initialEnvId =
        pose.environmentId ||
        event.activeEnvironmentId ||
        (environments.length > 0 ? environments[0].id : 'none');
      setSelectedEnvId(initialEnvId || 'none');
    }
  }, [pose?.id, event?.id, isOpen]);

  const selectedEnvironment =
    selectedEnvId !== 'none' ? environments.find((e) => e.id === selectedEnvId) : undefined;

  // When pose, event, or selected environment changes, re-build prompt
  useEffect(() => {
    if (event && pose) {
      const buildResult = ReferencePromptBuilder.build({
        event,
        pose,
        outfitContext: event.outfitContext,
        environment: selectedEnvironment,
      });
      setPromptText(buildResult.prompt);
    }
    setActiveStep('providers');
    setIsGenerating(false);
    setGenerateError(null);
  }, [pose, event, isOpen, selectedEnvId]);

  if (!isOpen || !pose) return null;

  const handleProviderClick = (provider: ReferenceProvider) => {
    if (provider.id === 'upload') {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
        fileInputRef.current.click();
      }
    } else if (provider.id === 'openai' && provider.status === 'available') {
      setSelectedAIProvider(provider);
      setActiveStep('prompt_review');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      onSelectUpload(pose, file);
      onClose();
    }
  };

  const promptBuildResult = event
    ? ReferencePromptBuilder.build({
        event,
        pose,
        outfitContext: event.outfitContext,
        environment: selectedEnvironment,
      })
    : null;

  const handleCopyPrompt = () => {
    const textToCopy = promptText || promptBuildResult?.prompt || '';
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleResetPrompt = () => {
    if (promptBuildResult) {
      setPromptText(promptBuildResult.prompt);
    }
  };

  const handleExecuteGenerate = async () => {
    if (!selectedAIProvider || !event) return;

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const result = await ReferenceEngine.createReference(selectedAIProvider.id as ReferenceProviderId, {
        event,
        pose,
        prompt: promptText,
        environment: selectedEnvironment,
      });

      if (onSelectAI) {
        onSelectAI(pose, result);
      }
      onClose();
    } catch (err: any) {
      console.error('Error generating AI reference image:', err);
      setGenerateError(err?.message || 'OpenAI image generation failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => !isGenerating && onClose()}
          className="fixed inset-0 bg-black/85 backdrop-blur-sm"
        />

        {/* Modal / Bottom Sheet Panel */}
        <motion.div
          initial={{ y: '100%', opacity: 0.8 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="relative w-full sm:max-w-xl bg-[#111111] border-t sm:border border-[#2A2A2A] rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 z-10 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-4 shrink-0">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
                <span className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] font-bold">
                  Reference Engine
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-light text-white tracking-tight">
                {activeStep === 'prompt_review' ? 'Review Reference Prompt' : 'Pose Visual Reference'}
              </h2>
              <p className="text-xs text-[#A1A1AA] mt-1 font-light">
                {activeStep === 'prompt_review' ? (
                  <>
                    Review or refine prompt for{' '}
                    <span className="text-white font-medium">"{pose.title}"</span> before sending to OpenAI.
                  </>
                ) : (
                  <>
                    Choose reference provider or inspect prompt for{' '}
                    <span className="text-white font-medium">"{pose.title}"</span>.
                  </>
                )}
              </p>
            </div>
            {!isGenerating && (
              <button
                onClick={onClose}
                className="p-2 -mr-1 -mt-1 text-[#888] hover:text-white bg-[#1A1A1A] hover:bg-[#252525] border border-[#2A2A2A] rounded-full transition-colors"
                aria-label="Close Reference Engine"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Hidden File Input for Direct Upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* ========================================================
              STEP 1: PROVIDERS SELECTION
              ======================================================== */}
          {activeStep === 'providers' && (
            <div className="space-y-3 my-2 overflow-y-auto flex-1 pr-1">
              {/* Environment Grounding Picker if environments exist */}
              {environments.length > 0 && (
                <div className="p-3.5 rounded-xl bg-[#161616] border border-[#2A2A2A] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[#D4AF37] flex items-center gap-1.5">
                      <MapPin size={12} />
                      <span>Venue Environment Grounding</span>
                    </span>
                    <span className="text-[9px] text-[#888]">
                      {selectedEnvironment ? 'Grounded in venue' : 'Default location'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {selectedEnvironment ? (
                      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-[#D4AF37]/50 bg-black">
                        <img
                          src={selectedEnvironment.imageUrl}
                          alt={selectedEnvironment.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-lg shrink-0 border border-[#333] bg-[#1E1E1E] flex items-center justify-center text-[#777]">
                        <ImageIcon size={16} />
                      </div>
                    )}

                    <select
                      value={selectedEnvId}
                      onChange={(e) => setSelectedEnvId(e.target.value)}
                      className="flex-1 bg-[#111] border border-[#333] focus:border-[#D4AF37] text-white text-xs rounded-lg px-3 py-2 focus:outline-none"
                    >
                      <option value="none">No Venue Reference (Use Event Location: {event?.location})</option>
                      {environments.map((env) => (
                        <option key={env.id} value={env.id}>
                          {env.name} {env.id === event?.activeEnvironmentId ? '★ (Event Active)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Providers List */}
              {providers.map((provider) => {
                const isAvailable = provider.status === 'available';
                const isUnavailable = provider.status === 'unavailable';
                const isNotConnected = provider.status === 'not_connected';

                return (
                  <div
                    key={provider.id}
                    onClick={() => isAvailable && handleProviderClick(provider)}
                    className={`relative p-4 rounded-xl border transition-all ${
                      isAvailable
                        ? 'bg-[#181818] hover:bg-[#202020] border-[#D4AF37]/40 hover:border-[#D4AF37] cursor-pointer shadow-md'
                        : 'bg-[#141414]/90 border-[#242424] opacity-75 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {/* Provider Icon */}
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                            isAvailable
                              ? 'bg-[#D4AF37]/15 border-[#D4AF37]/40 text-[#D4AF37]'
                              : isUnavailable
                              ? 'bg-amber-950/20 border-amber-800/30 text-amber-500/80'
                              : 'bg-[#1E1E1E] border-[#2E2E2E] text-[#777]'
                          }`}
                        >
                          {provider.id === 'upload' ? (
                            <Upload size={18} />
                          ) : (
                            <Sparkles size={18} />
                          )}
                        </div>

                        {/* Provider Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-white tracking-wide">
                              {provider.name}
                              {provider.id === 'openai' && ' Image'}
                            </h3>
                            {provider.model && (
                              <span className="text-[10px] font-mono text-[#888] bg-[#0E0E0E] px-2 py-0.5 rounded border border-[#222]">
                                {provider.model}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-[#A1A1AA] mt-0.5 leading-snug">
                            {provider.description}
                          </p>

                          {/* Status detail message for unavailable / not connected states */}
                          {!isAvailable && provider.statusMessage && (
                            <p className="text-[11px] text-[#777] mt-2 flex items-center gap-1.5 font-light">
                              <AlertCircle size={12} className="shrink-0 text-amber-500/70" />
                              <span>{provider.statusMessage}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="shrink-0">
                        {isAvailable ? (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40 rounded-full flex items-center gap-1">
                            <Check size={11} strokeWidth={3} /> {provider.badgeText}
                          </span>
                        ) : isUnavailable ? (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-amber-950/40 text-amber-400 border border-amber-800/50 rounded-full">
                            {provider.badgeText}
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-[#1E1E1E] text-[#888] border border-[#2E2E2E] rounded-full flex items-center gap-1">
                            <Lock size={10} /> {provider.badgeText}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Available Provider Action Callout */}
                    {isAvailable && (
                      <div className="mt-3 pt-2.5 border-t border-[#262626] flex items-center justify-between">
                        <span className="text-[10px] text-[#A1A1AA] font-light">
                          {provider.id === 'upload'
                            ? 'Select to browse JPG, PNG or WEBP'
                            : 'Review prompt & generate with GPT Image 2'}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#D4AF37] flex items-center gap-1">
                          {provider.id === 'upload' ? 'Select Photograph →' : 'Review Prompt & Generate →'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Prompt Inspector Drawer / Accordion */}
              {promptBuildResult && (
                <div className="mt-4 pt-2 border-t border-[#222]">
                  <button
                    onClick={() => setShowPromptInspector(!showPromptInspector)}
                    className="w-full p-3 rounded-xl bg-[#151515] hover:bg-[#1C1C1C] border border-[#2A2A2A] flex items-center justify-between transition-colors text-left"
                  >
                    <div className="flex items-center gap-2.5">
                      <FileText size={15} className="text-[#D4AF37]" />
                      <div>
                        <span className="text-xs font-semibold text-white block">
                          Reference Prompt Structure
                        </span>
                        <span className="text-[10px] text-[#888] block">
                          Inspect the 11-section destination wedding prompt builder
                        </span>
                      </div>
                    </div>
                    <div className="text-[#888]">
                      {showPromptInspector ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </button>

                  {showPromptInspector && (
                    <div className="mt-2.5 p-4 rounded-xl bg-[#0D0D0D] border border-[#262626] space-y-3">
                      <div className="flex items-center justify-between gap-2 border-b border-[#222] pb-2">
                        <div className="flex items-center gap-2 flex-wrap text-[10px] text-[#A1A1AA]">
                          <span className="px-2 py-0.5 bg-[#1A1A1A] text-[#D4AF37] rounded font-mono">
                            Bride: {promptBuildResult.metadata.brideSummary}
                          </span>
                          <span className="px-2 py-0.5 bg-[#1A1A1A] text-[#A1A1AA] rounded font-mono">
                            Groom: {promptBuildResult.metadata.groomSummary}
                          </span>
                        </div>
                        <button
                          onClick={handleCopyPrompt}
                          className="px-2.5 py-1 bg-[#1E1E1E] hover:bg-[#2A2A2A] text-white text-[10px] uppercase tracking-wider font-bold rounded flex items-center gap-1.5 border border-[#333] transition-colors shrink-0"
                        >
                          {copiedPrompt ? (
                            <>
                              <Check size={11} className="text-[#D4AF37]" /> Copied!
                            </>
                          ) : (
                            <>
                              <Copy size={11} /> Copy Prompt
                            </>
                          )}
                        </button>
                      </div>

                      <pre className="text-[11px] text-white/80 font-mono whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto bg-black/60 p-3 rounded-lg border border-[#222]">
                        {promptBuildResult.prompt}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================
              STEP 2: PROMPT REVIEW & GENERATE (OPENAI)
              ======================================================== */}
          {activeStep === 'prompt_review' && (
            <div className="space-y-4 my-2 overflow-y-auto flex-1 pr-1">
              {/* Provider & Model Badge */}
              <div className="flex items-center justify-between p-3 bg-[#181818] border border-[#2A2A2A] rounded-xl">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-white block">OpenAI Image</span>
                    <span className="text-[10px] font-mono text-[#888]">Model: gpt-image-2 • 1 image</span>
                  </div>
                </div>
                <button
                  onClick={() => !isGenerating && setActiveStep('providers')}
                  disabled={isGenerating}
                  className="text-[10px] uppercase tracking-wider text-[#A1A1AA] hover:text-white flex items-center gap-1 py-1 px-2 rounded hover:bg-[#222] transition-colors"
                >
                  <ArrowLeft size={12} />
                  <span>Change Provider</span>
                </button>
              </div>

              {/* Venue Environment Grounding Indicator */}
              {selectedEnvironment ? (
                <div className="p-3 bg-[#151515] border border-[#D4AF37]/30 rounded-xl flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 border border-[#D4AF37]/60 bg-black">
                    <img
                      src={selectedEnvironment.imageUrl}
                      alt={selectedEnvironment.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-white truncate">
                        {selectedEnvironment.name}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30 rounded uppercase font-bold tracking-wider">
                        Venue Grounded
                      </span>
                    </div>
                    <span className="text-[10px] text-[#888] block truncate">
                      Mandatory Venue Preservation active in prompt
                    </span>
                  </div>
                </div>
              ) : environments.length > 0 ? (
                <div className="p-2.5 bg-[#141414] border border-[#262626] rounded-xl flex items-center justify-between text-xs text-[#888]">
                  <span className="text-[10px]">No venue reference selected (using default location)</span>
                  <button
                    onClick={() => setActiveStep('providers')}
                    className="text-[10px] text-[#D4AF37] hover:underline uppercase tracking-wider font-bold"
                  >
                    Select Venue
                  </button>
                </div>
              ) : null}

              {/* Error Banner */}
              {generateError && (
                <div className="p-3.5 bg-red-950/40 border border-red-900/60 rounded-xl text-red-200 text-xs flex items-start gap-2.5">
                  <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-semibold block mb-0.5 text-red-300 uppercase text-[10px] tracking-wider">
                      Generation Failed
                    </span>
                    <p className="leading-relaxed">{generateError}</p>
                  </div>
                </div>
              )}

              {/* Prompt Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-widest text-[#D4AF37] font-bold flex items-center gap-1.5">
                    <Edit3 size={12} />
                    <span>Prompt Review & Customization</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleResetPrompt}
                      disabled={isGenerating}
                      className="text-[9px] uppercase tracking-wider text-[#888] hover:text-[#D4AF37] transition-colors"
                    >
                      Reset to Default
                    </button>
                    <button
                      onClick={handleCopyPrompt}
                      className="text-[9px] uppercase tracking-wider text-[#888] hover:text-white flex items-center gap-1"
                    >
                      {copiedPrompt ? (
                        <>
                          <Check size={10} className="text-[#D4AF37]" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy size={10} /> Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  disabled={isGenerating}
                  rows={9}
                  className="w-full bg-[#0D0D0D] border border-[#2A2A2A] focus:border-[#D4AF37] text-white text-xs font-mono p-3 rounded-xl focus:outline-none transition-colors leading-relaxed resize-y"
                  placeholder="Pose reference prompt..."
                />
                <p className="text-[10px] text-[#777] leading-tight">
                  * You can refine lighting cues, composition nuance, or environment details before triggering generation.
                </p>
              </div>

              {/* Generating Status Animation */}
              {isGenerating && (
                <div className="p-4 bg-[#141414] border border-[#D4AF37]/40 rounded-xl flex items-center gap-3.5">
                  <RefreshCw size={20} className="text-[#D4AF37] animate-spin shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-white block">
                      Generating Reference with GPT Image 2...
                    </span>
                    <span className="text-[10px] text-[#A1A1AA] block">
                      Processing pose mechanics and textures. Please wait.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom Action Buttons */}
          <div className="pt-3 border-t border-[#222] shrink-0 flex items-center gap-3">
            {activeStep === 'prompt_review' ? (
              <>
                <button
                  onClick={() => setActiveStep('providers')}
                  disabled={isGenerating}
                  className="flex-1 h-11 bg-[#1A1A1A] hover:bg-[#252525] text-white text-xs font-bold uppercase tracking-[0.15em] rounded-xl border border-[#2E2E2E] transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleExecuteGenerate}
                  disabled={isGenerating || !promptText.trim()}
                  className="flex-[2] h-11 bg-[#D4AF37] hover:bg-white text-black text-xs font-bold uppercase tracking-[0.15em] rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Generating (1 Image)...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>Generate Reference</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="w-full h-10 bg-[#1A1A1A] hover:bg-[#252525] text-white text-xs font-bold uppercase tracking-[0.15em] rounded-xl border border-[#2E2E2E] transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
