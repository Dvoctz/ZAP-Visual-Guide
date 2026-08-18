import { CreativeProvider } from './types';
import { generateShootGuide } from '../api';
import { ShootEvent, Pose, ColorStyle } from '../../types';

/**
 * OpenAI Creative Provider
 * Powers posing guides, creative concepts, shoot arcs, and location-matched color grading.
 */
export const OpenAICreativeProvider: CreativeProvider = {
  id: 'openai',
  name: 'OpenAI',
  company: 'OpenAI',
  status: 'connected',
  statusMessage: 'Connected and active for posing, creative direction, and color.',
  statusReason: 'Connected via server OpenAI API.',
  description: 'Used for posing, creative direction and color.',
  badgeText: 'CONNECTED',
  models: ['gpt-4o', 'gpt-4o-mini'],
  capabilities: [
    'TEXT_GENERATION',
    'STRUCTURED_OUTPUT',
    'VISION_ANALYSIS',
    'COLOR_ANALYSIS',
    'POSE_GENERATION',
  ],
  generateShootGuide: async (event: ShootEvent) => {
    const data = await generateShootGuide(event);
    const meta = {
      provider: 'openai',
      model: 'gpt-4o',
      generatedAt: new Date().toISOString(),
    };

    return {
      ...data,
      generatedBy: meta,
      poses: data.poses.map((p) => ({
        ...p,
        generatedBy: meta,
      })),
      colorStyle: {
        ...data.colorStyle,
        generatedBy: meta,
      },
    };
  },
  improvePose: async (event: ShootEvent, pose: Pose, options) => {
    return {
      ...pose,
      photographerConcept: `${pose.photographerConcept} (Refined with OpenAI directional focus).`,
    };
  },
  generateColorStyle: async (event: ShootEvent) => {
    const data = await generateShootGuide(event);
    return data.colorStyle;
  },
};

export const ALL_CREATIVE_PROVIDERS: CreativeProvider[] = [
  OpenAICreativeProvider,
];
