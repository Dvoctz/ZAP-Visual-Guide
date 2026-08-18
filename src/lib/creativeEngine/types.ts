import {
  CreativeProviderId,
  ProviderStatus,
  AICapability,
  ShootEvent,
  Pose,
  ColorStyle,
  GenerationMetadata,
} from '../../types';

export type { CreativeProviderId, ProviderStatus, AICapability };

export interface ShootGuideResult {
  title?: string;
  overallConcept?: string;
  poses: Pose[];
  colorStyle: ColorStyle;
  generatedBy?: GenerationMetadata;
}

export interface PoseImprovementOptions {
  focus?: string;
  clientContext?: string;
}

export interface ImageAnalysisResult {
  poseDescription: string;
  bodyPositioning: string;
  interaction: string;
  composition: string;
  light: string;
  environment: string;
  mood: string;
  colorCharacteristics: string;
  suggestedPosingGuidance?: string;
}

export interface CreativeProvider {
  id: CreativeProviderId;
  name: string;
  company: 'OpenAI';
  status: ProviderStatus;
  statusMessage: string;
  statusReason?: string;
  description: string;
  badgeText: string;
  models: string[];
  capabilities: AICapability[];
  generateShootGuide?: (event: ShootEvent) => Promise<ShootGuideResult>;
  improvePose?: (event: ShootEvent, pose: Pose, options?: PoseImprovementOptions) => Promise<Pose>;
  generateColorStyle?: (event: ShootEvent) => Promise<ColorStyle>;
  analyzeImage?: (imageDataUrl: string) => Promise<ImageAnalysisResult>;
}
