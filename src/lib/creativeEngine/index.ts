import { CreativeProviderId, CreativeProvider, ShootGuideResult } from './types';
import { ALL_CREATIVE_PROVIDERS, OpenAICreativeProvider } from './providers';
import { ShootEvent, Pose, ColorStyle } from '../../types';

export * from './types';
export * from './providers';

const CREATIVE_SETTINGS_KEY = 'zap_creative_provider_setting';

const DEFAULT_CREATIVE_PROVIDER: CreativeProviderId = 'openai';

export class CreativeEngine {
  /**
   * Returns all registered creative AI providers
   */
  static getProviders(): CreativeProvider[] {
    return ALL_CREATIVE_PROVIDERS;
  }

  /**
   * Find a creative provider by its ID
   */
  static getProvider(id: CreativeProviderId): CreativeProvider | undefined {
    return ALL_CREATIVE_PROVIDERS.find((p) => p.id === id);
  }

  /**
   * Get the active default creative AI provider ID
   */
  static getDefaultProviderId(): CreativeProviderId {
    return DEFAULT_CREATIVE_PROVIDER;
  }

  /**
   * Set user default creative AI provider
   */
  static setDefaultProviderId(providerId: CreativeProviderId): void {
    try {
      localStorage.setItem(CREATIVE_SETTINGS_KEY, providerId);
    } catch (err) {
      console.error('Failed to save creative engine settings', err);
    }
  }

  /**
   * Synchronize provider connection statuses from server health-check API
   */
  static syncStatus(status?: {
    openai?: { connected: boolean };
  }): void {
    if (!status) return;
    const openaiProv = this.getProvider('openai');
    if (openaiProv && status.openai !== undefined) {
      openaiProv.status = status.openai.connected ? 'connected' : 'not_connected';
      openaiProv.badgeText = status.openai.connected ? 'CONNECTED' : 'NOT CONNECTED';
      openaiProv.statusMessage = status.openai.connected
        ? 'Connected and active for posing, creative direction, and color.'
        : 'OpenAI is not connected.';
    }
  }

  /**
   * Check if a creative provider is connected and ready
   */
  static isProviderConnected(providerId: CreativeProviderId): boolean {
    const prov = this.getProvider(providerId);
    return prov ? prov.status === 'connected' || prov.status === 'available' : false;
  }

  /**
   * Generate Shoot Guide using OpenAI
   */
  static async generateShootGuide(
    event: ShootEvent,
    providerId?: CreativeProviderId
  ): Promise<ShootGuideResult> {
    const targetId = providerId || this.getDefaultProviderId();
    const provider = this.getProvider(targetId);

    if (!provider) {
      throw new Error(`Creative AI provider "${targetId}" not found.`);
    }

    if (provider.status !== 'connected' && provider.status !== 'available') {
      throw new Error(
        provider.statusMessage || `Creative AI provider "${provider.name}" is not connected.`
      );
    }

    if (!provider.generateShootGuide) {
      throw new Error(`Generation capability not implemented for ${provider.name}.`);
    }

    return await provider.generateShootGuide(event);
  }

  /**
   * Prepare architecture for future "Improve with AI" single-pose action
   */
  static async improvePose(
    event: ShootEvent,
    pose: Pose,
    options?: { focus?: string; clientContext?: string },
    providerId?: CreativeProviderId
  ): Promise<Pose> {
    const targetId = providerId || this.getDefaultProviderId();
    const provider = this.getProvider(targetId);

    if (!provider) {
      throw new Error(`Creative AI provider "${targetId}" not found.`);
    }

    if (provider.improvePose) {
      return await provider.improvePose(event, pose, options);
    }

    return pose;
  }

  /**
   * Prepare architecture for color style generation
   */
  static async generateColorStyle(
    event: ShootEvent,
    providerId?: CreativeProviderId
  ): Promise<ColorStyle> {
    const targetId = providerId || this.getDefaultProviderId();
    const provider = this.getProvider(targetId);

    if (!provider) {
      throw new Error(`Creative AI provider "${targetId}" not found.`);
    }

    if (provider.generateColorStyle) {
      return await provider.generateColorStyle(event);
    }

    throw new Error(`Color style capability not available for ${provider.name}.`);
  }

  /**
   * Vision analysis
   */
  static async analyzeImage(imageDataUrl: string, providerId?: CreativeProviderId) {
    const targetId = providerId || this.getDefaultProviderId();
    const provider = this.getProvider(targetId);

    if (!provider) {
      throw new Error(`Creative AI provider "${targetId}" not found.`);
    }

    if (provider.analyzeImage) {
      return await provider.analyzeImage(imageDataUrl);
    }

    throw new Error(`Vision analysis capability not supported by ${provider.name}.`);
  }
}
