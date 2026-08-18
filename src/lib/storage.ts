import { ShootEvent } from "../types";
import { saveImageToDB, getImageFromDB, deleteImageFromDB } from "./imageStorage";

const STORAGE_KEY = "zap_visual_guide_events";
const ACTIVE_EVENT_KEY = "zap_active_event_id";

export const DEFAULT_EVENTS: ShootEvent[] = [
  {
    id: "zanzibar-stone-town",
    name: "Zanzibar Stone Town",
    type: "Couple Shoot",
    location: "Stone Town, Zanzibar",
    style: "Cinematic, Romantic, Editorial",
    timeOfDay: "4 PM / Golden Hour",
    description: "Historic Stone Town streets and architecture.",
    createdAt: 1700000000000,
  }
];

// Helper to strip heavy base64 from event for safe localStorage backup
function sanitizeEventForLocalStorage(event: ShootEvent): ShootEvent {
  const sanitizedPoses = event.poses
    ? event.poses.map((p) => {
        if (p.aiReference?.url && p.aiReference.url.startsWith('data:')) {
          saveImageToDB(`${event.id}_${p.id}_ai`, p.aiReference.url).catch(console.warn);
        }
        if (p.uploadedReference?.url && p.uploadedReference.url.startsWith('data:')) {
          saveImageToDB(`${event.id}_${p.id}_upload`, p.uploadedReference.url).catch(console.warn);
        }
        const activeUrl = typeof p.referenceImage === 'string' ? p.referenceImage : p.referenceImage?.url;
        if (activeUrl && activeUrl.startsWith('data:')) {
          saveImageToDB(`${event.id}_${p.id}_active`, activeUrl).catch(console.warn);
        }
        return p;
      })
    : undefined;

  const sanitizedEnvironments = event.environments
    ? event.environments.map((env) => {
        if (env.imageUrl && env.imageUrl.startsWith('data:')) {
          saveImageToDB(`${event.id}_env_${env.id}`, env.imageUrl).catch(console.warn);
        }
        return env;
      })
    : undefined;

  return {
    ...event,
    poses: sanitizedPoses,
    environments: sanitizedEnvironments,
  };
}

export function getEvents(): ShootEvent[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_EVENTS));
      return [...DEFAULT_EVENTS];
    }
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed) && parsed.length === 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_EVENTS));
      return [...DEFAULT_EVENTS];
    }
    return parsed;
  } catch (error) {
    console.error("Failed to parse events from local storage", error);
    return [...DEFAULT_EVENTS];
  }
}

export async function hydrateEventImages(event: ShootEvent): Promise<ShootEvent> {
  let updatedPoses = event.poses;
  if (event.poses && event.poses.length > 0) {
    updatedPoses = await Promise.all(
      event.poses.map(async (pose) => {
        let aiUrl = pose.aiReference?.url;
        if (!aiUrl || aiUrl === 'indexeddb') {
          const stored = await getImageFromDB(`${event.id}_${pose.id}_ai`);
          if (stored) {
            aiUrl = stored;
          }
        }

        let uploadUrl = pose.uploadedReference?.url;
        if (!uploadUrl || uploadUrl === 'indexeddb') {
          const stored = await getImageFromDB(`${event.id}_${pose.id}_upload`);
          if (stored) {
            uploadUrl = stored;
          }
        }

        let activeUrl = typeof pose.referenceImage === 'string' ? pose.referenceImage : pose.referenceImage?.url;
        if (!activeUrl || activeUrl === 'indexeddb') {
          const stored = await getImageFromDB(`${event.id}_${pose.id}_active`);
          if (stored) {
            activeUrl = stored;
          } else if (pose.activeReferenceType === 'upload' && uploadUrl) {
            activeUrl = uploadUrl;
          } else if (aiUrl) {
            activeUrl = aiUrl;
          }
        }

        const newPose = { ...pose };
        if (aiUrl) {
          if (pose.aiReference) {
            newPose.aiReference = { ...pose.aiReference, url: aiUrl };
          } else {
            newPose.aiReference = { type: 'ai', provider: 'openai', url: aiUrl };
          }
        }
        if (uploadUrl) {
          if (pose.uploadedReference) {
            newPose.uploadedReference = { ...pose.uploadedReference, url: uploadUrl };
          } else {
            newPose.uploadedReference = { type: 'upload', provider: 'upload', url: uploadUrl };
          }
        }
        if (activeUrl) {
          newPose.referenceImage = activeUrl;
        }
        return newPose;
      })
    );
  }

  let updatedEnvironments = event.environments;
  if (event.environments && event.environments.length > 0) {
    updatedEnvironments = await Promise.all(
      event.environments.map(async (env) => {
        let img = env.imageUrl;
        if (!img || img === 'indexeddb') {
          const stored = await getImageFromDB(`${event.id}_env_${env.id}`);
          if (stored) {
            img = stored;
          }
        }
        return { ...env, imageUrl: img };
      })
    );
  }

  return { ...event, poses: updatedPoses, environments: updatedEnvironments };
}

function safeSetLocalStorage(key: string, events: ShootEvent[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(events));
  } catch (err: any) {
    console.warn("LocalStorage full, trimming heavy image URLs to IndexedDB markers", err);
    // Strip raw base64 data to avoid quota errors
    const stripped = events.map((ev) => ({
      ...ev,
      environments: ev.environments?.map((env) => ({
        ...env,
        imageUrl: 'indexeddb',
      })),
      poses: ev.poses?.map((p) => ({
        ...p,
        referenceImage: typeof p.referenceImage === 'string' ? 'indexeddb' : p.referenceImage ? { ...p.referenceImage, url: 'indexeddb' } : undefined,
        aiReference: p.aiReference ? { ...p.aiReference, url: 'indexeddb' } : undefined,
        uploadedReference: p.uploadedReference ? { ...p.uploadedReference, url: 'indexeddb' } : undefined,
      })),
    }));
    try {
      localStorage.setItem(key, JSON.stringify(stripped));
    } catch (finalErr) {
      console.error("Critical localStorage quota exceeded", finalErr);
    }
  }
}

export function saveEvent(event: ShootEvent): void {
  const sanitized = sanitizeEventForLocalStorage(event);
  const events = getEvents();
  events.push(sanitized);
  safeSetLocalStorage(STORAGE_KEY, events);
}

export function getEvent(id: string): ShootEvent | undefined {
  return getEvents().find((e) => e.id === id);
}

export function updateEvent(id: string, updates: Partial<ShootEvent>): void {
  const events = getEvents();
  const index = events.findIndex((e) => e.id === id);
  if (index !== -1) {
    const merged = { ...events[index], ...updates };
    events[index] = sanitizeEventForLocalStorage(merged);
    safeSetLocalStorage(STORAGE_KEY, events);
  }
}

export function deleteEvent(id: string): void {
  const events = getEvents();
  const eventToDelete = events.find((e) => e.id === id);
  if (eventToDelete && eventToDelete.poses) {
    eventToDelete.poses.forEach((p) => {
      deleteImageFromDB(`${id}_${p.id}_ai`).catch(console.warn);
      deleteImageFromDB(`${id}_${p.id}_upload`).catch(console.warn);
      deleteImageFromDB(`${id}_${p.id}_active`).catch(console.warn);
    });
  }
  const filtered = events.filter((e) => e.id !== id);
  safeSetLocalStorage(STORAGE_KEY, filtered);
}

export function getActiveEventId(): string | null {
  return localStorage.getItem(ACTIVE_EVENT_KEY);
}

export function setActiveEventId(id: string | null): void {
  if (id) {
    localStorage.setItem(ACTIVE_EVENT_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_EVENT_KEY);
  }
}

