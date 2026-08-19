import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Upload,
  Check,
  ShieldCheck,
  Cpu,
  Brain,
  Layers,
  Image as ImageIcon,
  Cloud,
  Database,
  HardDrive,
} from 'lucide-react';
import { ReferenceProviderId } from '../types';
import { CreativeEngine } from '../lib/creativeEngine';
import { ReferenceEngine } from '../lib/referenceEngine';
import { fetchProviderStatuses } from '../lib/api';
import { isCloudBackupConfigured, getCloudSyncState } from '../lib/cloudBackup';

interface SettingsViewProps {
  onBack: () => void;
}

export function SettingsView({ onBack }: SettingsViewProps) {
  const [, setTick] = useState(0);
  const [selectedReferenceProvider, setSelectedReferenceProvider] = useState<ReferenceProviderId>(
    ReferenceEngine.getDefaultProviderId()
  );
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchProviderStatuses()
      .then((status) => {
        CreativeEngine.syncStatus(status.creative);
        ReferenceEngine.syncStatus(status.reference);
        setTick((t) => t + 1);
      })
      .catch((err) => {
        console.warn('Failed to fetch provider status on Settings mount:', err);
      });
  }, []);

  const openAICreative = CreativeEngine.getProvider('openai');
  const openAIImage = ReferenceEngine.getProvider('openai');
  const isCreativeConnected = openAICreative?.status === 'connected';
  const isImageConnected = openAIImage?.status === 'available' || openAIImage?.status === 'connected';

  const handleSelectReference = (id: ReferenceProviderId) => {
    if (ReferenceEngine.isProviderAvailable(id)) {
      setSelectedReferenceProvider(id);
      ReferenceEngine.setDefaultProviderId(id);
      setSavedNotice('Default Reference Mode Updated');
      setTimeout(() => setSavedNotice(null), 2500);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col max-w-3xl mx-auto">
      {/* Header */}
      <header className="flex items-center gap-6 mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 p-2 -ml-2 text-[#A1A1AA] hover:text-white transition-colors border border-[#222] rounded-full hover:bg-[#1A1A1A] self-start"
          aria-label="Back to Shoots"
        >
          <ArrowLeft size={16} />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] pr-2">Back</span>
        </button>
        <div>
          <span className="text-[#D4AF37] text-[10px] uppercase tracking-[0.3em] mb-1.5 block font-bold">
            System Architecture
          </span>
          <h1 className="text-3xl sm:text-4xl font-light tracking-tight text-white">AI Engine</h1>
        </div>
      </header>

      {/* Save Notification Toast */}
      {savedNotice && (
        <div className="mb-6 p-3 bg-emerald-950/80 border border-emerald-800/60 rounded-xl flex items-center justify-between text-emerald-400 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <Check size={14} strokeWidth={3} />
            <span>{savedNotice}</span>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-emerald-500/80">Saved to Settings</span>
        </div>
      )}

      <div className="space-y-6 pb-12">
        {/* ========================================================
            OPENAI CORE ENGINE CARD
            ======================================================== */}
        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-center justify-between border-b border-[#222] pb-5 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
                <Cpu size={20} />
              </div>
              <div>
                <h2 className="text-lg font-light text-white tracking-tight">OpenAI Architecture</h2>
                <p className="text-xs text-[#A1A1AA] mt-0.5">Primary intelligence & visual reference platform</p>
              </div>
            </div>

            {/* Status Badge */}
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full flex items-center gap-1.5 border ${
                isCreativeConnected
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50'
                  : 'bg-amber-950/30 text-amber-400 border-amber-800/40'
              }`}
            >
              {isCreativeConnected ? (
                <>
                  <Check size={12} strokeWidth={3} /> CONNECTED
                </>
              ) : (
                'NOT CONNECTED'
              )}
            </span>
          </div>

          {/* Model Capabilities Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {/* Creative Intelligence */}
            <div className="bg-[#191919] border border-[#2B2B2B] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain size={16} className="text-[#D4AF37]" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4AF37]">
                  Creative AI
                </span>
              </div>
              <p className="text-sm font-medium text-white mb-1">OpenAI GPT</p>
              <p className="text-xs text-[#888] leading-relaxed">
                Powers shoot guide generation, shooting sequence arc, client cues, photographer concepts, and color styling recipes.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[10px] font-mono text-[#AAA] bg-[#111] px-2 py-0.5 rounded border border-[#222]">
                  gpt-4o
                </span>
                <span className="text-[10px] font-mono text-[#AAA] bg-[#111] px-2 py-0.5 rounded border border-[#222]">
                  Structured JSON
                </span>
              </div>
            </div>

            {/* Image Reference Generation */}
            <div className="bg-[#191919] border border-[#2B2B2B] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={16} className="text-[#D4AF37]" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4AF37]">
                  Image Reference
                </span>
              </div>
              <p className="text-sm font-medium text-white mb-1">GPT Image 2</p>
              <p className="text-xs text-[#888] leading-relaxed">
                Generates high-precision visual posing references grounded in actual venue environments and outfit styling.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[10px] font-mono text-[#AAA] bg-[#111] px-2 py-0.5 rounded border border-[#222]">
                  gpt-image-2
                </span>
                <span className="text-[10px] font-mono text-[#AAA] bg-[#111] px-2 py-0.5 rounded border border-[#222]">
                  Environment Grounding
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-[#111] border border-[#222] rounded-xl flex items-center gap-3 text-xs text-[#A1A1AA]">
            <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
            <span>
              Server-side authentication active. <code className="text-[#D4AF37] font-mono">OPENAI_API_KEY</code> is secured on the server and never exposed to the client.
            </span>
          </div>
        </div>

        {/* ========================================================
            DEFAULT REFERENCE SOURCE PREFERENCE
            ======================================================== */}
        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <Layers size={18} className="text-[#D4AF37]" />
            <div>
              <h2 className="text-base font-light text-white tracking-tight">Default Reference Source</h2>
              <p className="text-xs text-[#888]">Choose your primary visual reference workflow</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {/* OpenAI Image */}
            <div
              onClick={() => handleSelectReference('openai')}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                selectedReferenceProvider === 'openai'
                  ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-white'
                  : 'bg-[#191919] border-[#2B2B2B] text-[#A1A1AA] hover:border-[#444]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Sparkles size={16} className={selectedReferenceProvider === 'openai' ? 'text-[#D4AF37]' : 'text-[#777]'} />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-white">AI Reference (GPT Image 2)</p>
                  <p className="text-[11px] text-[#888]">Generate bespoke reference cards with AI</p>
                </div>
              </div>
              {selectedReferenceProvider === 'openai' && <Check size={16} className="text-[#D4AF37]" />}
            </div>

            {/* My Reference Upload */}
            <div
              onClick={() => handleSelectReference('upload')}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                selectedReferenceProvider === 'upload'
                  ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-white'
                  : 'bg-[#191919] border-[#2B2B2B] text-[#A1A1AA] hover:border-[#444]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Upload size={16} className={selectedReferenceProvider === 'upload' ? 'text-[#D4AF37]' : 'text-[#777]'} />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-white">My Reference Photos</p>
                  <p className="text-[11px] text-[#888]">Upload your own photographs & samples</p>
                </div>
              </div>
              {selectedReferenceProvider === 'upload' && <Check size={16} className="text-[#D4AF37]" />}
            </div>
          </div>
        </div>

        {/* ========================================================
            STORAGE & OPTIONAL CLOUD SYNC ARCHITECTURE
            ======================================================== */}
        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-center justify-between border-b border-[#222] pb-5 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
                <HardDrive size={20} />
              </div>
              <div>
                <h2 className="text-lg font-light text-white tracking-tight">Storage & Offline Architecture</h2>
                <p className="text-xs text-[#A1A1AA] mt-0.5">Local-first persistence with optional cloud backup</p>
              </div>
            </div>

            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full flex items-center gap-1.5 border ${
                isCloudBackupConfigured()
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-700/50'
              }`}
            >
              {isCloudBackupConfigured() ? (
                <>
                  <Cloud size={12} /> SUPABASE SYNC ACTIVE
                </>
              ) : (
                <>
                  <HardDrive size={12} /> LOCAL INDEXEDDB ONLY
                </>
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#191919] border border-[#2B2B2B] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database size={16} className="text-[#D4AF37]" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4AF37]">
                  Primary Source of Truth
                </span>
              </div>
              <p className="text-sm font-medium text-white mb-1">IndexedDB & localStorage</p>
              <p className="text-xs text-[#888] leading-relaxed">
                All event metadata, photos, generated visual cards, and color recipes are preserved on-device. Zero cloud latency and full offline capability on shoots.
              </p>
            </div>

            <div className="bg-[#191919] border border-[#2B2B2B] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Cloud size={16} className="text-[#D4AF37]" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4AF37]">
                  Optional Cloud Backup
                </span>
              </div>
              <p className="text-sm font-medium text-white mb-1">Supabase Storage & PostgreSQL</p>
              <p className="text-xs text-[#888] leading-relaxed">
                Asynchronous, non-blocking backup. Configured via <code className="text-[#D4AF37] font-mono text-[10px]">VITE_SUPABASE_URL</code> and <code className="text-[#D4AF37] font-mono text-[10px]">VITE_SUPABASE_ANON_KEY</code>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
