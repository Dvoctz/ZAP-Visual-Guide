export type ViewState = 
  | { name: 'home' }
  | { name: 'create' }
  | { name: 'eventDetail'; eventId: string }
  | { name: 'posingGuide'; eventId: string }
  | { name: 'colorStyle'; eventId: string }
  | { name: 'shootMode'; eventId: string; initialPoseIndex: number }
  | { name: 'settings' }
  | { name: 'guidesList' };

export type CreativeProviderId = 'openai';
export type ReferenceProviderId = 'openai' | 'upload';
export type ProviderId = CreativeProviderId | ReferenceProviderId;

export type ProviderStatus = 'available' | 'connected' | 'not_connected' | 'unavailable' | 'error';

export type AICapability =
  | 'TEXT_GENERATION'
  | 'STRUCTURED_OUTPUT'
  | 'VISION_ANALYSIS'
  | 'IMAGE_GENERATION'
  | 'COLOR_ANALYSIS'
  | 'POSE_GENERATION'
  | 'REFERENCE_UPLOAD';

export interface GenerationMetadata {
  provider: ProviderId | string;
  model?: string;
  generatedAt: string;
}

export interface BrideOutfit {
  type: string;
  color: string;
  description?: string;
  accessories?: string;
  jewellery?: string;
  footwear?: string;
  dupatta?: string;
  stylingNotes?: string;
}

export interface GroomOutfit {
  type: string;
  color: string;
  description?: string;
  accessories?: string;
  footwear?: string;
  stylingNotes?: string;
}

export interface OutfitSet {
  id: string;
  name: string;
  bride: BrideOutfit;
  groom: GroomOutfit;
}

export interface OutfitContext {
  bride: BrideOutfit;
  groom: GroomOutfit;
  activeOutfitSetId?: string;
  outfitSets?: OutfitSet[];
  customDescription?: string;
}

export interface EnvironmentReference {
  id: string;
  name: string;
  imageUrl: string; // Base64 data URL
  capturedAt: string;
  description?: string;
}

export interface ReferenceImageData {
  type: 'ai' | 'upload';
  provider?: ReferenceProviderId | string;
  model?: string; // e.g., 'gemini-3.1-flash-image', 'gpt-image-2'
  url: string; // Base64 data URL or storage URI
  generatedAt?: string;
  promptUsed?: string;
  environmentId?: string;
  environmentName?: string;
}

export interface AppSettings {
  creativeProvider: CreativeProviderId;
  referenceProvider: ReferenceProviderId;
}

export interface Pose {
  id: string;
  order: number;
  title: string;
  category?: string;
  shootingIntent?: string;
  clientDirection: string;
  photographerConcept: string;
  mood: string;
  environmentId?: string;
  referenceImage?: ReferenceImageData | string;
  aiReference?: ReferenceImageData;
  uploadedReference?: ReferenceImageData;
  activeReferenceType?: 'ai' | 'upload';
  referenceApproved?: boolean;
  instructionsChanged?: boolean;
  completed: boolean;
  generatedBy?: GenerationMetadata;
}

export interface HSLChannel {
  hue: number;
  saturation: number;
  luminance: number;
}

export interface ToneCurvePoint {
  x: number;
  y: number;
}

export interface ColorRecipe {
  presetName: string;
  description: string;
  whiteBalance: {
    mode?: 'Custom' | 'As Shot';
    temperature: number; // Kelvin temperature (e.g. 5600, range 2000 to 12000)
    tint: number; // Lightroom tint value (e.g. -150 to +150, typically -25 to +25)
  };
  basic: {
    exposure: number; // -5.0 to +5.0 (typically -1.5 to +1.5)
    contrast: number; // -100 to +100
    highlights: number; // -100 to +100
    shadows: number; // -100 to +100
    whites: number; // -100 to +100
    blacks: number; // -100 to +100
    texture: number; // -100 to +100
    clarity: number; // -100 to +100
    dehaze: number; // -100 to +100
    vibrance: number; // -100 to +100
    saturation: number; // -100 to +100
  };
  toneCurve?: {
    rgb?: ToneCurvePoint[];
    red?: ToneCurvePoint[];
    green?: ToneCurvePoint[];
    blue?: ToneCurvePoint[];
  };
  colorMixer: {
    red: HSLChannel;
    orange: HSLChannel;
    yellow: HSLChannel;
    green: HSLChannel;
    aqua: HSLChannel;
    blue: HSLChannel;
    purple: HSLChannel;
    magenta: HSLChannel;
  };
  colorGrading: {
    shadows: { hue: number; saturation: number; luminance?: number };
    midtones: { hue: number; saturation: number; luminance?: number };
    highlights: { hue: number; saturation: number; luminance?: number };
    blending: number; // 0 to 100
    balance: number; // -100 to +100
  };
  detail: {
    grainAmount: number; // 0 to 100
    grainSize: number; // 0 to 100
    grainRoughness: number; // 0 to 100
  };
  effects: {
    vignette: number; // -100 to +100
  };
  sourceInfo?: {
    type: 'approved_reference' | 'environment' | 'event_style';
    title: string;
    imageUrl?: string;
  };
  generatedAt?: string;
}

export interface ColorStyle {
  name: string;
  overallLook: string;
  skinTone: string;
  highlights: string;
  shadows: string;
  whites: string;
  blacks: string;
  contrast: string;
  temperature: string;
  saturation: string;
  colorDirection?: string;
  filmCharacter: string;
  editingNotes: string;
  generatedBy?: GenerationMetadata;
}

export interface GuideVersion {
  version: number;
  createdAt: number;
  overallConcept?: string;
  poses: Pose[];
  colorStyle?: ColorStyle;
  colorRecipe?: ColorRecipe;
  generatedBy?: GenerationMetadata;
}

export interface ShootEvent {
  id: string;
  name: string;
  type: string;
  customType?: string;
  location: string;
  style: string;
  timeOfDay: string;
  description: string;
  createdAt: number;
  outfitContext?: OutfitContext;
  environments?: EnvironmentReference[];
  activeEnvironmentId?: string;
  overallConcept?: string;
  poses?: Pose[];
  colorStyle?: ColorStyle;
  colorRecipe?: ColorRecipe;
  colorSource?: 'approved_reference' | 'event';
  selectedColorReferenceId?: string;
  referenceColorRecipes?: Record<string, ColorRecipe>;
  eventColorRecipe?: ColorRecipe;
  guideHistory?: GuideVersion[];
  generatedBy?: GenerationMetadata;
}

export const BRIDE_OUTFIT_TYPES = [
  "Lehenga",
  "Saree",
  "Anarkali",
  "Sharara",
  "Gharara",
  "Salwar / Kurta",
  "Indo-Western",
  "Contemporary Gown",
  "Custom"
] as const;

export const GROOM_OUTFIT_TYPES = [
  "Sherwani",
  "Kurta",
  "Bandhgala",
  "Indo-Western",
  "Suit",
  "Tuxedo",
  "Contemporary",
  "Custom"
] as const;

export const COMMON_OUTFIT_COLORS = [
  "Pastel Peach",
  "Pastel Pink",
  "Ivory & Gold",
  "Mustard Yellow",
  "Emerald Green",
  "Crimson Red",
  "Deep Maroon",
  "Royal Blue",
  "Sage Green",
  "Champagne",
  "Midnight Black",
  "Custom"
] as const;

export const EVENT_TYPES = [
  "Getting Ready",
  "Pre-Haldi",
  "Haldi",
  "Post-Haldi",
  "Pre-Mehndi",
  "Mehndi",
  "Post-Mehndi",
  "Sangeet",
  "Pre-Wedding",
  "Wedding",
  "Post-Wedding",
  "Reception",
  "Post-Reception",
  "Couple Shoot",
  "Bridal Portraits",
  "Groom Portraits",
  "Custom"
] as const;
