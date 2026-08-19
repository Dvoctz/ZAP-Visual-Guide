import React, { useEffect, useState, useRef } from 'react';
import { ViewState, ShootEvent, EVENT_TYPES, BRIDE_OUTFIT_TYPES, GROOM_OUTFIT_TYPES, COMMON_OUTFIT_COLORS, OutfitContext, Pose, ColorStyle, ReferenceImageData, ProviderId } from './types';
import { getEvents, saveEvent, getEvent, deleteEvent, getActiveEventId, setActiveEventId, updateEvent, hydrateEventImages } from './lib/storage';
import { generateShootGuide, generateOpenAIPoseReference } from './lib/api';
import { saveImageToDB } from './lib/imageStorage';
import { CreativeEngine } from './lib/creativeEngine';
import { ReferenceEngine, getEffectiveBrideOutfit, getEffectiveGroomOutfit } from './lib/referenceEngine';
import { ReferenceEngineModal } from './components/ReferenceEngineModal';
import { PoseEditModal } from './components/PoseEditModal';
import { SettingsView } from './components/SettingsView';
import { EnvironmentSection } from './components/EnvironmentSection';
import { ColorStyleView } from './components/ColorStyleView';
import { ArrowLeft, Trash2, MapPin, Clock, Sun, Image as ImageIcon, Palette, Plus, Camera, Sparkles, ChevronLeft, ChevronRight, X, Check, Edit2, MoveUp, MoveDown, RefreshCw, Menu, Upload, ZoomIn, CheckCircle2, AlertCircle, Play, Pause, Shirt, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [events, setEvents] = useState<ShootEvent[]>([]);
  const [activeEventId, setActiveEventIdState] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>({ name: 'home' });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [deleteConfirmEventId, setDeleteConfirmEventId] = useState<string | null>(null);

  // Load events on mount and hydrate images from IndexedDB
  useEffect(() => {
    async function loadAndHydrate() {
      const loaded = getEvents().sort((a, b) => b.createdAt - a.createdAt);
      setEvents(loaded);

      const savedId = getActiveEventId();
      let activeId = null;
      if (savedId && getEvent(savedId)) {
        activeId = savedId;
        setActiveEventIdState(savedId);
      } else if (loaded.length > 0) {
        activeId = loaded[0].id;
        setActiveEventIdState(loaded[0].id);
        setActiveEventId(loaded[0].id);
      }

      // Asynchronously hydrate images from IndexedDB
      const hydrated = await Promise.all(loaded.map((ev) => hydrateEventImages(ev)));
      setEvents(hydrated);
    }
    loadAndHydrate();
  }, []);

  const handleCreateEvent = (event: ShootEvent) => {
    saveEvent(event);
    setEvents((prev) => [event, ...prev].sort((a, b) => b.createdAt - a.createdAt));
    setActiveEvent(event.id);
  };

  const setActiveEvent = (id: string | null, preserveSubView = false) => {
    setActiveEventIdState(id);
    setActiveEventId(id);
    if (id) {
      if (preserveSubView && (currentView.name === 'posingGuide' || currentView.name === 'colorStyle')) {
        setCurrentView({ name: currentView.name, eventId: id });
      } else {
        setCurrentView({ name: 'home' });
      }
    }
  };

  const handleDeleteEventClick = (id: string) => {
    setDeleteConfirmEventId(id);
  };

  const handleConfirmDeleteEvent = () => {
    if (!deleteConfirmEventId) return;
    const idToDelete = deleteConfirmEventId;
    deleteEvent(idToDelete);
    const remaining = getEvents().sort((a, b) => b.createdAt - a.createdAt);
    setEvents(remaining);
    if (remaining.length > 0) {
      setActiveEvent(remaining[0].id);
    } else {
      setActiveEvent(null);
      setCurrentView({ name: 'home' });
    }
    setDeleteConfirmEventId(null);
  };

  const handleCancelDeleteEvent = () => {
    setDeleteConfirmEventId(null);
  };

  const handleUpdateEvent = (id: string, updates: Partial<ShootEvent>) => {
    updateEvent(id, updates);
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
    );
  };

  const activeEvent = activeEventId ? events.find(e => e.id === activeEventId) : null;

  const navigateTo = (view: ViewState) => setCurrentView(view);

  // Mobile edge swipe & keyboard handling (ONLY active outside Shoot Mode)
  useEffect(() => {
    if (currentView.name === 'shootMode') return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = Date.now();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches.length !== 1) return;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const duration = Date.now() - startTime;

      if (duration > 600) return; // Ignore long presses

      // Swipe from left edge (within 40px from screen edge) to open drawer
      if (!isDrawerOpen && startX <= 40 && deltaX > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
        setIsDrawerOpen(true);
      }
      // Swipe left to close drawer
      else if (isDrawerOpen && deltaX < -50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
        setIsDrawerOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawerOpen) {
        setIsDrawerOpen(false);
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDrawerOpen, currentView.name]);

  // When Shoot Mode is active, render it directly to provide a dedicated fullscreen immersive interface without the app navigation bar or drawer
  if (currentView.name === 'shootMode' && activeEvent) {
    return (
      <ShootModeView 
        event={activeEvent} 
        initialPoseIndex={currentView.initialPoseIndex}
        onExit={() => navigateTo({ name: 'posingGuide', eventId: activeEvent.id })}
        onUpdate={(updates) => handleUpdateEvent(activeEvent.id, updates)}
      />
    );
  }

  return (
    <div className="w-full h-screen bg-[#111111] text-white flex flex-col font-sans overflow-hidden">
      {/* App Header */}
      <header className="h-16 md:h-20 shrink-0 border-b border-[#222] px-4 md:px-8 flex items-center justify-between bg-[#111] z-30">
        {/* Mobile Header: Event Navigation Control */}
        <div className="flex md:hidden items-center gap-2.5 max-w-[calc(100vw-80px)]">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="flex items-center gap-2.5 py-1.5 px-2.5 -ml-1 rounded-xl bg-[#1A1A1A] hover:bg-[#222] active:bg-[#282828] border border-[#333] transition-all text-left group"
            aria-label="Open Event Selector Drawer"
          >
            <Menu size={18} className="text-[#D4AF37] shrink-0 group-hover:scale-110 transition-transform" />
            <div className="flex flex-col min-w-0 pr-1">
              <span className="text-[12px] sm:text-[13px] font-semibold text-white truncate max-w-[170px] sm:max-w-[240px] uppercase tracking-wider leading-tight">
                {activeEvent ? activeEvent.name : 'ZAP Visual Guide'}
              </span>
              <span className="text-[9px] tracking-[0.15em] uppercase text-[#D4AF37] leading-none mt-0.5 font-medium">
                {activeEvent ? (activeEvent.type === 'Custom' ? activeEvent.customType : activeEvent.type) : 'Select Shoot'}
              </span>
            </div>
          </button>
        </div>

        {/* Desktop Header: Brand display */}
        <div className="hidden md:flex flex-col">
          <h1 className="text-[#D4AF37] font-serif italic text-2xl tracking-[0.2em] leading-none uppercase">ZAP</h1>
          <span className="text-[10px] tracking-[0.4em] uppercase text-white/60 -mt-0.5">Visual Guide</span>
        </div>

        {/* Right Header Actions */}
        <div className="flex gap-2.5 md:gap-4 items-center">
          <button
            onClick={() => {
              setActiveEvent(null);
              navigateTo({ name: 'create' });
            }}
            className="md:hidden h-9 px-3 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider hover:bg-[#D4AF37]/25 transition-colors"
          >
            <Plus size={14} />
            <span>New</span>
          </button>

          <div className="h-9 w-9 md:h-10 md:w-10 rounded-full border border-[#D4AF37]/30 flex items-center justify-center bg-[#1A1A1A] shrink-0">
            <span className="text-[#D4AF37] text-xs md:text-sm font-semibold">ZP</span>
          </div>
        </div>
      </header>

      {/* Main Content & Desktop Sidebar */}
      <main className="flex-1 flex min-h-0 relative">
        {/* Desktop Sidebar (unchanged desktop behavior) */}
        <aside className="hidden md:flex w-80 border-r border-[#222] bg-[#0d0d0d] flex-col p-6 overflow-y-auto shrink-0">
          <div className="flex justify-between items-center mb-8 shrink-0">
            <h2 className="text-[11px] uppercase tracking-widest text-[#A1A1AA]">Recent Shoots</h2>
            <button 
              onClick={() => {
                setActiveEvent(null);
                navigateTo({ name: 'create' });
              }}
              className="text-[#D4AF37] text-[10px] font-bold uppercase tracking-tighter hover:opacity-80 flex items-center gap-1"
            >
              + Create
            </button>
          </div>
          <div className="space-y-4 flex-1">
            {events.map(event => (
              <div 
                key={event.id}
                onClick={() => setActiveEvent(event.id, true)}
                className={`p-4 rounded-r-lg cursor-pointer transition-colors ${
                  activeEventId === event.id 
                    ? 'bg-[#1A1A1A] border-l-2 border-[#D4AF37]' 
                    : 'bg-transparent border-l-2 border-transparent hover:bg-white/5 text-white/70'
                }`}
              >
                <p className={`text-sm font-semibold ${activeEventId === event.id ? 'text-white' : ''}`}>{event.name}</p>
                <p className="text-[11px] text-[#A1A1AA] mt-0.5">{event.location}</p>
                {activeEventId === event.id && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 bg-[#111] text-[#D4AF37] rounded uppercase tracking-tighter">
                      {event.type === 'Custom' ? event.customType : event.type}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-[#111] text-[#A1A1AA] rounded uppercase tracking-tighter">
                      {event.style}
                    </span>
                  </div>
                )}
              </div>
            ))}
            {events.length === 0 && (
              <div className="text-center py-10">
                <p className="text-xs text-[#A1A1AA]">No shoots yet.</p>
              </div>
            )}
          </div>
          <div className="mt-auto pt-6 shrink-0">
            <div className="bg-[#1A1A1A] p-4 rounded-xl text-center border border-dashed border-[#333]">
              <p className="text-[11px] text-[#A1A1AA] italic uppercase">Photography Mood</p>
              <p className="text-[10px] text-white/40 mt-1 uppercase tracking-widest">PRO VERSION ACTIVE</p>
            </div>
          </div>
        </aside>

        {/* Primary View Area */}
        <section className="flex flex-1 flex-col overflow-y-auto bg-gradient-to-br from-[#111] to-[#151515] p-4 sm:p-6 md:p-10">
          <div className="max-w-3xl mx-auto w-full">
            {currentView.name === 'home' && !activeEvent && (
              <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-[#333] rounded-2xl bg-[#1A1A1A] mt-10">
                <Camera className="w-10 h-10 text-[#D4AF37]/50 mb-6" strokeWidth={1} />
                <h2 className="text-lg font-light tracking-wide mb-2 text-[#EAEAEA]">No shoot selected.</h2>
                <p className="text-[#A1A1AA] text-sm mb-8 max-w-sm">Select a shoot from the menu or create a new one to begin.</p>
                <button
                  onClick={() => navigateTo({ name: 'create' })}
                  className="flex items-center gap-2 text-[#111] bg-[#D4AF37] hover:bg-white px-6 py-3 rounded text-[10px] font-bold uppercase tracking-[0.2em] transition-colors"
                >
                  <Plus size={16} />
                  <span>Create Event</span>
                </button>
              </div>
            )}

            {currentView.name === 'create' && (
              <CreateEventForm onSubmit={handleCreateEvent} onCancel={() => navigateTo({ name: 'home' })} />
            )}

            {currentView.name === 'home' && activeEvent && (
              <EventDetailView 
                event={activeEvent} 
                onNavigate={navigateTo} 
                onDelete={() => handleDeleteEventClick(activeEvent.id)} 
                onUpdate={(updates) => handleUpdateEvent(activeEvent.id, updates)}
              />
            )}

            {currentView.name === 'posingGuide' && activeEvent && (
              <PosingGuideView 
                event={activeEvent} 
                onBack={() => navigateTo({ name: 'home' })} 
                onUpdate={(updates) => handleUpdateEvent(activeEvent.id, updates)}
                onStartShoot={(index) => navigateTo({ name: 'shootMode', eventId: activeEvent.id, initialPoseIndex: index })}
              />
            )}

            {currentView.name === 'colorStyle' && activeEvent && (
              <ColorStyleView 
                event={activeEvent} 
                onBack={() => navigateTo({ name: 'home' })} 
                onNavigate={navigateTo}
                onUpdate={(updates) => handleUpdateEvent(activeEvent.id, updates)}
              />
            )}

            {currentView.name === 'settings' && (
              <SettingsView onBack={() => navigateTo({ name: 'home' })} />
            )}
          </div>
        </section>
      </main>

      {/* Mobile Event Selector Drawer */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            {/* Dark Translucent Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 md:hidden"
            />

            {/* Left Drawer Panel */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              className="fixed top-0 left-0 bottom-0 w-[85%] max-w-sm bg-[#0d0d0d] border-r border-[#222] z-50 md:hidden flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Drawer Header */}
              <div className="p-5 border-b border-[#222] flex items-center justify-between bg-[#111] shrink-0">
                <div className="flex flex-col">
                  <h2 className="text-[#D4AF37] font-serif italic text-xl tracking-[0.2em] leading-none uppercase">ZAP</h2>
                  <span className="text-[9px] tracking-[0.3em] uppercase text-white/60 mt-0.5">Visual Guide</span>
                </div>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="w-9 h-9 rounded-xl bg-[#1A1A1A] border border-[#333] flex items-center justify-center text-white/80 hover:text-white transition-colors"
                  aria-label="Close Event Drawer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Title & Quick Create */}
              <div className="px-5 py-3.5 flex items-center justify-between border-b border-[#1A1A1A] bg-[#0f0f0f] shrink-0">
                <span className="text-[11px] uppercase tracking-widest text-[#A1A1AA] font-bold">Recent Shoots</span>
                <button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    setActiveEvent(null);
                    navigateTo({ name: 'create' });
                  }}
                  className="text-[#D4AF37] text-[10px] font-bold uppercase tracking-wider bg-[#D4AF37]/10 border border-[#D4AF37]/30 px-2.5 py-1 rounded hover:bg-[#D4AF37]/20 flex items-center gap-1 transition-colors"
                >
                  <Plus size={12} />
                  <span>Create</span>
                </button>
              </div>

              {/* Saved Events List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {events.map((event) => {
                  const isActive = activeEventId === event.id;
                  return (
                    <div
                      key={event.id}
                      onClick={() => {
                        setActiveEvent(event.id, true);
                        setIsDrawerOpen(false);
                      }}
                      className={`p-4 rounded-xl cursor-pointer transition-all ${
                        isActive
                          ? 'bg-[#1A1A1A] border-l-4 border-[#D4AF37] shadow-lg text-white'
                          : 'bg-[#141414] border-l-4 border-transparent hover:bg-[#1A1A1A] text-white/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-tight text-white">{event.name}</p>
                        {isActive && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-[#D4AF37]/20 text-[#D4AF37] rounded shrink-0">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#A1A1AA] mt-1 flex items-center gap-1">
                        <MapPin size={12} className="shrink-0 text-white/40" />
                        <span className="truncate">{event.location}</span>
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        <span className="text-[9px] px-2 py-0.5 bg-[#0d0d0d] text-[#D4AF37] border border-[#D4AF37]/25 rounded uppercase tracking-wider">
                          {event.type === 'Custom' ? event.customType : event.type}
                        </span>
                        <span className="text-[9px] px-2 py-0.5 bg-[#0d0d0d] text-[#A1A1AA] border border-[#222] rounded uppercase tracking-wider">
                          {event.style}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {events.length === 0 && (
                  <div className="text-center py-12 px-4 border border-dashed border-[#262626] rounded-xl bg-[#141414]">
                    <p className="text-xs text-[#A1A1AA] mb-3">No saved shoots yet.</p>
                    <button
                      onClick={() => {
                        setIsDrawerOpen(false);
                        setActiveEvent(null);
                        navigateTo({ name: 'create' });
                      }}
                      className="text-[10px] font-bold uppercase tracking-widest text-[#111] bg-[#D4AF37] px-4 py-2 rounded"
                    >
                      Create First Shoot
                    </button>
                  </div>
                )}
              </div>

              {/* Drawer Bottom Actions */}
              <div className="p-4 border-t border-[#222] bg-[#111] shrink-0">
                <button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    setActiveEvent(null);
                    navigateTo({ name: 'create' });
                  }}
                  className="w-full h-11 bg-[#D4AF37] hover:bg-white text-black font-bold text-[11px] uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg"
                >
                  <Plus size={16} />
                  <span>Create New Shoot</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* In-App Delete Event Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmEventId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCancelDeleteEvent}
              className="fixed inset-0 bg-black/85 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-md bg-[#141414] border border-[#2B2B2B] rounded-2xl shadow-2xl p-6 sm:p-7 z-10 space-y-4"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-red-950/40 border border-red-800/50 flex items-center justify-center text-red-400 shrink-0">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-light text-white tracking-tight uppercase">DELETE EVENT?</h3>
                  <p className="text-xs text-[#888]">This action cannot be undone.</p>
                </div>
              </div>

              <p className="text-sm text-[#A1A1AA] leading-relaxed">
                Are you sure you want to delete this shoot guide? All generated poses, reference images, and color styles for this event will be permanently removed from your device.
              </p>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-[#222]">
                <button
                  type="button"
                  onClick={handleCancelDeleteEvent}
                  className="px-5 py-2.5 rounded-xl text-xs uppercase tracking-[0.2em] font-bold text-[#A1A1AA] hover:text-white bg-[#1E1E1E] hover:bg-[#282828] border border-[#333] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteEvent}
                  className="px-6 py-2.5 rounded-xl text-xs uppercase tracking-[0.2em] font-bold text-white bg-red-600 hover:bg-red-500 transition-colors shadow-lg shadow-red-900/30"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* App Bottom Navigation */}
      <nav className="h-16 shrink-0 border-t border-[#222] px-8 flex items-center justify-center bg-[#111] z-30 relative">
        <div className="flex gap-16">
          <button 
            onClick={() => {
              if (activeEventId) navigateTo({ name: 'home' });
              else navigateTo({ name: 'home' });
            }}
            className={`flex flex-col items-center gap-1 ${currentView.name === 'home' || currentView.name === 'create' || currentView.name === 'posingGuide' || currentView.name === 'colorStyle' ? 'opacity-100' : 'opacity-40 hover:opacity-100 transition-opacity'}`}
          >
            <div className={`w-5 h-5 border-2 ${currentView.name === 'home' || currentView.name === 'create' || currentView.name === 'posingGuide' || currentView.name === 'colorStyle' ? 'border-[#D4AF37]' : 'border-white'} rounded-[2px]`}></div>
            <span className={`text-[9px] uppercase tracking-widest ${currentView.name === 'home' || currentView.name === 'create' || currentView.name === 'posingGuide' || currentView.name === 'colorStyle' ? 'text-[#D4AF37]' : 'text-white'}`}>Home</span>
          </button>
          <button 
            onClick={() => setIsDrawerOpen(true)}
            className={`md:hidden flex flex-col items-center gap-1 ${isDrawerOpen ? 'opacity-100' : 'opacity-40 hover:opacity-100 transition-opacity'}`}
          >
            <div className={`w-5 h-5 border-2 ${isDrawerOpen ? 'border-[#D4AF37]' : 'border-white'} rounded-full`}></div>
            <span className={`text-[9px] uppercase tracking-widest ${isDrawerOpen ? 'text-[#D4AF37]' : 'text-white'}`}>Guides</span>
          </button>
          <button 
            onClick={() => {}}
            className="hidden md:flex flex-col items-center gap-1 opacity-100 cursor-default"
          >
            <div className="w-5 h-5 border-2 border-white rounded-full opacity-40"></div>
            <span className="text-[9px] uppercase tracking-widest text-white opacity-40">Guides</span>
          </button>
          <button 
            onClick={() => navigateTo({ name: 'settings' })}
            className={`flex flex-col items-center gap-1 ${currentView.name === 'settings' ? 'opacity-100' : 'opacity-40 hover:opacity-100 transition-opacity'}`}
          >
            <div className={`w-5 h-5 border-2 ${currentView.name === 'settings' ? 'border-[#D4AF37]' : 'border-white'} rotate-45`}></div>
            <span className={`text-[9px] uppercase tracking-widest ${currentView.name === 'settings' ? 'text-[#D4AF37]' : 'text-white'}`}>Settings</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

function CreateEventForm({ onSubmit, onCancel }: { onSubmit: (e: ShootEvent) => void, onCancel: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState(EVENT_TYPES[0] as string);
  const [customType, setCustomType] = useState('');
  const [location, setLocation] = useState('');
  const [style, setStyle] = useState('');
  const [timeOfDay, setTimeOfDay] = useState('');
  const [description, setDescription] = useState('');

  // Bride & Groom Outfit State
  const [showOutfits, setShowOutfits] = useState(true);
  const [brideType, setBrideType] = useState(BRIDE_OUTFIT_TYPES[0] as string);
  const [brideCustomType, setBrideCustomType] = useState('');
  const [brideColor, setBrideColor] = useState(COMMON_OUTFIT_COLORS[0] as string);
  const [brideCustomColor, setBrideCustomColor] = useState('');
  const [brideNotes, setBrideNotes] = useState('');

  const [groomType, setGroomType] = useState(GROOM_OUTFIT_TYPES[0] as string);
  const [groomCustomType, setGroomCustomType] = useState('');
  const [groomColor, setGroomColor] = useState(COMMON_OUTFIT_COLORS[2] as string); // Ivory & Gold
  const [groomCustomColor, setGroomCustomColor] = useState('');
  const [groomNotes, setGroomNotes] = useState('');

  // Adjust outfit defaults when event type changes
  const handleTypeChange = (newType: string) => {
    setType(newType);
    const typeLower = newType.toLowerCase();
    if (typeLower.includes('haldi')) {
      setBrideType('Sharara');
      setBrideColor('Mustard Yellow');
      setGroomType('Kurta');
      setGroomColor('Mustard Yellow');
    } else if (typeLower.includes('mehndi')) {
      setBrideType('Lehenga');
      setBrideColor('Pastel Peach');
      setGroomType('Kurta');
      setGroomColor('Mint Green & Ivory');
    } else if (typeLower.includes('sangeet')) {
      setBrideType('Lehenga');
      setBrideColor('Emerald Green');
      setGroomType('Bandhgala');
      setGroomColor('Midnight Black');
    } else if (typeLower.includes('wedding')) {
      setBrideType('Lehenga');
      setBrideColor('Crimson Red');
      setGroomType('Sherwani');
      setGroomColor('Ivory & Gold');
    } else if (typeLower.includes('reception')) {
      setBrideType('Contemporary Gown');
      setBrideColor('Champagne');
      setGroomType('Tuxedo');
      setGroomColor('Midnight Black');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const finalBrideType = brideType === 'Custom' ? (brideCustomType || 'Lehenga') : brideType;
    const finalBrideColor = brideColor === 'Custom' ? (brideCustomColor || 'Festive') : brideColor;

    const finalGroomType = groomType === 'Custom' ? (groomCustomType || 'Sherwani') : groomType;
    const finalGroomColor = groomColor === 'Custom' ? (groomCustomColor || 'Ivory') : groomColor;

    const outfitContext: OutfitContext = {
      bride: {
        type: finalBrideType,
        color: finalBrideColor,
        description: brideNotes || undefined,
      },
      groom: {
        type: finalGroomType,
        color: finalGroomColor,
        description: groomNotes || undefined,
      },
    };

    onSubmit({
      id: crypto.randomUUID(),
      name,
      type,
      customType: type === 'Custom' ? customType : undefined,
      location,
      style,
      timeOfDay,
      description,
      outfitContext,
      createdAt: Date.now(),
    });
  };

  return (
    <div className="w-full">
      <header className="flex flex-col sm:flex-row sm:items-center gap-6 mb-12">
        <button 
          onClick={onCancel}
          className="flex items-center gap-2 p-2 -ml-2 text-[#A1A1AA] hover:text-white transition-colors border border-[#222] rounded-full hover:bg-[#1A1A1A] self-start"
        >
          <ArrowLeft size={16} />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] pr-2">Back to Shoots</span>
        </button>
        <div>
          <span className="text-[#D4AF37] text-[10px] uppercase tracking-[0.3em] mb-1.5 block">Create</span>
          <h1 className="text-3xl sm:text-4xl font-light tracking-tight">New Shoot Guide</h1>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="name" className="block text-[10px] uppercase tracking-widest text-[#A1A1AA]">Event Name</label>
          <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Zanzibar Stone Town Couple Shoot" className="w-full bg-[#1A1A1A] border border-[#333] rounded-lg px-4 py-3.5 text-sm text-white placeholder:text-[#555] focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all" />
        </div>
        <div className="space-y-2">
          <label htmlFor="type" className="block text-[10px] uppercase tracking-widest text-[#A1A1AA]">Event Type</label>
          <select id="type" value={type} onChange={(e) => handleTypeChange(e.target.value)} className="w-full bg-[#1A1A1A] border border-[#333] rounded-lg px-4 py-3.5 text-sm text-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] appearance-none transition-all">
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {type === 'Custom' && (
          <div className="space-y-2">
            <label htmlFor="customType" className="block text-[10px] uppercase tracking-widest text-[#A1A1AA]">Custom Event Type</label>
            <input id="customType" type="text" required value={customType} onChange={(e) => setCustomType(e.target.value)} placeholder="e.g., Rehearsal Dinner" className="w-full bg-[#1A1A1A] border border-[#333] rounded-lg px-4 py-3.5 text-sm text-white placeholder:text-[#555] focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all" />
          </div>
        )}
        <div className="space-y-2">
          <label htmlFor="location" className="block text-[10px] uppercase tracking-widest text-[#A1A1AA]">Location</label>
          <input id="location" type="text" required value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g., Stone Town, Zanzibar" className="w-full bg-[#1A1A1A] border border-[#333] rounded-lg px-4 py-3.5 text-sm text-white placeholder:text-[#555] focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="style" className="block text-[10px] uppercase tracking-widest text-[#A1A1AA]">Style / Mood</label>
            <input id="style" type="text" required value={style} onChange={(e) => setStyle(e.target.value)} placeholder="e.g., Cinematic, Romantic" className="w-full bg-[#1A1A1A] border border-[#333] rounded-lg px-4 py-3.5 text-sm text-white placeholder:text-[#555] focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all" />
          </div>
          <div className="space-y-2">
            <label htmlFor="timeOfDay" className="block text-[10px] uppercase tracking-widest text-[#A1A1AA]">Time of Day</label>
            <input id="timeOfDay" type="text" required value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} placeholder="e.g., Golden Hour" className="w-full bg-[#1A1A1A] border border-[#333] rounded-lg px-4 py-3.5 text-sm text-white placeholder:text-[#555] focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all" />
          </div>
        </div>

        {/* Couple Outfits & Styling Section */}
        <div className="p-5 bg-[#141414] border border-[#2A2A2A] rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shirt size={16} className="text-[#D4AF37]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-white">
                Couple Outfits & Styling (Reference Engine)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowOutfits(!showOutfits)}
              className="text-[10px] uppercase tracking-widest text-[#D4AF37] hover:underline"
            >
              {showOutfits ? 'Collapse' : 'Customize'}
            </button>
          </div>

          <p className="text-[11px] text-[#888] leading-relaxed">
            Specify bride and groom attire to ensure consistent, culturally authentic reference images across all poses.
          </p>

          {showOutfits && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-[#222]">
              {/* Bride Outfit */}
              <div className="space-y-3 p-4 bg-[#181818] rounded-lg border border-[#262626]">
                <span className="text-[10px] uppercase tracking-widest font-bold text-[#D4AF37] block">
                  Bride Outfit
                </span>
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-wider text-[#A1A1AA]">Attire Type</label>
                  <select
                    value={brideType}
                    onChange={(e) => setBrideType(e.target.value)}
                    className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
                  >
                    {BRIDE_OUTFIT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                {brideType === 'Custom' && (
                  <input
                    type="text"
                    placeholder="e.g., Designer Anarkali with Cape"
                    value={brideCustomType}
                    onChange={(e) => setBrideCustomType(e.target.value)}
                    className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-[#D4AF37]"
                  />
                )}
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-wider text-[#A1A1AA]">Color Palette</label>
                  <select
                    value={brideColor}
                    onChange={(e) => setBrideColor(e.target.value)}
                    className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
                  >
                    {COMMON_OUTFIT_COLORS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                {brideColor === 'Custom' && (
                  <input
                    type="text"
                    placeholder="e.g., Powder Blue with Rose Gold zari"
                    value={brideCustomColor}
                    onChange={(e) => setBrideCustomColor(e.target.value)}
                    className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-[#D4AF37]"
                  />
                )}
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-wider text-[#A1A1AA]">Styling Notes (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g., Polki necklace, sheer organza veil, floral jewelry"
                    value={brideNotes}
                    onChange={(e) => setBrideNotes(e.target.value)}
                    className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              {/* Groom Outfit */}
              <div className="space-y-3 p-4 bg-[#181818] rounded-lg border border-[#262626]">
                <span className="text-[10px] uppercase tracking-widest font-bold text-[#D4AF37] block">
                  Groom Outfit
                </span>
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-wider text-[#A1A1AA]">Attire Type</label>
                  <select
                    value={groomType}
                    onChange={(e) => setGroomType(e.target.value)}
                    className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
                  >
                    {GROOM_OUTFIT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                {groomType === 'Custom' && (
                  <input
                    type="text"
                    placeholder="e.g., Asymmetric Achkan"
                    value={groomCustomType}
                    onChange={(e) => setGroomCustomType(e.target.value)}
                    className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-[#D4AF37]"
                  />
                )}
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-wider text-[#A1A1AA]">Color Palette</label>
                  <select
                    value={groomColor}
                    onChange={(e) => setGroomColor(e.target.value)}
                    className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
                  >
                    {COMMON_OUTFIT_COLORS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                {groomColor === 'Custom' && (
                  <input
                    type="text"
                    placeholder="e.g., Midnight Navy with antique buttons"
                    value={groomCustomColor}
                    onChange={(e) => setGroomCustomColor(e.target.value)}
                    className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-[#D4AF37]"
                  />
                )}
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-wider text-[#A1A1AA]">Styling Notes (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g., Embroidered stole, safa turban, kalgi brooch"
                    value={groomNotes}
                    onChange={(e) => setGroomNotes(e.target.value)}
                    className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="description" className="block text-[10px] uppercase tracking-widest text-[#A1A1AA]">Visual Feeling (Description)</label>
          <textarea id="description" required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the desired emotional and visual feeling..." rows={4} className="w-full bg-[#1A1A1A] border border-[#333] rounded-lg px-4 py-3.5 text-sm text-white placeholder:text-[#555] focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all resize-none" />
        </div>
        <div className="pt-4 pb-12 sm:pb-0">
          <button type="submit" className="w-full bg-[#D4AF37] hover:bg-white text-[#111] font-bold text-[11px] uppercase tracking-[0.2em] px-6 py-4 rounded-lg transition-colors">
            Create Event Guide
          </button>
        </div>
      </form>
    </div>
  );
}

function EventDetailView({
  event,
  onNavigate,
  onDelete,
  onUpdate,
}: {
  event: ShootEvent;
  onNavigate: (v: ViewState) => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<ShootEvent>) => void;
}) {
  const bride = getEffectiveBrideOutfit(event);
  const groom = getEffectiveGroomOutfit(event);

  return (
    <div className="w-full space-y-10">
      <div>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="h-[1px] w-8 bg-[#D4AF37]"></span>
              <span className="text-[#D4AF37] text-[11px] uppercase tracking-[0.3em]">Active Event</span>
            </div>
            <h2 className="text-4xl font-light mb-4 tracking-tight">{event.name}</h2>
            <div className="flex flex-wrap gap-x-8 gap-y-4 text-[#A1A1AA]">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-widest text-white/40 mb-1">Location</span>
                <span className="text-sm text-white/90">{event.location}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-widest text-white/40 mb-1">Mood</span>
                <span className="text-sm text-white/90">{event.style}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-widest text-white/40 mb-1">Light</span>
                <span className="text-sm text-white/90">{event.timeOfDay}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-widest text-white/40 mb-1">Bride Styling</span>
                <span className="text-sm text-[#D4AF37]">{bride.color} {bride.type}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-widest text-white/40 mb-1">Groom Styling</span>
                <span className="text-sm text-white/90">{groom.color} {groom.type}</span>
              </div>
            </div>
          </div>
          <button onClick={onDelete} className="p-3 text-[#A1A1AA] hover:text-red-400 bg-[#1A1A1A] border border-[#222] hover:border-red-900/50 rounded-full transition-colors" aria-label="Delete Event">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      
      <div className="bg-[#1A1A1A] p-6 sm:p-8 rounded-xl border border-dashed border-[#333]">
        <p className="text-[11px] text-[#A1A1AA] italic uppercase tracking-widest mb-3">Photography Mood</p>
        <p className="text-lg sm:text-xl text-white/80 font-serif font-light leading-relaxed">"{event.description}"</p>
      </div>

      {/* Venue Environments Section */}
      <EnvironmentSection event={event} onUpdateEvent={onUpdate} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
        <button onClick={() => onNavigate({ name: 'posingGuide', eventId: event.id })} className="group cursor-pointer relative bg-[#1A1A1A] h-[340px] rounded-2xl border border-[#333] hover:border-[#D4AF37]/50 transition-all overflow-hidden flex flex-col justify-end p-8 text-left">
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
          <div className="absolute top-8 left-8 h-12 w-12 border border-[#D4AF37] flex items-center justify-center rounded-full">
            <div className="h-6 w-6 border-2 border-[#D4AF37] rounded-sm flex flex-col justify-center items-center gap-0.5">
              <div className="h-[1px] w-3 bg-[#D4AF37]"></div>
              <div className="h-[1px] w-3 bg-[#D4AF37]"></div>
            </div>
          </div>
          <div className="relative z-10">
            <h3 className="text-2xl font-semibold mb-2 tracking-wide group-hover:text-[#D4AF37] transition-colors">Posing Guide</h3>
            <p className="text-[#A1A1AA] text-sm leading-relaxed max-w-[90%]">Visual references and simple directions for the couple to ensure natural flow.</p>
          </div>
        </button>

        <button onClick={() => onNavigate({ name: 'colorStyle', eventId: event.id })} className="group cursor-pointer relative bg-[#1A1A1A] h-[340px] rounded-2xl border border-[#333] hover:border-[#D4AF37]/50 transition-all overflow-hidden flex flex-col justify-end p-8 text-left">
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
          <div className="absolute top-8 left-8 h-12 w-12 border border-[#D4AF37] flex items-center justify-center rounded-full">
            <div className="h-6 w-6 flex items-center gap-1">
              <div className="w-2 h-6 bg-[#D4AF37] opacity-40 rounded-full"></div>
              <div className="w-2 h-6 bg-[#D4AF37] opacity-70 rounded-full"></div>
              <div className="w-2 h-6 bg-[#D4AF37] rounded-full"></div>
            </div>
          </div>
          <div className="relative z-10">
            <h3 className="text-2xl font-semibold mb-2 tracking-wide group-hover:text-[#D4AF37] transition-colors">Color Style</h3>
            <p className="text-[#A1A1AA] text-sm leading-relaxed max-w-[90%]">The visual color direction for editing this shoot. Presets and tone maps.</p>
          </div>
        </button>
      </div>
    </div>
  );
}

function PosingGuideView({
  event,
  onBack,
  onUpdate,
  onStartShoot,
}: {
  event: ShootEvent;
  onBack: () => void;
  onUpdate: (updates: Partial<ShootEvent>) => void;
  onStartShoot: (index: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState('');
  const [regenError, setRegenError] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<number | null>(null);

  // Single pose generation & error state
  const [generatingPoseIds, setGeneratingPoseIds] = useState<Record<string, boolean>>({});
  const [poseErrors, setPoseErrors] = useState<Record<string, string>>({});
  const [poseRegenConfirmId, setPoseRegenConfirmId] = useState<string | null>(null);
  const [engineModalPose, setEngineModalPose] = useState<Pose | null>(null);
  const [editingPoseIndex, setEditingPoseIndex] = useState<number | null>(null);
  
  // Lightbox Modal state
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string; poseOrder: number; clientDirection: string } | null>(null);

  // Batch generation state
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; poseTitle: string } | null>(null);
  const cancelBatchRef = useRef(false);

  const loadingMessages = [
    'Creating your visual shoot guide...',
    'Building the posing sequence...',
    'Creating the matching color direction...',
  ];

  useEffect(() => {
    if (!loading) {
      setLoadingStep(0);
      return;
    }
    const t1 = setTimeout(() => setLoadingStep(1), 1800);
    const t2 = setTimeout(() => setLoadingStep(2), 3600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [loading]);

  const handleRegenerateClick = () => {
    if (loading) return;
    if (event.poses && event.poses.length > 0) {
      setShowConfirmModal(true);
    } else {
      executeRegenerate();
    }
  };

  const executeRegenerate = async () => {
    setLoading(true);
    setError('');
    setRegenError('');
    try {
      const data = await CreativeEngine.generateShootGuide(event);

      // Preserve current active guide in version history if it exists
      const history = event.guideHistory ? [...event.guideHistory] : [];
      if (event.poses && event.poses.length > 0) {
        history.push({
          version: history.length + 1,
          createdAt: Date.now(),
          overallConcept: event.overallConcept,
          poses: event.poses,
          colorStyle: event.colorStyle,
        });
      }

      onUpdate({
        overallConcept: data.overallConcept,
        poses: data.poses,
        colorStyle: data.colorStyle,
        guideHistory: history,
      });

      // Switch back to active guide view
      setViewingVersion(null);
    } catch (err: any) {
      const msg = err?.message || 'Failed to generate shoot guide';
      if (!event.poses || event.poses.length === 0) {
        setError(msg);
      } else {
        setRegenError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Generate reference image for a single pose (via OpenAI GPT Image 2)
  const handleGeneratePoseReference = async (pose: Pose) => {
    if (generatingPoseIds[pose.id]) return;

    setGeneratingPoseIds((prev) => ({ ...prev, [pose.id]: true }));
    setPoseErrors((prev) => {
      const next = { ...prev };
      delete next[pose.id];
      return next;
    });

    try {
      const matchedEnv = event.environments?.find((e) => e.id === pose.environmentId);
      const result = await generateOpenAIPoseReference(event, pose, currentConcept, undefined, matchedEnv);
      if (result.success && result.referenceImage) {
        // Save to IndexedDB
        await saveImageToDB(`${event.id}_${pose.id}_ai`, result.referenceImage.url);
        await saveImageToDB(`${event.id}_${pose.id}_active`, result.referenceImage.url);

        // Update pose in event
        if (event.poses) {
          const newPoses = event.poses.map((p) => {
            if (p.id === pose.id) {
              return {
                ...p,
                aiReference: result.referenceImage,
                referenceImage: result.referenceImage.url,
                activeReferenceType: 'ai' as const,
                instructionsChanged: false,
              };
            }
            return p;
          });
          onUpdate({ poses: newPoses });
        }
      }
    } catch (err: any) {
      console.error(`Error generating reference for pose ${pose.title}:`, err);
      setPoseErrors((prev) => ({
        ...prev,
        [pose.id]: err?.message || 'Failed to generate reference image.',
      }));
    } finally {
      setGeneratingPoseIds((prev) => {
        const next = { ...prev };
        delete next[pose.id];
        return next;
      });
    }
  };

  // Upload custom reference image for a pose via Reference Engine
  const handleSelectUpload = async (targetPose: Pose, file: File) => {
    setPoseErrors((prev) => {
      const next = { ...prev };
      delete next[targetPose.id];
      return next;
    });

    try {
      const uploadedRef = await ReferenceEngine.createReference('upload', { file });

      await saveImageToDB(`${event.id}_${targetPose.id}_upload`, uploadedRef.url);
      await saveImageToDB(`${event.id}_${targetPose.id}_active`, uploadedRef.url);

      if (event.poses) {
        const newPoses = event.poses.map((p) => {
          if (p.id === targetPose.id) {
            return {
              ...p,
              uploadedReference: uploadedRef,
              referenceImage: uploadedRef.url,
              activeReferenceType: 'upload' as const,
              instructionsChanged: false,
            };
          }
          return p;
        });
        onUpdate({ poses: newPoses });
      }
    } catch (err: any) {
      console.error('Error uploading pose reference:', err);
      setPoseErrors((prev) => ({
        ...prev,
        [targetPose.id]: err?.message || 'Unable to load this image. Please try another JPG, PNG or WEBP.',
      }));
    }
  };

  // Attach generated AI reference to pose and save to IndexedDB
  const handleSelectAIReference = async (targetPose: Pose, refData: ReferenceImageData) => {
    setPoseErrors((prev) => {
      const next = { ...prev };
      delete next[targetPose.id];
      return next;
    });

    try {
      await saveImageToDB(`${event.id}_${targetPose.id}_ai`, refData.url);
      await saveImageToDB(`${event.id}_${targetPose.id}_active`, refData.url);

      if (event.poses) {
        const newPoses = event.poses.map((p) => {
          if (p.id === targetPose.id) {
            return {
              ...p,
              aiReference: refData,
              referenceImage: refData.url,
              activeReferenceType: 'ai' as const,
              instructionsChanged: false,
            };
          }
          return p;
        });
        onUpdate({ poses: newPoses });
      }
    } catch (err: any) {
      console.error('Error attaching AI pose reference:', err);
    }
  };

  // Toggle approval on a pose reference
  const handleToggleReferenceApproved = (pose: Pose) => {
    if (!event.poses) return;
    const newPoses = event.poses.map((p) => {
      if (p.id === pose.id) {
        return {
          ...p,
          referenceApproved: !p.referenceApproved,
        };
      }
      return p;
    });
    onUpdate({ poses: newPoses });
  };

  // Switch between AI reference and Uploaded reference
  const handleSwitchReferenceType = (pose: Pose, type: 'ai' | 'upload') => {
    if (!event.poses) return;
    const targetUrl = type === 'ai' ? pose.aiReference?.url : pose.uploadedReference?.url;
    if (!targetUrl) return;

    const newPoses = event.poses.map((p) => {
      if (p.id === pose.id) {
        return {
          ...p,
          activeReferenceType: type,
          referenceImage: targetUrl,
        };
      }
      return p;
    });
    onUpdate({ poses: newPoses });
  };

  // Batch generation handler (checks provider availability)
  const handleGenerateAllReferences = async () => {
    if (!event.poses || event.poses.length === 0 || isBatchGenerating) return;

    const posesToGenerate = event.poses.filter((p) => !p.referenceImage);
    const targetList = posesToGenerate.length > 0 ? posesToGenerate : event.poses;

    setIsBatchGenerating(true);
    cancelBatchRef.current = false;

    let updatedPoses = [...event.poses];

    for (let i = 0; i < targetList.length; i++) {
      if (cancelBatchRef.current) break;

      const targetPose = targetList[i];
      setBatchProgress({
        current: i + 1,
        total: targetList.length,
        poseTitle: targetPose.title,
      });
      setGeneratingPoseIds((prev) => ({ ...prev, [targetPose.id]: true }));

      try {
        const matchedEnv = event.environments?.find((e) => e.id === targetPose.environmentId);
        const result = await generateOpenAIPoseReference(event, targetPose, currentConcept, undefined, matchedEnv);
        if (result.success && result.referenceImage) {
          await saveImageToDB(`${event.id}_${targetPose.id}_ai`, result.referenceImage.url);
          await saveImageToDB(`${event.id}_${targetPose.id}_active`, result.referenceImage.url);

          updatedPoses = updatedPoses.map((p) => {
            if (p.id === targetPose.id) {
              return {
                ...p,
                aiReference: result.referenceImage,
                referenceImage: result.referenceImage.url,
                activeReferenceType: 'ai' as const,
                instructionsChanged: false,
              };
            }
            return p;
          });
          onUpdate({ poses: updatedPoses });
        }
      } catch (err: any) {
        console.error(`Batch generation error on pose "${targetPose.title}":`, err);
        setPoseErrors((prev) => ({ ...prev, [targetPose.id]: err?.message || 'Failed to generate reference image.' }));
      } finally {
        setGeneratingPoseIds((prev) => {
          const next = { ...prev };
          delete next[targetPose.id];
          return next;
        });
      }
    }

    setIsBatchGenerating(false);
    setBatchProgress(null);
  };

  const totalVersions = (event.guideHistory?.length || 0) + 1;

  // Determine which poses and concept to display (active vs archived version)
  const isViewingArchived = viewingVersion !== null;
  const archivedData = isViewingArchived && event.guideHistory
    ? event.guideHistory.find((v) => v.version === viewingVersion)
    : null;

  const currentPoses = isViewingArchived && archivedData
    ? archivedData.poses
    : event.poses || [];

  const currentConcept = isViewingArchived && archivedData
    ? archivedData.overallConcept
    : event.overallConcept;

  const handleRestoreVersion = (versionNum: number) => {
    if (!event.guideHistory) return;
    const target = event.guideHistory.find((v) => v.version === versionNum);
    if (!target) return;

    // Archive current active guide before restoring
    const history = [...event.guideHistory.filter((v) => v.version !== versionNum)];
    if (event.poses && event.poses.length > 0) {
      history.push({
        version: history.length + 1,
        createdAt: Date.now(),
        overallConcept: event.overallConcept,
        poses: event.poses,
        colorStyle: event.colorStyle,
      });
    }

    onUpdate({
      overallConcept: target.overallConcept,
      poses: target.poses,
      colorStyle: target.colorStyle,
      guideHistory: history,
    });
    setViewingVersion(null);
    setShowVersionModal(false);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    if (isViewingArchived || !event.poses) return;
    const newPoses = [...event.poses];
    if (direction === 'up' && index > 0) {
      [newPoses[index], newPoses[index - 1]] = [newPoses[index - 1], newPoses[index]];
    } else if (direction === 'down' && index < newPoses.length - 1) {
      [newPoses[index], newPoses[index + 1]] = [newPoses[index + 1], newPoses[index]];
    }
    newPoses.forEach((p, idx) => {
      p.order = idx + 1;
    });
    onUpdate({ poses: newPoses });
  };

  const handleEdit = (index: number) => {
    if (isViewingArchived || !event.poses) return;
    setEditingPoseIndex(index);
  };

  // Count poses with reference images
  const totalPosesCount = currentPoses.length;
  const posesWithImagesCount = currentPoses.filter((p) => !!p.referenceImage).length;
  const posesApprovedCount = currentPoses.filter((p) => !!p.referenceApproved).length;

  return (
    <div className="w-full flex-1 flex flex-col h-full relative">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 p-2 -ml-2 text-[#A1A1AA] hover:text-white transition-colors border border-[#222] rounded-full hover:bg-[#1A1A1A] self-start"
          >
            <ArrowLeft size={16} />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] pr-2">Back</span>
          </button>
          <div>
            <span className="text-[#D4AF37] text-[10px] uppercase tracking-[0.3em] mb-1.5 block">Active Event</span>
            <h1 className="text-3xl font-light tracking-tight">Posing Guide</h1>
          </div>
        </div>
        {currentPoses && currentPoses.length > 0 && !loading && (
          <button
            onClick={() => onStartShoot(0)}
            className="px-6 py-2.5 bg-[#D4AF37] hover:bg-white text-[#111] rounded text-[10px] uppercase tracking-[0.2em] font-bold transition-colors flex items-center gap-2 shadow-lg"
          >
            <Camera size={14} /> Start Shoot
          </button>
        )}
      </header>

      {/* Confirmation Dialog Modal for Guide Regeneration */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-[#333] rounded-2xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] flex items-center justify-center mx-auto mb-4 border border-[#D4AF37]/20">
              <RefreshCw size={22} />
            </div>
            <h3 className="text-lg sm:text-xl font-light uppercase tracking-wider text-white mb-3">
              REGENERATE SHOOT GUIDE?
            </h3>
            <p className="text-sm text-[#A1A1AA] leading-relaxed mb-6 font-light">
              This will create a new version of the posing guide and matching color style. Your current guide will be kept as the previous version.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-5 py-2.5 rounded-lg border border-[#333] text-[#A1A1AA] hover:text-white hover:bg-white/5 text-[11px] uppercase tracking-widest font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  executeRegenerate();
                }}
                className="px-6 py-2.5 rounded-lg bg-[#D4AF37] text-black hover:bg-white text-[11px] uppercase tracking-widest font-bold transition-colors flex items-center gap-2"
              >
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Single Pose Reference Regeneration */}
      {poseRegenConfirmId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-[#333] rounded-2xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] flex items-center justify-center mx-auto mb-4 border border-[#D4AF37]/20">
              <Sparkles size={22} />
            </div>
            <h3 className="text-lg sm:text-xl font-light uppercase tracking-wider text-white mb-3">
              REGENERATE REFERENCE?
            </h3>
            <p className="text-sm text-[#A1A1AA] leading-relaxed mb-6 font-light">
              This will generate a new visual reference for this pose using OpenAI GPT Image 2.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPoseRegenConfirmId(null)}
                className="px-5 py-2.5 rounded-lg border border-[#333] text-[#A1A1AA] hover:text-white hover:bg-white/5 text-[11px] uppercase tracking-widest font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const targetPose = event.poses?.find((p) => p.id === poseRegenConfirmId);
                  setPoseRegenConfirmId(null);
                  if (targetPose) {
                    handleGeneratePoseReference(targetPose);
                  }
                }}
                className="px-6 py-2.5 rounded-lg bg-[#D4AF37] text-black hover:bg-white text-[11px] uppercase tracking-widest font-bold transition-colors flex items-center gap-2"
              >
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Generation Progress Modal */}
      {isBatchGenerating && batchProgress && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-[#D4AF37]/40 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-[#D4AF37]/15 text-[#D4AF37] flex items-center justify-center mx-auto mb-4 border border-[#D4AF37]/30">
              <Sparkles size={22} className="animate-spin" />
            </div>
            <span className="text-[10px] uppercase tracking-widest text-[#D4AF37] font-bold block mb-1">
              BATCH REFERENCE GENERATION
            </span>
            <h3 className="text-xl font-light text-white mb-2">
              Pose {batchProgress.current} of {batchProgress.total}
            </h3>
            <p className="text-xs text-white/80 font-mono line-clamp-1 mb-6">
              "{batchProgress.poseTitle}"
            </p>

            {/* Progress bar */}
            <div className="w-full bg-[#111] h-2 rounded-full overflow-hidden border border-[#333] mb-6">
              <div
                className="h-full bg-[#D4AF37] transition-all duration-300 rounded-full"
                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
              />
            </div>

            <button
              onClick={() => {
                cancelBatchRef.current = true;
                setIsBatchGenerating(false);
                setBatchProgress(null);
              }}
              className="px-6 py-2.5 bg-[#252525] hover:bg-[#333] text-white text-[10px] uppercase tracking-widest font-bold rounded-lg border border-[#444] transition-colors"
            >
              Stop Batch
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-2xl w-full max-h-[90vh] flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="Close Lightbox"
            >
              <X size={20} />
            </button>
            <div className="w-full bg-[#141414] border border-[#333] rounded-2xl overflow-hidden shadow-2xl flex flex-col">
              <div className="relative w-full aspect-[3/4] max-h-[60vh] bg-black flex items-center justify-center overflow-hidden">
                <img
                  src={lightboxImage.url}
                  alt={lightboxImage.title}
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="p-5 bg-[#141414] border-t border-[#262626]">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 bg-[#D4AF37]/20 text-[#D4AF37] rounded">
                    POSE {String(lightboxImage.poseOrder).padStart(2, '0')}
                  </span>
                  <h4 className="text-lg font-light text-white">{lightboxImage.title}</h4>
                </div>
                <p className="text-xs sm:text-sm text-white/80 font-light italic leading-relaxed">
                  "{lightboxImage.clientDirection}"
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {showVersionModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-[#333] rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-[#D4AF37] font-bold block mb-1">
                  Guide Version History
                </span>
                <h3 className="text-xl font-light text-white">All Generated Guides</h3>
              </div>
              <button
                onClick={() => setShowVersionModal(false)}
                className="text-[#A1A1AA] hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {/* Active Version */}
              <div
                className={`p-4 rounded-xl border transition-all ${
                  viewingVersion === null
                    ? 'bg-[#D4AF37]/10 border-[#D4AF37]/40'
                    : 'bg-[#111] border-[#262626] hover:border-[#444]'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-white">
                      Guide Version {totalVersions}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 bg-[#D4AF37] text-black rounded">
                      Active
                    </span>
                  </div>
                  <span className="text-[10px] text-[#A1A1AA]">
                    {event.poses?.length || 0} Poses
                  </span>
                </div>
                <p className="text-xs text-white/70 italic line-clamp-1 mb-3">
                  "{event.overallConcept || 'Current active shoot guide'}"
                </p>
                {viewingVersion !== null && (
                  <button
                    onClick={() => {
                      setViewingVersion(null);
                      setShowVersionModal(false);
                    }}
                    className="text-[10px] uppercase tracking-widest font-bold text-[#D4AF37] hover:underline"
                  >
                    Switch to Active Guide →
                  </button>
                )}
              </div>

              {/* Archived History Versions */}
              {event.guideHistory &&
                [...event.guideHistory].reverse().map((v) => (
                  <div
                    key={v.version}
                    className={`p-4 rounded-xl border transition-all ${
                      viewingVersion === v.version
                        ? 'bg-white/10 border-white/40'
                        : 'bg-[#111] border-[#262626] hover:border-[#444]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-white">
                          Guide Version {v.version}
                        </span>
                        <span className="text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 bg-white/10 text-white/70 rounded">
                          Archived
                        </span>
                      </div>
                      <span className="text-[10px] text-[#A1A1AA]">
                        {v.poses.length} Poses
                      </span>
                    </div>
                    <p className="text-xs text-white/70 italic line-clamp-1 mb-3">
                      "{v.overallConcept || 'Archived shoot guide version'}"
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setViewingVersion(v.version);
                          setShowVersionModal(false);
                        }}
                        className="text-[10px] uppercase tracking-widest font-bold text-white/90 hover:text-white underline"
                      >
                        {viewingVersion === v.version ? 'Currently Viewing' : 'View Version'}
                      </button>
                      <button
                        onClick={() => handleRestoreVersion(v.version)}
                        className="text-[10px] uppercase tracking-widest font-bold text-[#D4AF37] hover:text-white"
                      >
                        Restore As Active
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            <div className="mt-6 pt-4 border-t border-[#262626] text-center">
              <button
                onClick={() => setShowVersionModal(false)}
                className="px-6 py-2 bg-[#222] hover:bg-[#333] text-white text-[11px] uppercase tracking-widest font-bold rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border border-[#333] rounded-2xl bg-[#1A1A1A]">
          <RefreshCw className="w-8 h-8 text-[#D4AF37] mb-6 animate-spin" />
          <h2 className="text-xl font-light mb-2 text-white">{loadingMessages[loadingStep]}</h2>
          <p className="text-[#A1A1AA] text-sm">
            Synthesizing {event.location} elements with {event.style} mood.
          </p>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-10 text-center border border-red-900/40 rounded-2xl bg-[#1A1A1A]">
          <p className="text-red-400 font-medium text-lg mb-2">Generation failed.</p>
          <p className="text-[#A1A1AA] text-xs font-mono bg-black/60 px-4 py-3 rounded border border-red-900/30 max-w-lg mb-6 break-words">
            Error: {error}
          </p>
          <button
            onClick={executeRegenerate}
            className="px-8 py-3 bg-[#D4AF37] hover:bg-white text-[#111] rounded text-[11px] uppercase tracking-[0.2em] font-bold transition-colors"
          >
            RETRY
          </button>
        </div>
      ) : !event.poses || event.poses.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border border-dashed border-[#333] rounded-2xl bg-[#1A1A1A]">
          <ImageIcon className="w-12 h-12 text-[#D4AF37]/40 mb-6" strokeWidth={1} />
          <h2 className="text-2xl font-light mb-4">This event does not have a posing guide yet.</h2>
          <p className="text-[#A1A1AA] text-sm mb-8 max-w-md">
            Generate a bespoke visual posing guide based on {event.location}, {event.style}, and {event.timeOfDay}.
          </p>
          <button
            onClick={executeRegenerate}
            disabled={loading}
            className="px-8 py-3 bg-[#D4AF37] hover:bg-white text-[#111] rounded text-[11px] uppercase tracking-[0.2em] font-bold transition-colors"
          >
            {loading ? 'GENERATING GUIDE...' : 'GENERATE SHOOT GUIDE'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Regeneration Error Banner if a background regeneration failed without losing existing guide */}
          {regenError && (
            <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-red-400 font-bold block mb-1">
                  REGENERATION FAILED
                </span>
                <p className="text-xs text-white/80">{regenError}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={executeRegenerate}
                  disabled={loading}
                  className="px-4 py-2 bg-[#D4AF37] text-black hover:bg-white text-[10px] uppercase tracking-widest font-bold rounded transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={() => setRegenError('')}
                  className="px-3 py-2 text-[#A1A1AA] hover:text-white text-[10px] uppercase tracking-widest rounded border border-[#333] transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Archived Version Notice Banner */}
          {isViewingArchived && (
            <div className="bg-[#1C180E] border border-[#D4AF37]/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-[#D4AF37] font-bold block mb-0.5">
                  Viewing Guide Version {viewingVersion} (Archived)
                </span>
                <p className="text-xs text-white/70">
                  Showing {currentPoses.length} poses from this archived version.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleRestoreVersion(viewingVersion!)}
                  className="px-4 py-2 bg-[#D4AF37] text-black hover:bg-white text-[10px] uppercase tracking-widest font-bold rounded transition-colors"
                >
                  Restore As Active
                </button>
                <button
                  onClick={() => setViewingVersion(null)}
                  className="px-3 py-2 text-white bg-[#111] hover:bg-white/10 text-[10px] uppercase tracking-widest rounded border border-[#333] transition-colors"
                >
                  Back to Active (V{totalVersions})
                </button>
              </div>
            </div>
          )}

          {/* Creative Concept Card */}
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                  <span className="text-[#D4AF37] text-[10px] uppercase tracking-[0.3em] font-bold block">
                    Creative Direction
                  </span>
                  <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 bg-white/5 text-white/70 rounded border border-white/10">
                    {isViewingArchived ? `Version ${viewingVersion} (Archived)` : `Version ${totalVersions} (Active)`}
                  </span>
                </div>
                <h2 className="text-2xl font-light tracking-tight text-white">{event.name} — Shoot Guide</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {event.guideHistory && event.guideHistory.length > 0 && (
                  <button
                    onClick={() => setShowVersionModal(true)}
                    className="text-white/80 hover:text-white text-[10px] uppercase tracking-widest flex items-center gap-1.5 transition-colors bg-[#111] px-3.5 py-2 rounded border border-[#333]"
                  >
                    View Previous Version
                  </button>
                )}
                <button
                  onClick={handleRegenerateClick}
                  disabled={loading}
                  className={`text-[#D4AF37] hover:text-white text-[10px] uppercase tracking-widest flex items-center gap-1.5 transition-colors bg-[#111] px-3.5 py-2 rounded border border-[#333] ${
                    loading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                  {loading ? 'GENERATING NEW GUIDE...' : 'Regenerate Guide'}
                </button>
              </div>
            </div>
            {currentConcept && (
              <div className="mt-4 pt-4 border-t border-[#262626]">
                <span className="text-[9px] uppercase tracking-widest text-[#A1A1AA] block mb-2 font-semibold">
                  Overall Concept
                </span>
                <p className="text-white/90 text-sm sm:text-base font-serif italic leading-relaxed">
                  "{currentConcept}"
                </p>
              </div>
            )}
          </div>

          {/* Sequence Action Bar with Reference Image Stats & Batch Generator */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-1 py-1">
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-[11px] uppercase tracking-widest text-[#A1A1AA] font-medium">
                {currentPoses.length} Poses in Sequence
              </p>
              <div className="h-3.5 w-[1px] bg-[#333]" />
              <span className="text-[10px] text-[#D4AF37] uppercase tracking-wider font-semibold">
                {posesWithImagesCount}/{totalPosesCount} References Ready
              </span>
              {posesApprovedCount > 0 && (
                <span className="text-[9px] px-2 py-0.5 bg-emerald-950/80 text-emerald-400 border border-emerald-800/40 rounded-full font-bold uppercase tracking-wider">
                  {posesApprovedCount} Approved
                </span>
              )}
            </div>

            {!isViewingArchived && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateAllReferences}
                  disabled={isBatchGenerating}
                  className="px-3.5 py-1.5 bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#D4AF37] border border-[#D4AF37]/40 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  title="Sequentially generate AI reference images for poses"
                >
                  <Sparkles size={13} />
                  <span>{posesWithImagesCount === totalPosesCount ? 'Regenerate All' : 'Generate All References'}</span>
                </button>
              </div>
            )}
          </div>

          {currentPoses.map((pose, index) => {
            const isPoseGenerating = !!generatingPoseIds[pose.id];
            const poseError = poseErrors[pose.id];
            
            // Resolve active reference image URL
            const activeImage = pose.activeReferenceType === 'upload'
              ? pose.uploadedReference?.url
              : (pose.aiReference?.url || (typeof pose.referenceImage === 'string' ? pose.referenceImage : pose.referenceImage?.url));

            const hasAiRef = !!pose.aiReference?.url;
            const hasUploadRef = !!pose.uploadedReference?.url;

            return (
              <div
                key={pose.id || index}
                className="bg-[#1A1A1A] border border-[#222] rounded-xl p-5 sm:p-6 flex flex-col md:flex-row gap-6 shadow-md"
              >
                {/* Left Column: Reference Image Container */}
                <div className="w-full md:w-5/12 lg:w-4/12 shrink-0 flex flex-col gap-3">
                  <div className="relative w-full aspect-[3/4] bg-[#111] border border-[#2A2A2A] rounded-xl overflow-hidden flex flex-col items-center justify-center group shadow-inner">
                    {activeImage && activeImage !== 'indexeddb' ? (
                      <>
                        <img
                          src={activeImage}
                          alt={pose.title}
                          className="w-full h-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-[1.02]"
                          onClick={() =>
                            !isPoseGenerating &&
                            setLightboxImage({
                              url: activeImage,
                              title: pose.title,
                              poseOrder: pose.order || index + 1,
                              clientDirection: pose.clientDirection,
                            })
                          }
                          referrerPolicy="no-referrer"
                        />

                        {/* If generating a new reference, show translucent progress veil over existing image */}
                        {isPoseGenerating && (
                          <div className="absolute inset-0 bg-black/75 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center z-10">
                            <Sparkles size={28} className="text-[#D4AF37] mb-2.5 animate-spin" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white mb-1">
                              GENERATING NEW REFERENCE...
                            </span>
                            <p className="text-[9px] text-[#A1A1AA] font-light max-w-[170px] leading-snug">
                              GPT Image 2 is updating this visual reference
                            </p>
                          </div>
                        )}
                        
                        {/* Top Badges Overlay */}
                        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none z-20">
                          <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 bg-black/75 backdrop-blur-sm text-white/90 rounded border border-white/10">
                            {pose.activeReferenceType === 'upload' ? 'MY UPLOAD' : 'AI REFERENCE'}
                          </span>
                          {pose.referenceApproved && (
                            <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 bg-[#D4AF37] text-black rounded shadow-md flex items-center gap-0.5">
                              <Check size={10} strokeWidth={3} /> APPROVED
                            </span>
                          )}
                        </div>

                        {/* Lightbox Trigger on Hover */}
                        {!isPoseGenerating && (
                          <button
                            onClick={() =>
                              setLightboxImage({
                                url: activeImage,
                                title: pose.title,
                                poseOrder: pose.order || index + 1,
                                clientDirection: pose.clientDirection,
                              })
                            }
                            className="absolute bottom-2.5 right-2.5 p-1.5 rounded-lg bg-black/70 hover:bg-black text-white/80 hover:text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity border border-white/20 z-20"
                            aria-label="Expand Reference Image"
                          >
                            <ZoomIn size={14} />
                          </button>
                        )}
                      </>
                    ) : isPoseGenerating ? (
                      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-[#111]">
                        <Sparkles size={32} className="text-[#D4AF37] mb-3 animate-spin" />
                        <span className="text-[11px] font-bold uppercase tracking-widest text-white mb-1">
                          CREATING VISUAL REFERENCE...
                        </span>
                        <p className="text-[10px] text-[#A1A1AA] font-light max-w-[180px]">
                          GPT Image 2 is visualizing the pose & environment
                        </p>
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-5 text-center bg-gradient-to-b from-[#141414] to-[#0d0d0d]">
                        <div className="w-12 h-12 rounded-full bg-[#1E1E1E] border border-[#333] flex items-center justify-center text-[#D4AF37]/60 mb-3 shadow-inner">
                          <ImageIcon size={22} strokeWidth={1.5} />
                        </div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-white/90 mb-1">
                          No Reference Image
                        </h4>
                        <p className="text-[10px] text-[#888] font-light max-w-[190px] leading-snug mb-4">
                          Generate an AI photography reference or upload your own visual sample.
                        </p>

                        {!isViewingArchived && (
                          <div className="flex flex-col gap-2 w-full max-w-[190px]">
                            <button
                              onClick={() => handleGeneratePoseReference(pose)}
                              className="w-full py-2 px-3 bg-[#D4AF37] hover:bg-white text-black text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-1.5 shadow-md transition-colors"
                            >
                              <Sparkles size={13} />
                              <span>Generate Reference</span>
                            </button>

                            <button
                              onClick={() => setEngineModalPose(pose)}
                              className="w-full py-1.5 px-3 bg-[#1A1A1A] hover:bg-[#252525] text-[#A1A1AA] hover:text-white border border-[#333] text-[9px] font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <Upload size={12} />
                              <span>Upload Reference</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Pose Error Banner if generation failed for this pose */}
                  {poseError && (
                    <div className="bg-red-950/40 border border-red-900/50 rounded-lg p-2.5 text-center">
                      <span className="text-[9px] uppercase tracking-widest text-red-400 font-bold block mb-0.5">
                        REFERENCE STATUS
                      </span>
                      <p className="text-[10px] text-white/70 mb-2 leading-relaxed">{poseError}</p>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleGeneratePoseReference(pose)}
                          className="px-3 py-1 bg-[#D4AF37] hover:bg-white text-black text-[9px] uppercase tracking-widest font-bold rounded transition-colors"
                        >
                          Retry
                        </button>
                        <button
                          onClick={() => setEngineModalPose(pose)}
                          className="px-3 py-1 bg-[#222] hover:bg-[#333] text-[#A1A1AA] hover:text-white text-[9px] uppercase tracking-widest font-bold rounded border border-[#333] transition-colors"
                        >
                          Options
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Reference Image Controls (when an image is already present) */}
                  {activeImage && activeImage !== 'indexeddb' && !isViewingArchived && (
                    <div className="flex flex-col gap-2">
                      {/* Dual Tab if both AI and Upload exist */}
                      {hasAiRef && hasUploadRef && (
                        <div className="flex items-center bg-[#111] p-0.5 rounded-lg border border-[#222]">
                          <button
                            onClick={() => handleSwitchReferenceType(pose, 'ai')}
                            className={`flex-1 py-1 text-[9px] uppercase tracking-wider font-bold rounded transition-colors ${
                              pose.activeReferenceType === 'ai' ? 'bg-[#282828] text-[#D4AF37]' : 'text-[#888]'
                            }`}
                          >
                            AI Reference
                          </button>
                          <button
                            onClick={() => handleSwitchReferenceType(pose, 'upload')}
                            className={`flex-1 py-1 text-[9px] uppercase tracking-wider font-bold rounded transition-colors ${
                              pose.activeReferenceType === 'upload' ? 'bg-[#282828] text-[#D4AF37]' : 'text-[#888]'
                            }`}
                          >
                            My Upload
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleToggleReferenceApproved(pose)}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-colors border ${
                            pose.referenceApproved
                              ? 'bg-[#D4AF37]/20 border-[#D4AF37]/50 text-[#D4AF37]'
                              : 'bg-[#181818] border-[#333] text-[#A1A1AA] hover:text-white'
                          }`}
                          title="Mark reference as approved"
                        >
                          <CheckCircle2 size={12} className={pose.referenceApproved ? 'text-[#D4AF37]' : 'text-[#666]'} />
                          <span>{pose.referenceApproved ? 'Approved' : 'Keep / Approve'}</span>
                        </button>

                        <button
                          onClick={() => setEngineModalPose(pose)}
                          className="py-1.5 px-2.5 rounded-lg bg-[#181818] hover:bg-[#222] border border-[#333] text-[#A1A1AA] hover:text-[#D4AF37] text-[9px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1"
                          title="Open Reference Engine to change or upload reference"
                        >
                          <RefreshCw size={11} />
                          <span>Change Ref</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Status Badges */}
                  <div className="flex items-center justify-between gap-2 mt-auto">
                    <span
                      className={`text-[9px] uppercase tracking-widest font-bold px-2.5 py-1 rounded ${
                        pose.completed ? 'bg-green-900/30 text-green-400' : 'bg-[#222] text-[#A1A1AA]'
                      }`}
                    >
                      {pose.completed ? 'Completed' : 'Pending'}
                    </span>
                    <span className="text-[9px] uppercase tracking-widest text-[#D4AF37] bg-[#111] px-2 py-1 rounded border border-[#222]">
                      {pose.mood}
                    </span>
                  </div>
                </div>

                {/* Right Column: Pose Information & Direction */}
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 bg-[#D4AF37]/10 text-[#D4AF37] rounded border border-[#D4AF37]/20">
                          POSE {String(pose.order || index + 1).padStart(2, '0')}
                        </span>
                        {pose.category && (
                          <span className="text-[9px] font-semibold uppercase tracking-widest px-2.5 py-1 bg-white/5 text-white/80 rounded border border-white/10">
                            {pose.category}
                          </span>
                        )}
                        <h3 className="text-xl font-light text-white">{pose.title}</h3>
                      </div>
                      {!isViewingArchived && (
                        <div className="flex items-center gap-1 text-[#666]">
                          <button
                            onClick={() => handleEdit(index)}
                            className="p-1 hover:text-white mr-1"
                            aria-label="Edit Pose"
                            title="Edit Pose"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleMove(index, 'up')}
                            disabled={index === 0}
                            className="p-1 hover:text-white disabled:opacity-30"
                            aria-label="Move Up"
                          >
                            <MoveUp size={14} />
                          </button>
                          <button
                            onClick={() => handleMove(index, 'down')}
                            disabled={index === event.poses!.length - 1}
                            className="p-1 hover:text-white disabled:opacity-30"
                            aria-label="Move Down"
                          >
                            <MoveDown size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {pose.shootingIntent && (
                      <div className="mb-3">
                        <span className="text-[9px] uppercase tracking-widest text-[#D4AF37]/80 font-medium mr-2">Intent:</span>
                        <span className="text-xs text-white/80 italic font-serif">{pose.shootingIntent}</span>
                      </div>
                    )}

                    <div className="space-y-3 mt-3">
                      <div className="bg-[#141414] p-4 rounded-lg border border-[#222]">
                        <span className="text-[9px] uppercase tracking-widest text-[#D4AF37] font-bold block mb-1">
                          Say to Client
                        </span>
                        <p className="text-white text-sm sm:text-base leading-relaxed font-light">
                          "{pose.clientDirection}"
                        </p>
                      </div>
                      <div className="px-1">
                        <span className="text-[9px] uppercase tracking-widest text-[#A1A1AA] font-bold block mb-1">
                          Photographer Concept
                        </span>
                        <p className="text-[#A1A1AA] text-xs sm:text-sm leading-relaxed">
                          {pose.photographerConcept}
                        </p>
                      </div>

                      {/* Notice if instructions changed after reference generation */}
                      {pose.instructionsChanged && (pose.referenceImage || pose.aiReference) && (
                        <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-300">
                          <div className="flex items-center gap-2">
                            <AlertCircle size={15} className="text-amber-400 shrink-0" />
                            <span>Pose instructions changed. The current reference may no longer exactly match.</span>
                          </div>
                          {!isViewingArchived && (
                            <button
                              type="button"
                              onClick={() => setEngineModalPose(pose)}
                              className="px-3 py-1 bg-amber-900/40 hover:bg-amber-800/60 border border-amber-700/50 rounded-lg text-[10px] uppercase tracking-wider font-bold text-amber-200 transition-colors self-start sm:self-auto shrink-0"
                            >
                              Regenerate Reference
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reference Engine Provider Selector Modal */}
      <ReferenceEngineModal
        isOpen={!!engineModalPose}
        onClose={() => setEngineModalPose(null)}
        pose={engineModalPose}
        event={event}
        onSelectUpload={handleSelectUpload}
        onSelectAI={handleSelectAIReference}
      />

      {/* Pose Edit Modal */}
      <PoseEditModal
        isOpen={editingPoseIndex !== null}
        onClose={() => setEditingPoseIndex(null)}
        pose={editingPoseIndex !== null && event.poses ? event.poses[editingPoseIndex] : null}
        onSave={(updatedPose) => {
          if (editingPoseIndex === null || !event.poses) return;
          const newPoses = [...event.poses];
          newPoses[editingPoseIndex] = updatedPose;
          onUpdate({ poses: newPoses });
        }}
      />
    </div>
  );
}

function ShootModeView({
  event,
  initialPoseIndex,
  onExit,
  onUpdate,
}: {
  event: ShootEvent;
  initialPoseIndex: number;
  onExit: () => void;
  onUpdate: (updates: Partial<ShootEvent>) => void;
}) {
  const poses = event.poses || [];
  const safeInitialIndex = Math.max(0, Math.min(initialPoseIndex, Math.max(0, poses.length - 1)));
  const [currentIndex, setCurrentIndex] = useState(safeInitialIndex);
  const [showText, setShowText] = useState(true);
  const [direction, setDirection] = useState<number>(0);

  // Gesture tracking refs
  const dragStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isDraggingRef = useRef(false);

  const pose = poses[currentIndex];

  const handlePrev = () => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex((prev) => Math.max(0, prev - 1));
    }
  };

  const handleNext = () => {
    if (currentIndex < poses.length - 1) {
      setDirection(1);
      setCurrentIndex((prev) => Math.min(poses.length - 1, prev + 1));
    }
  };

  const handleToggleDone = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!pose) return;
    const newPoses = poses.map((p, idx) => {
      if (idx === currentIndex) {
        return {
          ...p,
          completed: !p.completed,
        };
      }
      return p;
    });
    onUpdate({ poses: newPoses });
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'Escape') {
        onExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, poses.length]);

  // Pointer / Touch gesture handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only capture primary button
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
    };
    isDraggingRef.current = true;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !dragStartRef.current) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    const elapsed = Date.now() - dragStartRef.current.time;

    isDraggingRef.current = false;
    dragStartRef.current = null;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Horizontal swipe detection with threshold 50px
    if (absX > 50 && absX > absY * 1.2) {
      if (deltaX < 0) {
        // Swiped / dragged left -> Next
        handleNext();
      } else {
        // Swiped / dragged right -> Previous
        handlePrev();
      }
    } else if (absX < 8 && absY < 8 && elapsed < 350) {
      // Tap / click toggle
      setShowText((prev) => !prev);
    }
  };

  const handlePointerCancel = () => {
    isDraggingRef.current = false;
    dragStartRef.current = null;
  };

  if (poses.length === 0 || !pose) return null;

  const currentFormatted = String(currentIndex + 1).padStart(2, '0');
  const totalFormatted = String(poses.length).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-50 bg-[#0A0A0A] w-screen h-screen h-[100dvh] flex flex-col font-sans select-none overflow-hidden touch-pan-y">
      {/* Top Bar */}
      <div className="h-14 sm:h-16 shrink-0 bg-gradient-to-b from-black/95 to-transparent z-20 flex items-center justify-between px-4 sm:px-6 pt-[env(safe-area-inset-top,0px)]">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={onExit}
            className="text-white/80 hover:text-white px-3 py-2 -ml-2 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-1.5"
            aria-label="Exit Shoot Mode"
          >
            <X size={20} />
            <span className="text-[11px] font-bold uppercase tracking-widest">Exit</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm sm:text-base font-mono font-bold tracking-wider text-white">
              {currentFormatted} <span className="text-white/40">/</span> {totalFormatted}
            </span>
            {pose.completed && (
              <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 bg-emerald-950/90 text-emerald-400 border border-emerald-800/50 rounded-full flex items-center gap-1">
                <Check size={11} /> Completed
              </span>
            )}
          </div>
        </div>

        {/* Mini progress tracker */}
        <div className="flex gap-1 max-w-[160px] sm:max-w-[200px] overflow-hidden">
          {poses.map((p, i) => (
            <div
              key={p.id || i}
              onClick={() => setCurrentIndex(i)}
              className={`h-1.5 rounded-full cursor-pointer transition-all ${
                i === currentIndex
                  ? 'bg-[#D4AF37] w-5 sm:w-6'
                  : p.completed
                  ? 'bg-emerald-400/70 w-1.5 sm:w-2'
                  : 'bg-white/20 w-1.5 sm:w-2'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Main Gesture Stage */}
      <div
        className="flex-1 min-h-0 relative flex flex-col items-center justify-between p-3 sm:p-5 w-full max-w-xl mx-auto cursor-grab active:cursor-grabbing overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: direction > 0 ? 40 : direction < 0 ? -40 : 0, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: direction > 0 ? -40 : direction < 0 ? 40 : 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-full flex-1 min-h-0 flex flex-col items-center justify-between p-4 sm:p-6 bg-[#141414] border border-[#262626] rounded-2xl text-center shadow-2xl relative overflow-hidden"
          >
            {/* Top Pose Badges */}
            <div className="flex items-center gap-2 flex-wrap justify-center shrink-0">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest px-2.5 py-0.5 bg-[#D4AF37]/15 text-[#D4AF37] rounded-full border border-[#D4AF37]/30">
                POSE {currentFormatted}
              </span>
              {pose.category && (
                <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-widest px-2.5 py-0.5 bg-white/10 text-white/90 rounded-full border border-white/20">
                  {pose.category}
                </span>
              )}
              {pose.mood && (
                <span className="text-[9px] sm:text-[10px] font-medium uppercase tracking-widest px-2 py-0.5 text-[#A1A1AA]">
                  {pose.mood}
                </span>
              )}
            </div>

            {/* Central Reference Image Area */}
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-2 sm:py-3 w-full overflow-hidden">
              {(() => {
                const activeImg = pose.activeReferenceType === 'upload'
                  ? pose.uploadedReference?.url
                  : (pose.aiReference?.url || (typeof pose.referenceImage === 'string' ? pose.referenceImage : pose.referenceImage?.url));

                if (activeImg && activeImg !== 'indexeddb') {
                  return (
                    <div className="relative w-full h-full max-h-[42vh] rounded-xl overflow-hidden bg-black/50 border border-[#2a2a2a] shadow-inner flex items-center justify-center">
                      <img
                        src={activeImg}
                        alt={pose.title}
                        className="w-full h-full object-contain pointer-events-none"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-2 left-2 pointer-events-none">
                        <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 bg-black/80 backdrop-blur-sm text-white/90 rounded border border-white/10">
                          {pose.activeReferenceType === 'upload' ? 'MY UPLOAD' : 'AI REFERENCE'}
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-[#D4AF37]/60 mb-2 shadow-inner">
                      <Camera size={28} strokeWidth={1.5} />
                    </div>
                    <span className="text-[10px] text-[#A1A1AA] uppercase tracking-widest font-light">
                      No Reference Image Yet
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Pose Title & Intent */}
            <div className="w-full shrink-0">
              <h2 className="text-xl sm:text-2xl font-light text-white mb-1.5 tracking-tight line-clamp-2">
                {pose.title}
              </h2>
              {pose.shootingIntent && (
                <p className="text-xs sm:text-sm text-[#D4AF37]/90 font-serif italic line-clamp-2 max-w-md mx-auto">
                  "{pose.shootingIntent}"
                </p>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Client Direction Text Overlay */}
        <AnimatePresence>
          {showText && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.15 }}
              className="w-full shrink-0 pt-2.5 z-10"
            >
              <div className="bg-black/90 backdrop-blur-md border border-white/15 px-4 py-3 rounded-xl text-center shadow-lg">
                <span className="text-[9px] uppercase tracking-widest text-[#D4AF37] font-bold block mb-0.5">
                  Say to Client
                </span>
                <p className="text-sm sm:text-base text-white font-normal leading-snug">
                  "{pose.clientDirection}"
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Dedicated Fixed Bottom Controls Area */}
      <div className="shrink-0 w-full bg-[#0A0A0A] border-t border-[#222] z-30 px-4 sm:px-8 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom,0px))]">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-2 sm:gap-4 w-full">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="h-12 flex-1 max-w-[130px] rounded-xl bg-[#1A1A1A] hover:bg-[#252525] text-white disabled:opacity-25 disabled:pointer-events-none transition-colors border border-[#333] flex items-center justify-center gap-1.5 font-bold text-[11px] uppercase tracking-wider"
            aria-label="Previous Pose"
          >
            <ChevronLeft size={18} />
            <span>Previous</span>
          </button>

          <button
            onClick={handleToggleDone}
            className={`h-12 flex-1 max-w-[170px] rounded-xl flex items-center justify-center gap-2 font-bold text-[11px] uppercase tracking-[0.15em] transition-all shadow-lg ${
              pose.completed
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                : 'bg-[#D4AF37] text-black hover:bg-white'
            }`}
            aria-label="Mark Pose Done"
          >
            <Check size={16} className={pose.completed ? 'text-emerald-400' : 'text-black'} />
            <span>{pose.completed ? 'COMPLETED' : 'DONE'}</span>
          </button>

          <button
            onClick={handleNext}
            disabled={currentIndex === poses.length - 1}
            className="h-12 flex-1 max-w-[130px] rounded-xl bg-[#1A1A1A] hover:bg-[#252525] text-white disabled:opacity-25 disabled:pointer-events-none transition-colors border border-[#333] flex items-center justify-center gap-1.5 font-bold text-[11px] uppercase tracking-wider"
            aria-label="Next Pose"
          >
            <span>Next</span>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

