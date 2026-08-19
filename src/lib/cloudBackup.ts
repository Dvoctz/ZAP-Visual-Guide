import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ShootEvent, EnvironmentReference, Pose, ReferenceImageData, ColorRecipe } from '../types';
import { getImageFromDB } from './imageStorage';

/**
 * ============================================================================
 * ZAP VISUAL GUIDE — OPTIONAL SUPABASE CLOUD BACKUP MODULE
 * ============================================================================
 * 
 * CRITICAL SAFETY DIRECTIVE:
 * - This module is strictly an OPTIONAL, BEST-EFFORT, NON-BLOCKING cloud backup layer.
 * - IndexedDB and localStorage remain the absolute source of truth.
 * - If Supabase is offline, misconfigured, lacks permissions, or errors out,
 *   this module catches all errors gracefully and logs warnings.
 * - It will NEVER throw, reject, block UI workflows, or interrupt photo shoots.
 */

// Storage Bucket for Private Shoot Materials
export const SUPABASE_STORAGE_BUCKET = 'zap-visual-guide';

export type CloudSyncStatus = 'disabled' | 'idle' | 'syncing' | 'synced' | 'error';

export interface CloudSyncState {
  isConfigured: boolean;
  status: CloudSyncStatus;
  lastSyncedAt?: number;
  errorMessage?: string;
  syncedEventsCount: number;
}

// Global sync state tracking
let currentSyncState: CloudSyncState = {
  isConfigured: false,
  status: 'disabled',
  syncedEventsCount: 0,
};

const listeners = new Set<(state: CloudSyncState) => void>();

function updateSyncState(partial: Partial<CloudSyncState>) {
  currentSyncState = { ...currentSyncState, ...partial };
  listeners.forEach((listener) => {
    try {
      listener(currentSyncState);
    } catch {
      // Ignore listener errors
    }
  });
}

export function subscribeCloudSyncState(callback: (state: CloudSyncState) => void): () => void {
  listeners.add(callback);
  callback(currentSyncState);
  return () => {
    listeners.delete(callback);
  };
}

export function getCloudSyncState(): CloudSyncState {
  return currentSyncState;
}

// Client Singleton (Lazy Initialized)
let supabaseClient: SupabaseClient | null = null;
let isInitialized = false;

function getSupabaseConfig(): { url: string; anonKey: string } | null {
  try {
    const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
    const url =
      metaEnv?.VITE_SUPABASE_URL ||
      metaEnv?.SUPABASE_URL ||
      (typeof window !== 'undefined' && (window as any)?.__ENV__?.VITE_SUPABASE_URL) ||
      '';

    const anonKey =
      metaEnv?.VITE_SUPABASE_ANON_KEY ||
      metaEnv?.SUPABASE_ANON_KEY ||
      (typeof window !== 'undefined' && (window as any)?.__ENV__?.VITE_SUPABASE_ANON_KEY) ||
      '';

    if (url && anonKey && typeof url === 'string' && url.startsWith('http')) {
      return { url: url.trim(), anonKey: String(anonKey).trim() };
    }
  } catch (err) {
    console.warn('[CloudBackup] Could not read Supabase configuration environment:', err);
  }
  return null;
}

export function isCloudBackupConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

function getClient(): SupabaseClient | null {
  if (isInitialized) {
    return supabaseClient;
  }

  isInitialized = true;
  const config = getSupabaseConfig();

  if (!config) {
    updateSyncState({ isConfigured: false, status: 'disabled' });
    return null;
  }

  try {
    supabaseClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    updateSyncState({ isConfigured: true, status: 'idle' });
    return supabaseClient;
  } catch (err: any) {
    console.warn('[CloudBackup] Failed to initialize Supabase client:', err?.message || err);
    updateSyncState({ isConfigured: false, status: 'error', errorMessage: 'Supabase initialization failed' });
    return null;
  }
}

/**
 * Converts a Base64 data URL into a binary Blob and detects its MIME extension.
 */
function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string; contentType: string } | null {
  try {
    if (!dataUrl.startsWith('data:')) {
      return null;
    }
    const parts = dataUrl.split(',');
    if (parts.length !== 2) return null;

    const mimeMatch = parts[0].match(/:(.*?);/);
    const contentType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    let ext = 'jpg';
    if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('webp')) ext = 'webp';
    else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';

    const binary = atob(parts[1]);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([array], { type: contentType });
    return { blob, ext, contentType };
  } catch (err) {
    console.warn('[CloudBackup] Failed to convert dataUrl to Blob:', err);
    return null;
  }
}

/**
 * Asynchronously uploads an image Blob to Supabase Storage.
 * Best-effort only. Returns the uploaded storage path or null.
 */
async function uploadImageToStorage(
  client: SupabaseClient,
  storagePath: string,
  dataUrl: string
): Promise<string | null> {
  try {
    const converted = dataUrlToBlob(dataUrl);
    if (!converted) return null;

    const { error } = await client.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(storagePath, converted.blob, {
        contentType: converted.contentType,
        upsert: true,
      });

    if (error) {
      console.warn(`[CloudBackup] Storage upload warning for ${storagePath}:`, error.message);
      return null;
    }

    return storagePath;
  } catch (err: any) {
    console.warn(`[CloudBackup] Storage upload exception for ${storagePath}:`, err?.message || err);
    return null;
  }
}

/**
 * BACKUP 1: Event Metadata
 * Backs up ShootEvent core details without large base64 image payloads.
 */
export async function backupEvent(event: ShootEvent): Promise<void> {
  const client = getClient();
  if (!client) return;

  updateSyncState({ status: 'syncing', errorMessage: undefined });

  try {
    const payload = {
      id: event.id,
      name: event.name,
      type: event.type,
      custom_type: event.customType || null,
      location: event.location,
      style: event.style,
      time_of_day: event.timeOfDay,
      description: event.description,
      outfit_context: event.outfitContext || null,
      overall_concept: event.overallConcept || null,
      active_environment_id: event.activeEnvironmentId || null,
      created_at: new Date(event.createdAt || Date.now()).toISOString(),
      updated_at: new Date().toISOString(),
      sync_status: 'synced',
    };

    const { error } = await client.from('events').upsert(payload, { onConflict: 'id' });

    if (error) {
      console.warn('[CloudBackup] events table upsert warning:', error.message);
      updateSyncState({ status: 'error', errorMessage: error.message });
      return;
    }

    updateSyncState({
      status: 'synced',
      lastSyncedAt: Date.now(),
      syncedEventsCount: (currentSyncState.syncedEventsCount || 0) + 1,
    });
  } catch (err: any) {
    console.warn('[CloudBackup] backupEvent non-blocking error:', err?.message || err);
    updateSyncState({ status: 'error', errorMessage: err?.message });
  }
}

/**
 * BACKUP 2: Environment Photograph
 * Uploads photograph to Supabase Storage and records metadata in event_images table.
 */
export async function backupEnvironmentImage(eventId: string, env: EnvironmentReference): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    let rawDataUrl = env.imageUrl;
    if (!rawDataUrl || rawDataUrl === 'indexeddb') {
      const stored = await getImageFromDB(`${eventId}_env_${env.id}`);
      if (stored) rawDataUrl = stored;
    }

    if (!rawDataUrl || !rawDataUrl.startsWith('data:')) {
      return;
    }

    const converted = dataUrlToBlob(rawDataUrl);
    const ext = converted?.ext || 'jpg';
    const storagePath = `events/${eventId}/environment/${env.id}.${ext}`;

    // Upload to Storage
    const uploadedPath = await uploadImageToStorage(client, storagePath, rawDataUrl);

    // Record in DB metadata
    if (uploadedPath) {
      await client.from('event_images').upsert(
        {
          id: env.id,
          event_id: eventId,
          image_type: 'environment',
          name: env.name,
          description: env.description || null,
          storage_path: uploadedPath,
          captured_at: env.capturedAt || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    }
  } catch (err: any) {
    console.warn('[CloudBackup] backupEnvironmentImage non-blocking error:', err?.message || err);
  }
}

/**
 * BACKUP 3: Pose Reference (AI Generated or Uploaded)
 * Uploads reference image to Supabase Storage and records metadata in pose_references table.
 */
export async function backupPoseReference(
  eventId: string,
  pose: Pose,
  refData?: ReferenceImageData
): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    const activeRef = refData || (pose.activeReferenceType === 'upload' ? pose.uploadedReference : pose.aiReference);
    let rawUrl = activeRef?.url || (typeof pose.referenceImage === 'string' ? pose.referenceImage : pose.referenceImage?.url);

    if (!rawUrl || rawUrl === 'indexeddb') {
      const dbKey = pose.activeReferenceType === 'upload' ? `${eventId}_${pose.id}_upload` : `${eventId}_${pose.id}_ai`;
      const stored = await getImageFromDB(dbKey);
      if (stored) rawUrl = stored;
    }

    if (!rawUrl || !rawUrl.startsWith('data:')) {
      return;
    }

    const converted = dataUrlToBlob(rawUrl);
    const ext = converted?.ext || 'png';
    const refType = activeRef?.type || pose.activeReferenceType || 'ai';
    const storagePath = `events/${eventId}/references/${pose.id}_${refType}.${ext}`;

    const uploadedPath = await uploadImageToStorage(client, storagePath, rawUrl);

    if (uploadedPath) {
      await client.from('pose_references').upsert(
        {
          id: `${eventId}_${pose.id}_${refType}`,
          event_id: eventId,
          pose_id: pose.id,
          pose_order: pose.order,
          pose_title: pose.title,
          reference_type: refType,
          provider: activeRef?.provider || (refType === 'upload' ? 'upload' : 'openai'),
          storage_path: uploadedPath,
          prompt: activeRef?.promptUsed || null,
          instructions_changed: !!pose.instructionsChanged,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    }
  } catch (err: any) {
    console.warn('[CloudBackup] backupPoseReference non-blocking error:', err?.message || err);
  }
}

/**
 * BACKUP 4: Color Recipe
 * Uploads formulated ColorRecipe metadata to color_recipes table and Storage JSON.
 */
export async function backupColorRecipe(
  eventId: string,
  recipe: ColorRecipe,
  referencePoseId?: string
): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    const recipeId = referencePoseId ? `${eventId}_pose_${referencePoseId}` : `${eventId}_event_style`;
    const jsonPath = `events/${eventId}/color/${recipeId}.json`;

    // Save JSON to Storage
    try {
      const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' });
      await client.storage.from(SUPABASE_STORAGE_BUCKET).upload(jsonPath, blob, {
        contentType: 'application/json',
        upsert: true,
      });
    } catch {
      // Ignore storage error
    }

    // Save metadata to DB
    await client.from('color_recipes').upsert(
      {
        id: recipeId,
        event_id: eventId,
        reference_pose_id: referencePoseId || null,
        preset_name: recipe.presetName,
        temperature: recipe.whiteBalance?.temperature,
        tint: recipe.whiteBalance?.tint,
        recipe_json: recipe,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch (err: any) {
    console.warn('[CloudBackup] backupColorRecipe non-blocking error:', err?.message || err);
  }
}

/**
 * BACKUP 5: Full Event Synchronization Helper
 * Non-blocking helper to asynchronously back up all event elements.
 */
export async function backupFullEvent(event: ShootEvent): Promise<void> {
  if (!isCloudBackupConfigured()) return;

  // Run in background without awaiting or blocking the caller
  setTimeout(async () => {
    try {
      // 1. Event metadata
      await backupEvent(event);

      // 2. Environments
      if (event.environments && event.environments.length > 0) {
        for (const env of event.environments) {
          await backupEnvironmentImage(event.id, env);
        }
      }

      // 3. Pose references
      if (event.poses && event.poses.length > 0) {
        for (const pose of event.poses) {
          if (pose.aiReference?.url || pose.uploadedReference?.url || pose.referenceImage) {
            await backupPoseReference(event.id, pose);
          }
        }
      }

      // 4. Color recipes
      if (event.colorRecipe) {
        await backupColorRecipe(event.id, event.colorRecipe, event.selectedColorReferenceId);
      }
      if (event.referenceColorRecipes) {
        for (const [poseId, recipe] of Object.entries(event.referenceColorRecipes)) {
          if (recipe) {
            await backupColorRecipe(event.id, recipe, poseId);
          }
        }
      }
    } catch (err: any) {
      console.warn('[CloudBackup] backupFullEvent background task completed with warnings:', err?.message || err);
    }
  }, 50);
}
