import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  Download,
  CheckCircle2,
  Sparkles,
  Sliders,
  AlertCircle,
  Image as ImageIcon,
  Palette,
  Check,
  ChevronDown,
  Layers,
  Info,
  Camera,
  Eye,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';
import { ShootEvent, Pose, ColorRecipe, ColorStyle } from '../types';
import { CreativeEngine } from '../lib/creativeEngine';
import { analyzeColorPreset } from '../lib/api';
import {
  validateColorRecipe,
  generateLightroomXmp,
  validateXmp,
  generatePresetFilename,
  downloadXmpPreset,
  createControlledWbTestPreset,
} from '../lib/lightroomXmp';

interface ColorStyleViewProps {
  event: ShootEvent;
  onBack: () => void;
  onNavigate?: (view: { name: string; eventId?: string }) => void;
  onUpdate: (updates: Partial<ShootEvent>) => void;
}

export function ColorStyleView({ event, onBack, onNavigate, onUpdate }: ColorStyleViewProps) {
  // Guide generation state
  const [loadingGuide, setLoadingGuide] = useState(false);
  const [guideError, setGuideError] = useState('');

  // Preset generation state
  const [generatingPreset, setGeneratingPreset] = useState(false);
  const [presetStep, setPresetStep] = useState(0);
  const [presetError, setPresetError] = useState('');
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [showImportHelp, setShowImportHelp] = useState(false);
  const [showReanalyzeModal, setShowReanalyzeModal] = useState(false);

  // Approved visual references from event poses (p.referenceApproved && valid image)
  const approvedReferences = useMemo(() => {
    if (!event.poses || event.poses.length === 0) return [];
    return event.poses
      .filter((p) => {
        const url =
          (p.activeReferenceType === 'upload' && p.uploadedReference?.url) ||
          p.aiReference?.url ||
          (typeof p.referenceImage === 'string' ? p.referenceImage : p.referenceImage?.url);
        return p.referenceApproved && !!url && url !== 'indexeddb';
      })
      .map((p) => {
        const url = ((p.activeReferenceType === 'upload' && p.uploadedReference?.url) ||
          p.aiReference?.url ||
          (typeof p.referenceImage === 'string' ? p.referenceImage : p.referenceImage?.url)) as string;
        return {
          poseId: p.id,
          order: p.order,
          title: p.title,
          shootingIntent: p.shootingIntent,
          imageUrl: url,
        };
      });
  }, [event.poses]);

  // Active color source mode: 'approved_reference' | 'event'
  const [colorSource, setColorSource] = useState<'approved_reference' | 'event'>(() => {
    if (event.colorSource) return event.colorSource;
    return approvedReferences.length > 0 ? 'approved_reference' : 'approved_reference';
  });

  // Selected pose ID for approved reference mode
  const [selectedPoseId, setSelectedPoseId] = useState<string>(() => {
    if (event.selectedColorReferenceId && approvedReferences.some((r) => r.poseId === event.selectedColorReferenceId)) {
      return event.selectedColorReferenceId;
    }
    return approvedReferences[0]?.poseId || '';
  });

  // Keep selectedPoseId in sync if approved references change
  useEffect(() => {
    if (approvedReferences.length > 0) {
      if (!selectedPoseId || !approvedReferences.some((r) => r.poseId === selectedPoseId)) {
        setSelectedPoseId(approvedReferences[0].poseId);
      }
    }
  }, [approvedReferences, selectedPoseId]);

  // Active reference for approved_reference mode
  const activeRef = useMemo(() => {
    if (approvedReferences.length === 0) return null;
    return approvedReferences.find((r) => r.poseId === selectedPoseId) || approvedReferences[0];
  }, [approvedReferences, selectedPoseId]);

  // Current active recipe depending on source mode and selected reference
  const activeRecipe = useMemo<ColorRecipe | undefined>(() => {
    if (colorSource === 'approved_reference') {
      if (!activeRef) return undefined;
      // Look up specific recipe stored for this reference pose ID
      if (event.referenceColorRecipes && event.referenceColorRecipes[activeRef.poseId]) {
        return event.referenceColorRecipes[activeRef.poseId];
      }
      // Fallback if legacy single colorRecipe matches this selection
      if (event.selectedColorReferenceId === activeRef.poseId && event.colorRecipe) {
        return event.colorRecipe;
      }
      return undefined;
    } else {
      // Event-based recipe
      if (event.eventColorRecipe) return event.eventColorRecipe;
      if (!event.selectedColorReferenceId && event.colorRecipe) return event.colorRecipe;
      return undefined;
    }
  }, [colorSource, activeRef, event.referenceColorRecipes, event.selectedColorReferenceId, event.colorRecipe, event.eventColorRecipe]);

  // Handle switching color source mode
  const handleSelectSourceMode = (mode: 'approved_reference' | 'event') => {
    setColorSource(mode);
    setPresetError('');
    if (mode === 'approved_reference') {
      const targetRef = approvedReferences.find((r) => r.poseId === selectedPoseId) || approvedReferences[0];
      const targetRecipe = targetRef
        ? event.referenceColorRecipes?.[targetRef.poseId] || (event.selectedColorReferenceId === targetRef.poseId ? event.colorRecipe : undefined)
        : undefined;
      onUpdate({
        colorSource: 'approved_reference',
        selectedColorReferenceId: targetRef?.poseId,
        colorRecipe: targetRecipe || undefined,
      });
    } else {
      onUpdate({
        colorSource: 'event',
        colorRecipe: event.eventColorRecipe || undefined,
      });
    }
  };

  // Handle selecting a different approved reference from the thumbnail selector
  const handleSelectReference = (poseId: string) => {
    setSelectedPoseId(poseId);
    setPresetError('');
    const targetRecipe = event.referenceColorRecipes?.[poseId] || (event.selectedColorReferenceId === poseId ? event.colorRecipe : undefined);
    onUpdate({
      colorSource: 'approved_reference',
      selectedColorReferenceId: poseId,
      colorRecipe: targetRecipe || undefined,
    });
  };

  // Step message ticker during OpenAI Color Analysis
  const presetStepMessages = [
    'Analyzing visual tonal character from reference...',
    'Calibrating skin luminance & melanin preservation...',
    'Formulating HSL separations and 3-way color grading...',
    'Validating Lightroom develop ranges & generating .XMP...',
  ];

  useEffect(() => {
    if (!generatingPreset) {
      setPresetStep(0);
      return;
    }
    const t1 = setTimeout(() => setPresetStep(1), 1400);
    const t2 = setTimeout(() => setPresetStep(2), 2800);
    const t3 = setTimeout(() => setPresetStep(3), 4200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [generatingPreset]);

  // Execute OpenAI Color Analysis
  const handleExecuteAnalysis = async () => {
    setShowReanalyzeModal(false);
    setGeneratingPreset(true);
    setPresetError('');
    setDownloadSuccess(false);

    try {
      if (colorSource === 'approved_reference') {
        if (!activeRef || !activeRef.imageUrl) {
          throw new Error('NO APPROVED REFERENCE: Please select an approved visual reference to analyze.');
        }

        console.log('[ColorPreset] Analyzing approved reference:', activeRef.title);

        const response = await analyzeColorPreset({
          event,
          image: activeRef.imageUrl,
          colorStyle: event.colorStyle,
          sourceInfo: {
            type: 'approved_reference',
            title: `Pose ${activeRef.order} • ${activeRef.title}`,
            imageUrl: activeRef.imageUrl,
          },
        });

        if (!response || !response.recipe) {
          throw new Error('OpenAI did not return a valid color recipe.');
        }

        // Validate recipe structure and ranges
        const validation = validateColorRecipe(response.recipe);
        if (!validation.valid || !validation.recipe) {
          throw new Error(`Invalid color recipe generated: ${validation.errors.join('; ')}`);
        }

        // Verify that XMP generator can successfully generate compliant XML
        const testXmp = generateLightroomXmp(validation.recipe, { eventName: event.name });
        const xmpVal = validateXmp(testXmp);
        if (!xmpVal.valid) {
          throw new Error(`XMP validation check failed: ${xmpVal.errors.join('; ')}`);
        }

        // Persist the recipe per-reference pose ID without overwriting others
        const updatedRecipes = {
          ...(event.referenceColorRecipes || {}),
          [activeRef.poseId]: validation.recipe,
        };

        onUpdate({
          colorSource: 'approved_reference',
          selectedColorReferenceId: activeRef.poseId,
          referenceColorRecipes: updatedRecipes,
          colorRecipe: validation.recipe,
        });

        console.log('[ColorPreset] Successfully generated and stored recipe for pose:', activeRef.poseId);
      } else {
        // Event narrative & lighting analysis
        console.log('[ColorPreset] Analyzing event lighting & narrative for:', event.name);

        const response = await analyzeColorPreset({
          event,
          colorStyle: event.colorStyle,
          sourceInfo: {
            type: 'event_style',
            title: `${event.name} Aesthetic`,
          },
        });

        if (!response || !response.recipe) {
          throw new Error('OpenAI did not return a valid color recipe.');
        }

        const validation = validateColorRecipe(response.recipe);
        if (!validation.valid || !validation.recipe) {
          throw new Error(`Invalid color recipe generated: ${validation.errors.join('; ')}`);
        }

        onUpdate({
          colorSource: 'event',
          eventColorRecipe: validation.recipe,
          colorRecipe: validation.recipe,
        });
      }
    } catch (err: any) {
      console.error('[ColorPreset] Failed to generate Lightroom preset:', err);
      setPresetError(err?.message || 'COLOR ANALYSIS FAILED. Please try again.');
    } finally {
      setGeneratingPreset(false);
    }
  };

  // Generate or Regenerate Guide
  const handleGenerateGuide = async () => {
    setLoadingGuide(true);
    setGuideError('');
    try {
      const data = await CreativeEngine.generateShootGuide(event);
      onUpdate({
        overallConcept: data.overallConcept,
        poses: data.poses,
        colorStyle: data.colorStyle,
      });
    } catch (err: any) {
      setGuideError(err?.message || 'Failed to generate color style');
    } finally {
      setLoadingGuide(false);
    }
  };

  // Download the Lightroom .xmp preset
  const handleDownloadPreset = () => {
    if (!activeRecipe) {
      setPresetError('No Lightroom preset recipe exists for the active selection yet.');
      return;
    }

    try {
      setPresetError('');
      // 1. Validate recipe
      const recipeValidation = validateColorRecipe(activeRecipe);
      if (!recipeValidation.valid || !recipeValidation.recipe) {
        throw new Error(`Color recipe validation failed: ${recipeValidation.errors.join(', ')}`);
      }

      // 2. Generate local XMP string
      const xmpContent = generateLightroomXmp(recipeValidation.recipe, { eventName: event.name });

      // 3. Strict XMP validation
      const xmpValidation = validateXmp(xmpContent);
      if (!xmpValidation.valid) {
        throw new Error(
          `PRESET VALIDATION FAILED: The preset was not downloaded because the generated XMP is invalid (${xmpValidation.errors.join(', ')}).`
        );
      }

      // 4. Generate safe filename
      const sourceTitle =
        colorSource === 'approved_reference' && activeRef
          ? activeRef.title
          : recipeValidation.recipe.presetName || event.colorStyle?.name || 'Wedding_Develop_Preset';

      const filename = generatePresetFilename(sourceTitle, event.name);

      // 5. Trigger browser download
      downloadXmpPreset(xmpContent, filename);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 6000);
    } catch (err: any) {
      console.error('[ColorPreset] Preset Download Failed:', err);
      setPresetError(err?.message || 'Failed to download preset.');
    }
  };

  // Download calibrated single-variable test presets for White Balance diagnostics
  const handleDownloadTestPreset = (type: 'neutral' | 'warm' | 'cool') => {
    try {
      setPresetError('');
      const testRecipe = createControlledWbTestPreset(type);
      const xmpContent = generateLightroomXmp(testRecipe, { eventName: 'ZAP_DIAGNOSTIC' });
      const xmpValidation = validateXmp(xmpContent);
      if (!xmpValidation.valid) {
        throw new Error(`Test preset validation failed: ${xmpValidation.errors.join(', ')}`);
      }
      const filename = generatePresetFilename(testRecipe.presetName, 'ZAP_DIAGNOSTIC');
      downloadXmpPreset(xmpContent, filename);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 5000);
    } catch (err: any) {
      setPresetError(err?.message || 'Failed to generate test preset.');
    }
  };

  const c = event.colorStyle;

  return (
    <div className="flex flex-col min-h-screen bg-[#111] text-white">
      {/* Top Navigation Bar */}
      <div className="p-4 sm:p-6 border-b border-[#222] flex items-center justify-between bg-[#141414] shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-[#1f1f1f] hover:bg-[#2a2a2a] text-[#A1A1AA] hover:text-white transition-colors border border-[#333]"
            aria-label="Back to Shoot"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] font-bold">
                {event.name}
              </span>
              <span className="text-[#555]">•</span>
              <span className="text-[10px] uppercase tracking-wider text-[#A1A1AA]">
                {event.location}
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-light text-white tracking-tight">
              Color Style & Lightroom Develop
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeRecipe && (
            <button
              id="btn-download-top"
              onClick={handleDownloadPreset}
              disabled={generatingPreset}
              className="px-4 py-2 rounded-lg bg-[#D4AF37] hover:bg-white text-[#111] font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 shadow-md shadow-[#D4AF37]/10"
            >
              <Download size={13} />
              <span className="hidden sm:inline">Download .XMP</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-4 sm:p-6 md:p-8 max-w-6xl mx-auto w-full space-y-8">
        {loadingGuide ? (
          <div className="flex-1 flex flex-col items-center justify-center p-16 text-center border border-[#333] rounded-2xl bg-[#1A1A1A]">
            <RefreshCw className="w-8 h-8 text-[#D4AF37] mb-6 animate-spin" />
            <h2 className="text-xl font-light mb-2 text-white">Creating visual color direction...</h2>
            <p className="text-[#A1A1AA] text-sm max-w-md">
              Synthesizing aesthetic world for {event.location} in {event.timeOfDay} light.
            </p>
          </div>
        ) : guideError ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center border border-red-900/40 rounded-2xl bg-[#1A1A1A]">
            <p className="text-red-400 font-medium text-lg mb-2">Generation failed.</p>
            <p className="text-[#A1A1AA] text-xs font-mono bg-black/60 px-4 py-3 rounded border border-red-900/30 max-w-lg mb-6 break-words">
              Error: {guideError}
            </p>
            <button
              onClick={handleGenerateGuide}
              className="px-8 py-3 bg-[#D4AF37] hover:bg-white text-[#111] rounded text-[11px] uppercase tracking-[0.2em] font-bold transition-colors"
            >
              RETRY
            </button>
          </div>
        ) : !c ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border border-dashed border-[#333] rounded-2xl bg-[#1A1A1A]">
            <Palette className="w-12 h-12 text-[#D4AF37]/40 mb-6" strokeWidth={1} />
            <h2 className="text-2xl font-light mb-4 text-white">This event does not have a color style yet.</h2>
            <p className="text-[#A1A1AA] text-sm mb-8 max-w-md">
              Generate a bespoke color direction for {event.location} at {event.timeOfDay}.
            </p>
            <button
              onClick={handleGenerateGuide}
              className="px-8 py-3 bg-[#D4AF37] hover:bg-white text-[#111] rounded text-[11px] uppercase tracking-[0.2em] font-bold transition-colors"
            >
              GENERATE COLOR STYLE
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* ========================================================================= */}
            {/* COLOR SOURCE SELECTOR & WORKFLOW TABS */}
            {/* ========================================================================= */}
            <div className="bg-[#181818] p-5 sm:p-6 rounded-2xl border border-[#2b2b2b]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                <div>
                  <span className="text-[#D4AF37] text-[10px] uppercase tracking-[0.3em] font-bold block mb-1">
                    Lightroom Calibration Source
                  </span>
                  <h2 className="text-xl sm:text-2xl font-light text-white tracking-wide">
                    COLOR SOURCE
                  </h2>
                </div>

                {/* Segmented Mode Selector: [ MATCH APPROVED REFERENCE ] | [ GENERATE FROM EVENT ] */}
                <div className="inline-flex p-1 bg-[#111] rounded-xl border border-[#333] self-start sm:self-auto">
                  <button
                    id="btn-source-approved-ref"
                    onClick={() => handleSelectSourceMode('approved_reference')}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2 ${
                      colorSource === 'approved_reference'
                        ? 'bg-[#D4AF37] text-black shadow-md'
                        : 'text-[#A1A1AA] hover:text-white'
                    }`}
                  >
                    <Sparkles size={13} />
                    <span>MATCH APPROVED REFERENCE</span>
                    {approvedReferences.length > 0 && (
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                          colorSource === 'approved_reference'
                            ? 'bg-black/30 text-black'
                            : 'bg-[#222] text-[#D4AF37]'
                        }`}
                      >
                        {approvedReferences.length}
                      </span>
                    )}
                  </button>

                  <button
                    id="btn-source-event"
                    onClick={() => handleSelectSourceMode('event')}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2 ${
                      colorSource === 'event'
                        ? 'bg-[#D4AF37] text-black shadow-md'
                        : 'text-[#A1A1AA] hover:text-white'
                    }`}
                  >
                    <Palette size={13} />
                    <span>GENERATE FROM EVENT</span>
                  </button>
                </div>
              </div>

              {/* Source Option 1: MATCH APPROVED REFERENCE */}
              {colorSource === 'approved_reference' && (
                <div className="space-y-6">
                  {/* Case A: 0 Approved References */}
                  {approvedReferences.length === 0 ? (
                    <div className="p-8 sm:p-10 rounded-xl bg-[#121212] border border-dashed border-[#333] text-center flex flex-col items-center justify-center">
                      <div className="w-14 h-14 rounded-2xl bg-[#1c1c1c] border border-[#2e2e2e] flex items-center justify-center mb-4 text-[#D4AF37]">
                        <ImageIcon size={26} strokeWidth={1.5} />
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] font-bold mb-1">
                        No Approved Reference
                      </span>
                      <h3 className="text-lg font-light text-white mb-2">
                        Generate or approve a visual reference first.
                      </h3>
                      <p className="text-xs text-[#888] max-w-md mb-6 leading-relaxed">
                        The Color Style engine derives its develop parameters directly from an approved visual reference image to ensure optical fidelity.
                      </p>
                      <button
                        id="btn-go-to-poses"
                        onClick={() => {
                          if (onNavigate) {
                            onNavigate({ name: 'posingGuide', eventId: event.id });
                          } else {
                            onBack();
                          }
                        }}
                        className="px-6 py-2.5 bg-[#D4AF37] hover:bg-white text-black font-bold text-xs uppercase tracking-widest rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-[#D4AF37]/10"
                      >
                        <Eye size={14} />
                        <span>GO TO POSES & REFERENCES</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Case C: Multiple Approved References Selector Strip */}
                      {approvedReferences.length > 1 && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] uppercase tracking-widest text-[#888] font-semibold">
                              CHOOSE VISUAL REFERENCE ({approvedReferences.length} APPROVED):
                            </span>
                            <span className="text-[10px] text-[#666]">
                              Each reference maintains its own independent color recipe
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {approvedReferences.map((ref) => {
                              const isSelected = activeRef?.poseId === ref.poseId;
                              const hasRecipe =
                                !!event.referenceColorRecipes?.[ref.poseId] ||
                                (event.selectedColorReferenceId === ref.poseId && !!event.colorRecipe);

                              return (
                                <button
                                  key={ref.poseId}
                                  onClick={() => handleSelectReference(ref.poseId)}
                                  className={`relative group rounded-xl overflow-hidden text-left border transition-all p-2 bg-[#121212] ${
                                    isSelected
                                      ? 'border-[#D4AF37] ring-1 ring-[#D4AF37]/50 shadow-lg shadow-[#D4AF37]/10'
                                      : 'border-[#292929] hover:border-[#444]'
                                  }`}
                                >
                                  <div className="aspect-[4/3] rounded-lg overflow-hidden bg-black/60 mb-2 relative">
                                    <img
                                      src={ref.imageUrl}
                                      alt={ref.title}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                      referrerPolicy="no-referrer"
                                    />
                                    {hasRecipe && (
                                      <div className="absolute top-1.5 right-1.5 bg-emerald-950/90 text-emerald-300 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-emerald-700/60 flex items-center gap-1 backdrop-blur-sm">
                                        <Check size={9} />
                                        <span>Analyzed</span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="px-1">
                                    <div className="text-[9px] uppercase tracking-wider text-[#777] font-mono">
                                      Pose {ref.order}
                                    </div>
                                    <div className="text-xs font-medium text-white truncate group-hover:text-[#D4AF37] transition-colors">
                                      {ref.title}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Selected Color Reference Detail Banner */}
                      {activeRef && (
                        <div className="p-5 sm:p-6 bg-[#121212] border border-[#2b2b2b] rounded-xl flex flex-col md:flex-row items-center gap-6 justify-between">
                          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left w-full md:w-auto">
                            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden border border-[#3a3a3a] shrink-0 bg-black relative shadow-inner">
                              <img
                                src={activeRef.imageUrl}
                                alt={activeRef.title}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <span className="absolute bottom-1 right-1 text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-emerald-300 font-bold border border-white/10">
                                Approved
                              </span>
                            </div>

                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center justify-center sm:justify-start gap-2">
                                <span className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] font-bold">
                                  SELECTED COLOR REFERENCE
                                </span>
                                <span className="text-[9px] font-mono text-[#666]">
                                  Pose {activeRef.order}
                                </span>
                              </div>
                              <h3 className="text-lg sm:text-xl font-medium text-white">
                                "{activeRef.title}"
                              </h3>
                              {activeRef.shootingIntent && (
                                <p className="text-xs text-[#888] italic line-clamp-2 max-w-lg">
                                  "{activeRef.shootingIntent}"
                                </p>
                              )}
                              <div className="pt-1.5 flex items-center justify-center sm:justify-start gap-2">
                                {activeRecipe ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 text-[10px] font-semibold">
                                    <CheckCircle size={11} /> Look Analyzed & Saved
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-950/40 text-amber-300 border border-amber-800/40 text-[10px] font-semibold">
                                    <Sparkles size={11} /> Not Analyzed Yet
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action Button for Selected Reference */}
                          <div className="w-full sm:w-auto shrink-0 flex flex-col sm:flex-row items-center gap-3">
                            {activeRecipe ? (
                              <button
                                id="btn-reanalyze-reference"
                                onClick={() => setShowReanalyzeModal(true)}
                                disabled={generatingPreset}
                                className="w-full sm:w-auto px-5 py-2.5 rounded-lg border border-[#3a3a3a] hover:border-[#555] bg-[#1a1a1a] hover:bg-[#252525] text-[#ccc] hover:text-white text-xs uppercase tracking-wider font-semibold transition-colors flex items-center justify-center gap-2"
                              >
                                <RefreshCw size={13} className={generatingPreset ? 'animate-spin' : ''} />
                                <span>REANALYZE REFERENCE</span>
                              </button>
                            ) : (
                              <button
                                id="btn-match-this-look"
                                onClick={handleExecuteAnalysis}
                                disabled={generatingPreset}
                                className="w-full sm:w-auto px-6 py-3 rounded-lg bg-[#D4AF37] hover:bg-white text-black font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/15"
                              >
                                <Sparkles size={15} />
                                <span>{generatingPreset ? 'ANALYZING REFERENCE...' : 'MATCH THIS LOOK'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Source Option 2: GENERATE FROM EVENT */}
              {colorSource === 'event' && (
                <div className="p-6 bg-[#121212] border border-[#2b2b2b] rounded-xl flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="space-y-2 text-center md:text-left">
                    <span className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] font-bold">
                      Event Lighting & Narrative Style
                    </span>
                    <h3 className="text-lg sm:text-xl font-medium text-white">
                      {event.name} — {event.location}
                    </h3>
                    <p className="text-xs text-[#888] max-w-xl leading-relaxed">
                      Calibrates develop parameters directly from {event.timeOfDay} lighting condition, {event.style} mood, and destination atmosphere.
                    </p>
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-1">
                      <span className="text-[10px] bg-[#1a1a1a] px-2.5 py-1 rounded text-[#bbb] border border-[#333]">
                        {event.timeOfDay} Light
                      </span>
                      <span className="text-[10px] bg-[#1a1a1a] px-2.5 py-1 rounded text-[#bbb] border border-[#333]">
                        {event.style}
                      </span>
                      {c.skinTone && (
                        <span className="text-[10px] bg-[#1a1a1a] px-2.5 py-1 rounded text-[#bbb] border border-[#333]">
                          Skin: {c.skinTone}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-full md:w-auto shrink-0 flex flex-col sm:flex-row items-center gap-3">
                    {activeRecipe ? (
                      <button
                        id="btn-regenerate-event-preset"
                        onClick={() => setShowReanalyzeModal(true)}
                        disabled={generatingPreset}
                        className="w-full md:w-auto px-5 py-2.5 rounded-lg border border-[#3a3a3a] hover:border-[#555] bg-[#1a1a1a] hover:bg-[#252525] text-[#ccc] hover:text-white text-xs uppercase tracking-wider font-semibold transition-colors flex items-center justify-center gap-2"
                      >
                        <RefreshCw size={13} className={generatingPreset ? 'animate-spin' : ''} />
                        <span>REGENERATE FROM EVENT</span>
                      </button>
                    ) : (
                      <button
                        id="btn-generate-from-event"
                        onClick={handleExecuteAnalysis}
                        disabled={generatingPreset}
                        className="w-full md:w-auto px-6 py-3 rounded-lg bg-[#D4AF37] hover:bg-white text-black font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/15"
                      >
                        <Sparkles size={15} />
                        <span>{generatingPreset ? 'CALIBRATING...' : 'GENERATE FROM EVENT'}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Error Message Display */}
            {presetError && (
              <div className="p-4 rounded-xl bg-red-950/40 border border-red-900/50 flex items-start gap-3 text-red-200">
                <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-400" />
                <div className="text-xs">
                  <p className="font-semibold mb-0.5">Preset Generation Error</p>
                  <p className="text-red-300 font-mono break-words">{presetError}</p>
                </div>
              </div>
            )}

            {/* Download Success Confirmation Toast */}
            {downloadSuccess && (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/50 flex items-center gap-3 text-emerald-200 animate-in fade-in">
                <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />
                <div className="text-xs">
                  <p className="font-semibold">Preset Downloaded Successfully (.xmp)</p>
                  <p className="text-emerald-300/80">
                    Import this file into Adobe Lightroom Classic or Lightroom CC via the Presets panel.
                  </p>
                </div>
              </div>
            )}

            {/* In Progress Generating State */}
            {generatingPreset && (
              <div className="py-16 bg-[#181818] rounded-2xl border border-[#2b2b2b] text-center flex flex-col items-center justify-center">
                <div className="relative mb-6">
                  <RefreshCw className="w-10 h-10 text-[#D4AF37] animate-spin" />
                  <div className="absolute inset-0 blur-lg bg-[#D4AF37]/30 rounded-full"></div>
                </div>
                <h3 className="text-lg font-light text-white mb-2">{presetStepMessages[presetStep]}</h3>
                <p className="text-xs text-[#777] max-w-sm">
                  Applying OpenAI Vision color analysis and formulating authentic Adobe Camera Raw develop parameters.
                </p>
                <div className="w-48 h-1 bg-[#222] rounded-full mt-6 overflow-hidden">
                  <div
                    className="h-full bg-[#D4AF37] transition-all duration-700 ease-out"
                    style={{ width: `${((presetStep + 1) / presetStepMessages.length) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ACTIVE LIGHTROOM DEVELOP PRESET & COLOR RECIPE DETAILS */}
            {/* ========================================================================= */}
            {!generatingPreset && activeRecipe && (
              <div id="lightroom-preset-card" className="bg-[#181818] p-6 sm:p-8 rounded-2xl border border-[#2b2b2b] space-y-8">
                {/* Header / Engine Status */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#2e2e2e]">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Sliders size={16} className="text-[#D4AF37]" />
                      <span className="text-[#D4AF37] text-[10px] uppercase tracking-[0.3em] font-bold">
                        Lightroom Develop Preset
                      </span>
                      <span className="bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        .XMP
                      </span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-light tracking-tight text-white">
                      {activeRecipe.presetName || 'Wedding Color Preset'}
                    </h2>
                    <p className="text-sm text-[#A1A1AA] mt-1 max-w-2xl">
                      {activeRecipe.description || 'Production-grade, skin-protected .xmp develop preset for Lightroom Classic & CC.'}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 self-start sm:self-center">
                    <button
                      id="btn-download-preset-mid"
                      onClick={handleDownloadPreset}
                      className="px-6 py-2.5 rounded-lg bg-[#D4AF37] hover:bg-white text-[#111] font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-2 shadow-lg shadow-[#D4AF37]/10"
                    >
                      <Download size={14} />
                      <span>Download .XMP Preset</span>
                    </button>
                  </div>
                </div>

                {/* Develop Modules Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  {/* 1. BASIC DEVELOP */}
                  <div className="bg-[#111] p-5 rounded-xl border border-[#262626] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#262626]">
                        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#D4AF37]">
                          Basic Tones
                        </span>
                        <span className="text-[9px] text-[#777] font-mono">PV2012</span>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-[#888]">Exposure</span>
                          <span className="font-mono text-white font-medium">
                            {activeRecipe.basic.exposure > 0 ? `+${activeRecipe.basic.exposure.toFixed(2)}` : activeRecipe.basic.exposure.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#888]">Contrast</span>
                          <span className="font-mono text-white font-medium">
                            {activeRecipe.basic.contrast > 0 ? `+${activeRecipe.basic.contrast}` : activeRecipe.basic.contrast}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#888]">Highlights</span>
                          <span className="font-mono text-white font-medium">
                            {activeRecipe.basic.highlights > 0 ? `+${activeRecipe.basic.highlights}` : activeRecipe.basic.highlights}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#888]">Shadows</span>
                          <span className="font-mono text-white font-medium">
                            {activeRecipe.basic.shadows > 0 ? `+${activeRecipe.basic.shadows}` : activeRecipe.basic.shadows}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#888]">Whites</span>
                          <span className="font-mono text-white font-medium">
                            {activeRecipe.basic.whites > 0 ? `+${activeRecipe.basic.whites}` : activeRecipe.basic.whites}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#888]">Blacks</span>
                          <span className="font-mono text-white font-medium">
                            {activeRecipe.basic.blacks > 0 ? `+${activeRecipe.basic.blacks}` : activeRecipe.basic.blacks}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-[#262626] text-[10px] text-[#666]">
                      <span>Dynamic range calibrated</span>
                    </div>
                  </div>

                  {/* 2. COLOR & WHITE BALANCE */}
                  <div className="bg-[#111] p-5 rounded-xl border border-[#262626] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#262626]">
                        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#D4AF37]">
                          Color & Balance
                        </span>
                        <span className="text-[9px] text-[#777] font-mono">Kelvin/Tint</span>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-[#888]">Temperature</span>
                          <span className="font-mono text-white font-medium">
                            {activeRecipe.whiteBalance.temperature}K
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#888]">Tint</span>
                          <span className="font-mono text-white font-medium">
                            {activeRecipe.whiteBalance.tint > 0 ? `+${activeRecipe.whiteBalance.tint}` : activeRecipe.whiteBalance.tint}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#888]">WB Mode</span>
                          <span className="font-mono text-[#D4AF37] font-medium">
                            {activeRecipe.whiteBalance.mode || 'Custom'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#888]">Vibrance</span>
                          <span className="font-mono text-white font-medium">
                            {activeRecipe.basic.vibrance > 0 ? `+${activeRecipe.basic.vibrance}` : activeRecipe.basic.vibrance}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#888]">Saturation</span>
                          <span className="font-mono text-white font-medium">
                            {activeRecipe.basic.saturation > 0 ? `+${activeRecipe.basic.saturation}` : activeRecipe.basic.saturation}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#888]">Texture</span>
                          <span className="font-mono text-white font-medium">
                            {activeRecipe.basic.texture > 0 ? `+${activeRecipe.basic.texture}` : activeRecipe.basic.texture}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#888]">Clarity</span>
                          <span className="font-mono text-white font-medium">
                            {activeRecipe.basic.clarity > 0 ? `+${activeRecipe.basic.clarity}` : activeRecipe.basic.clarity}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-[#262626] text-[10px] text-[#666]">
                      <span>Melanin-safe saturation curve</span>
                    </div>
                  </div>

                  {/* 3. 3-WAY COLOR GRADING */}
                  <div className="bg-[#111] p-5 rounded-xl border border-[#262626] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#262626]">
                        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#D4AF37]">
                          Color Grading
                        </span>
                        <span className="text-[9px] text-[#777] font-mono">3-Way</span>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-[#888]">Shadows</span>
                          <span className="font-mono text-white text-[11px]">
                            {activeRecipe.colorGrading.shadows.hue}° / {activeRecipe.colorGrading.shadows.saturation}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[#888]">Midtones</span>
                          <span className="font-mono text-white text-[11px]">
                            {activeRecipe.colorGrading.midtones.hue}° / {activeRecipe.colorGrading.midtones.saturation}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[#888]">Highlights</span>
                          <span className="font-mono text-white text-[11px]">
                            {activeRecipe.colorGrading.highlights.hue}° / {activeRecipe.colorGrading.highlights.saturation}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[#888]">Blending</span>
                          <span className="font-mono text-white font-medium">{activeRecipe.colorGrading.blending}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[#888]">Balance</span>
                          <span className="font-mono text-white font-medium">
                            {activeRecipe.colorGrading.balance > 0 ? `+${activeRecipe.colorGrading.balance}` : activeRecipe.colorGrading.balance}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-[#262626] text-[10px] text-[#666]">
                      <span>Subtle cinematic split tone</span>
                    </div>
                  </div>

                  {/* 4. DETAIL, GRAIN & EFFECTS */}
                  <div className="bg-[#111] p-5 rounded-xl border border-[#262626] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#262626]">
                        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#D4AF37]">
                          Detail & Grain
                        </span>
                        <span className="text-[9px] text-[#777] font-mono">Film Look</span>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-[#888]">Grain Amount</span>
                          <span className="font-mono text-white font-medium">{activeRecipe.detail.grainAmount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#888]">Grain Size</span>
                          <span className="font-mono text-white font-medium">{activeRecipe.detail.grainSize}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#888]">Grain Roughness</span>
                          <span className="font-mono text-white font-medium">{activeRecipe.detail.grainRoughness}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#888]">Post-Crop Vignette</span>
                          <span className="font-mono text-white font-medium">
                            {activeRecipe.effects.vignette > 0 ? `+${activeRecipe.effects.vignette}` : activeRecipe.effects.vignette}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#888]">Dehaze</span>
                          <span className="font-mono text-white font-medium">
                            {activeRecipe.basic.dehaze > 0 ? `+${activeRecipe.basic.dehaze}` : activeRecipe.basic.dehaze}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-[#262626] text-[10px] text-[#666]">
                      <span>35mm organic film texture</span>
                    </div>
                  </div>
                </div>

                {/* HSL / Color Mixer 8-Channel Swatch Bar */}
                <div className="bg-[#111] p-6 rounded-xl border border-[#262626]">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#D4AF37]">
                      HSL Color Mixer & Color Separation
                    </span>
                    <span className="text-[9px] text-[#777] font-mono">8 Independent Color Channels</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                    {(
                      [
                        { key: 'red', name: 'Red', color: '#ef4444' },
                        { key: 'orange', name: 'Orange (Skin)', color: '#f97316' },
                        { key: 'yellow', name: 'Yellow', color: '#eab308' },
                        { key: 'green', name: 'Green', color: '#22c55e' },
                        { key: 'aqua', name: 'Aqua', color: '#06b6d4' },
                        { key: 'blue', name: 'Blue', color: '#3b82f6' },
                        { key: 'purple', name: 'Purple', color: '#a855f7' },
                        { key: 'magenta', name: 'Magenta', color: '#ec4899' },
                      ] as const
                    ).map((ch) => {
                      const val = activeRecipe.colorMixer[ch.key];
                      return (
                        <div
                          key={ch.key}
                          className="bg-[#181818] p-3 rounded-lg border border-[#262626] flex flex-col"
                        >
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ch.color }}></span>
                            <span className="text-[10px] font-semibold text-white truncate">{ch.name}</span>
                          </div>
                          <div className="space-y-1 text-[10px] font-mono">
                            <div className="flex justify-between text-[#888]">
                              <span>H</span>
                              <span className={val.hue !== 0 ? 'text-white' : 'text-[#666]'}>
                                {val.hue > 0 ? `+${val.hue}` : val.hue}
                              </span>
                            </div>
                            <div className="flex justify-between text-[#888]">
                              <span>S</span>
                              <span className={val.saturation !== 0 ? 'text-white' : 'text-[#666]'}>
                                {val.saturation > 0 ? `+${val.saturation}` : val.saturation}
                              </span>
                            </div>
                            <div className="flex justify-between text-[#888]">
                              <span>L</span>
                              <span className={val.luminance !== 0 ? 'text-white' : 'text-[#666]'}>
                                {val.luminance > 0 ? `+${val.luminance}` : val.luminance}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Diagnostic & White Balance Controlled Test Presets */}
                <div className="p-4 rounded-xl bg-[#141414] border border-[#262626]">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-3">
                    <div>
                      <h4 className="text-xs uppercase tracking-wider font-semibold text-white flex items-center gap-2">
                        <Sliders size={13} className="text-[#D4AF37]" />
                        <span>White Balance Diagnostic Presets (RAW & JPEG Test)</span>
                      </h4>
                      <p className="text-[11px] text-[#777] mt-0.5">
                        Download calibrated single-variable XMP presets to verify exact Kelvin and Tint rendering in Lightroom.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      id="btn-download-wb-neutral"
                      onClick={() => handleDownloadTestPreset('neutral')}
                      className="px-3 py-2.5 rounded-lg bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] hover:border-[#D4AF37]/50 text-left transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <div className="text-xs font-semibold text-white group-hover:text-[#D4AF37]">ZAP WB TEST</div>
                        <div className="text-[10px] text-[#888] font-mono">5600K • Tint 0</div>
                      </div>
                      <Download size={13} className="text-[#666] group-hover:text-white shrink-0 ml-2" />
                    </button>

                    <button
                      id="btn-download-wb-warm"
                      onClick={() => handleDownloadTestPreset('warm')}
                      className="px-3 py-2.5 rounded-lg bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] hover:border-amber-500/50 text-left transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <div className="text-xs font-semibold text-amber-200 group-hover:text-amber-300">ZAP WB TEST WARM</div>
                        <div className="text-[10px] text-[#888] font-mono">6500K • Tint +5</div>
                      </div>
                      <Download size={13} className="text-[#666] group-hover:text-white shrink-0 ml-2" />
                    </button>

                    <button
                      id="btn-download-wb-cool"
                      onClick={() => handleDownloadTestPreset('cool')}
                      className="px-3 py-2.5 rounded-lg bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] hover:border-sky-500/50 text-left transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <div className="text-xs font-semibold text-sky-200 group-hover:text-sky-300">ZAP WB TEST COOL</div>
                        <div className="text-[10px] text-[#888] font-mono">4500K • Tint -5</div>
                      </div>
                      <Download size={13} className="text-[#666] group-hover:text-white shrink-0 ml-2" />
                    </button>
                  </div>
                </div>

                {/* Bottom Bar: Download Button & Import Help Toggle */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[#262626]">
                  <div className="flex items-center gap-2 text-xs text-[#777]">
                    <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                    <span>Fully compatible with Lightroom Classic (2018–2026+) and Lightroom CC.</span>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                      onClick={() => setShowImportHelp(!showImportHelp)}
                      className="px-4 py-3 rounded-lg border border-[#333] hover:border-[#555] bg-[#111] hover:bg-[#222] text-[#A1A1AA] hover:text-white text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Info size={13} />
                      <span>How to Import</span>
                    </button>

                    <button
                      id="btn-download-preset-bottom"
                      onClick={handleDownloadPreset}
                      className="flex-1 sm:flex-initial px-8 py-3.5 rounded-lg bg-[#D4AF37] hover:bg-white text-[#111] font-bold text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/10"
                    >
                      <Download size={15} />
                      <span>DOWNLOAD .XMP PRESET</span>
                    </button>
                  </div>
                </div>

                {/* Collapsible How-To-Import Guide */}
                {showImportHelp && (
                  <div className="p-5 rounded-xl bg-[#111] border border-[#262626] text-xs text-[#A1A1AA] space-y-2 animate-in fade-in">
                    <p className="font-semibold text-white text-sm mb-2">How to install in Adobe Lightroom:</p>
                    <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                      <li>Download the <span className="text-[#D4AF37] font-mono">.xmp</span> preset file to your computer or mobile device.</li>
                      <li>In Lightroom Classic: Open Develop module, find the <strong>Presets</strong> panel on the left, click <strong>+</strong> &gt; <strong>Import Presets...</strong>, and select the file.</li>
                      <li>In Lightroom CC / Mobile: Open an image, tap <strong>Presets</strong> &gt; tap the <strong>•••</strong> icon &gt; <strong>Import Presets</strong> &gt; choose the .xmp file.</li>
                      <li>Apply the preset to any RAW or JPEG photo from the same assignment.</li>
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reanalyze Confirmation Modal (Part 18) */}
      {showReanalyzeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#181818] border border-[#333] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#D4AF37]/15 text-[#D4AF37] flex items-center justify-center border border-[#D4AF37]/30 shrink-0">
                <RefreshCw size={18} />
              </div>
              <div>
                <h3 className="text-base font-medium text-white">
                  {colorSource === 'approved_reference' ? 'Analyze this reference again?' : 'Regenerate color style from event?'}
                </h3>
                <p className="text-xs text-[#888] mt-0.5">
                  {colorSource === 'approved_reference'
                    ? `OpenAI Vision will perform a fresh colorist analysis on "${activeRef?.title}".`
                    : 'OpenAI will formulate a fresh color recipe based on event narrative & lighting.'}
                </p>
              </div>
            </div>

            <p className="text-xs text-[#A1A1AA] bg-[#111] p-3 rounded-lg border border-[#262626] leading-relaxed">
              This will create a new calibrated .XMP develop recipe and update the current profile.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReanalyzeModal(false)}
                className="px-4 py-2 rounded-lg bg-[#222] hover:bg-[#2c2c2c] text-[#ccc] hover:text-white text-xs font-semibold uppercase tracking-wider transition-colors"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleExecuteAnalysis}
                className="px-5 py-2 rounded-lg bg-[#D4AF37] hover:bg-white text-black font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5"
              >
                <RefreshCw size={13} />
                <span>ANALYZE AGAIN</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
