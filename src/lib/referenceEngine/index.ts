import { ReferenceProviderId, ReferenceProvider } from './types';
import { ALL_PROVIDERS, OpenAIImageProvider, UploadReferenceProvider } from './providers';
import { Pose, ShootEvent, ReferenceImageData, OutfitContext, EnvironmentReference } from '../../types';
import { ReferencePromptBuilder } from './promptBuilder';

export * from './types';
export * from './providers';
export * from './promptBuilder';

const SETTINGS_KEY = 'zap_visual_guide_settings';

export interface ReferenceEngineSettings {
  referenceProvider: ReferenceProviderId;
}

const DEFAULT_SETTINGS: ReferenceEngineSettings = {
  referenceProvider: 'openai',
};

export class ReferenceEngine {
  /**
   * Returns all registered reference providers
   */
  static getProviders(): ReferenceProvider[] {
    return ALL_PROVIDERS;
  }

  /**
   * Find a provider by its unique ID
   */
  static getProvider(id: ReferenceProviderId): ReferenceProvider | undefined {
    return ALL_PROVIDERS.find((p) => p.id === id);
  }

  /**
   * Get the active default provider ID from user settings.
   */
  static getDefaultProviderId(): ReferenceProviderId {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.referenceProvider) {
          const prov = this.getProvider(parsed.referenceProvider as ReferenceProviderId);
          if (prov && (prov.status === 'available' || prov.status === 'connected')) {
            return parsed.referenceProvider as ReferenceProviderId;
          }
        }
      }
    } catch (err) {
      console.warn('Failed to read reference engine settings', err);
    }
    return DEFAULT_SETTINGS.referenceProvider;
  }

  /**
   * Save user default reference provider setting
   */
  static setDefaultProviderId(providerId: ReferenceProviderId): void {
    try {
      const current = this.getSettings();
      const updated = { ...current, referenceProvider: providerId };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to save reference engine settings', err);
    }
  }

  /**
   * Synchronize reference provider statuses from server health-check API
   */
  static syncStatus(status?: {
    openai?: { available: boolean; status?: string };
    upload?: { available: boolean };
  }): void {
    if (!status) return;
    const openaiProv = this.getProvider('openai');
    if (openaiProv && status.openai !== undefined) {
      if (status.openai.available) {
        openaiProv.status = 'available';
        openaiProv.badgeText = 'CONNECTED';
        openaiProv.statusMessage = 'Connected and ready with GPT Image 2.';
        openaiProv.statusReason = 'Connected via server OpenAI API.';
      } else {
        openaiProv.status = 'not_connected';
        openaiProv.badgeText = 'NOT CONNECTED';
        openaiProv.statusMessage = 'OpenAI image generation is not connected.';
        openaiProv.statusReason = 'Configure OPENAI_API_KEY to enable GPT Image 2.';
      }
    }

    const uploadProv = this.getProvider('upload');
    if (uploadProv && status.upload !== undefined) {
      uploadProv.status = 'available';
      uploadProv.badgeText = 'AVAILABLE';
    }
  }

  /**
   * Retrieve all settings
   */
  static getSettings(): ReferenceEngineSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Check if a specific provider is currently available to use
   */
  static isProviderAvailable(providerId: ReferenceProviderId): boolean {
    const prov = this.getProvider(providerId);
    return prov ? prov.status === 'available' || prov.status === 'connected' : false;
  }

  /**
   * Execute reference creation through the specified provider
   */
  static async createReference(
    providerId: ReferenceProviderId,
    options: {
      event?: ShootEvent;
      pose?: Pose;
      overallConcept?: string;
      prompt?: string;
      outfitContext?: OutfitContext;
      environment?: EnvironmentReference;
      file?: File;
    }
  ): Promise<ReferenceImageData> {
    const provider = this.getProvider(providerId);
    if (!provider) {
      throw new Error(`Reference provider "${providerId}" not found.`);
    }

    if (provider.status === 'unavailable') {
      throw new Error(provider.statusMessage || 'This reference provider is currently unavailable.');
    }

    if (provider.status === 'not_connected') {
      throw new Error(provider.statusMessage || 'This reference provider is not connected.');
    }

    if (provider.type === 'upload') {
      if (!options.file) {
        throw new Error('No photograph file provided for upload.');
      }
      if (!provider.upload) {
        throw new Error('Upload capability not implemented for this provider.');
      }
      return await provider.upload(options.file);
    }

    if (provider.type === 'ai') {
      if (!options.event || !options.pose) {
        throw new Error('Event and Pose details are required for AI reference generation.');
      }
      if (!provider.generate) {
        throw new Error('Generation capability not implemented for this provider.');
      }

      // If prompt not explicitly passed, build high-fidelity prompt using ReferencePromptBuilder
      let promptToUse = options.prompt;
      if (!promptToUse) {
        const buildResult = ReferencePromptBuilder.build({
          event: options.event,
          pose: options.pose,
          outfitContext: options.outfitContext || options.event.outfitContext,
          environment: options.environment,
        });
        promptToUse = buildResult.prompt;
      }

      return await provider.generate(
        options.event,
        options.pose,
        options.overallConcept,
        promptToUse,
        options.environment
      );
    }

    throw new Error('Unsupported reference provider type.');
  }
}
