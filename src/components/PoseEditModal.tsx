import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Edit2, AlertCircle } from 'lucide-react';
import { Pose } from '../types';

interface PoseEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  pose: Pose | null;
  onSave: (updatedPose: Pose) => void;
}

const CATEGORY_OPTIONS = [
  'Warm Up',
  'Interaction',
  'Walking',
  'Environmental',
  'Intimate',
  'Editorial',
  'Movement',
  'Creative',
  'Hero',
];

export function PoseEditModal({ isOpen, onClose, pose, onSave }: PoseEditModalProps) {
  const [title, setTitle] = useState('');
  const [clientDirection, setClientDirection] = useState('');
  const [photographerConcept, setPhotographerConcept] = useState('');
  const [shootingIntent, setShootingIntent] = useState('');
  const [category, setCategory] = useState('Interaction');
  const [mood, setMood] = useState('');

  useEffect(() => {
    if (pose) {
      setTitle(pose.title || '');
      setClientDirection(pose.clientDirection || '');
      setPhotographerConcept(pose.photographerConcept || '');
      setShootingIntent(pose.shootingIntent || '');
      setCategory(pose.category || 'Interaction');
      setMood(pose.mood || '');
    }
  }, [pose, isOpen]);

  if (!isOpen || !pose) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const titleTrimmed = title.trim() || pose.title;
    const directionTrimmed = clientDirection.trim() || pose.clientDirection;
    const conceptTrimmed = photographerConcept.trim() || pose.photographerConcept;
    const intentTrimmed = shootingIntent.trim();
    const moodTrimmed = mood.trim() || pose.mood;

    const hasInstructionChanged =
      titleTrimmed !== pose.title ||
      directionTrimmed !== pose.clientDirection ||
      conceptTrimmed !== pose.photographerConcept ||
      intentTrimmed !== (pose.shootingIntent || '') ||
      category !== (pose.category || 'Interaction') ||
      moodTrimmed !== pose.mood;

    const hasExistingReference = Boolean(pose.referenceImage || pose.aiReference);

    const updatedPose: Pose = {
      ...pose,
      title: titleTrimmed,
      clientDirection: directionTrimmed,
      photographerConcept: conceptTrimmed,
      shootingIntent: intentTrimmed,
      category,
      mood: moodTrimmed,
      // If instructions were changed and reference already existed, flag for notice
      instructionsChanged: hasExistingReference && hasInstructionChanged ? true : pose.instructionsChanged,
    };

    onSave(updatedPose);
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/85 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-2xl bg-[#141414] border border-[#2B2B2B] rounded-2xl shadow-2xl overflow-hidden z-10 my-auto flex flex-col max-h-[92vh]"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-[#222] bg-[#181818]/60 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
                <Edit2 size={16} />
              </div>
              <div>
                <span className="text-[10px] text-[#D4AF37] uppercase tracking-[0.25em] font-bold block">
                  Pose #{String(pose.order || 1).padStart(2, '0')}
                </span>
                <h2 className="text-lg font-light text-white tracking-tight">Edit Pose Details</h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-[#888] hover:text-white rounded-full hover:bg-[#222] transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Notice if AI reference already exists */}
            {(pose.referenceImage || pose.aiReference) && (
              <div className="p-3 bg-amber-950/25 border border-amber-800/40 rounded-xl flex items-start gap-2.5 text-xs text-amber-300/90 leading-relaxed">
                <AlertCircle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Editing instructions preserves your existing reference image. If you change key posing cues, you can optionally regenerate the reference card later.
                </span>
              </div>
            )}

            {/* Pose Title */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-[#D4AF37] mb-2">
                Pose Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Amber Archway Stroll"
                required
                className="w-full bg-[#1A1A1A] border border-[#333] focus:border-[#D4AF37] text-white px-4 py-3 rounded-xl text-sm outline-none transition-colors"
              />
            </div>

            {/* Category & Mood in 2-column on desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-[#A1A1AA] mb-2">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-[#333] focus:border-[#D4AF37] text-white px-4 py-3 rounded-xl text-sm outline-none transition-colors cursor-pointer"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-[#A1A1AA] mb-2">
                  Emotional Mood
                </label>
                <input
                  type="text"
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                  placeholder="e.g. Intimate, Soulful"
                  className="w-full bg-[#1A1A1A] border border-[#333] focus:border-[#D4AF37] text-white px-4 py-3 rounded-xl text-sm outline-none transition-colors"
                />
              </div>
            </div>

            {/* Client Direction ("Say to Client") */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-[#D4AF37] mb-1.5">
                Client Direction <span className="text-white/40 font-normal lowercase">(spoken to couple in Shoot Mode)</span>
              </label>
              <p className="text-[11px] text-[#888] mb-2">
                Conversational, human verbal cues spoken aloud during shooting.
              </p>
              <textarea
                value={clientDirection}
                onChange={(e) => setClientDirection(e.target.value)}
                rows={3}
                required
                placeholder="e.g. Hold hands, walk slowly toward me, and whisper something funny in her ear."
                className="w-full bg-[#1A1A1A] border border-[#333] focus:border-[#D4AF37] text-white px-4 py-3 rounded-xl text-sm leading-relaxed outline-none transition-colors resize-y min-h-[85px]"
              />
            </div>

            {/* Photographer Concept */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-[#A1A1AA] mb-1.5">
                Photographer Composition & Framing Concept
              </label>
              <p className="text-[11px] text-[#888] mb-2">
                Framing, depth, angle, light positioning, and visual balance.
              </p>
              <textarea
                value={photographerConcept}
                onChange={(e) => setPhotographerConcept(e.target.value)}
                rows={3}
                placeholder="e.g. Frame through architectural arch with leading corridor lines and soft golden backlight."
                className="w-full bg-[#1A1A1A] border border-[#333] focus:border-[#D4AF37] text-white px-4 py-3 rounded-xl text-sm leading-relaxed outline-none transition-colors resize-y min-h-[85px]"
              />
            </div>

            {/* Shooting Intent */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-[#A1A1AA] mb-2">
                Shooting Intent
              </label>
              <input
                type="text"
                value={shootingIntent}
                onChange={(e) => setShootingIntent(e.target.value)}
                placeholder="e.g. Establish emotional intimacy and motion texture."
                className="w-full bg-[#1A1A1A] border border-[#333] focus:border-[#D4AF37] text-white px-4 py-3 rounded-xl text-sm outline-none transition-colors"
              />
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-[#222] flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 rounded-xl text-xs uppercase tracking-[0.2em] font-bold text-[#A1A1AA] hover:text-white bg-[#1E1E1E] hover:bg-[#282828] border border-[#333] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 px-8 py-3 rounded-xl text-xs uppercase tracking-[0.2em] font-bold text-black bg-[#D4AF37] hover:bg-[#E5C158] transition-colors shadow-lg shadow-[#D4AF37]/20"
              >
                <Check size={16} strokeWidth={2.5} />
                <span>Save Pose</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
