import { ReferenceProvider } from './types';
import { generateOpenAIPoseReference } from '../api';
import { ReferenceImageData } from '../../types';

// Helper to convert an uploaded File to base64 data URL
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const nameLower = file.name.toLowerCase();
    const hasValidExt = validExtensions.some((ext) => nameLower.endsWith(ext));

    if (!validTypes.includes(file.type) && !hasValidExt) {
      reject(new Error('Unable to load this image. Please try another JPG, PNG or WEBP.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to load this image. Please try another JPG, PNG or WEBP.'));
      }
    };
    reader.onerror = () => {
      reject(new Error('Unable to load this image. Please try another JPG, PNG or WEBP.'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * 1. OpenAI Provider (GPT Image 2)
 * Connected to server-side API with gpt-image-2 model.
 */
export const OpenAIImageProvider: ReferenceProvider = {
  id: 'openai',
  name: 'OpenAI',
  model: 'gpt-image-2',
  type: 'ai',
  status: 'available',
  statusMessage: 'Connected and ready with GPT Image 2.',
  statusReason: 'Connected via server OpenAI API.',
  description: 'GPT Image 2',
  badgeText: 'CONNECTED',
  capabilities: {
    generate: true,
    upload: false,
  },
  generate: async (event, pose, overallConcept, prompt, environment) => {
    const res = await generateOpenAIPoseReference(event, pose, overallConcept, prompt, environment);
    if (!res.success || !res.referenceImage) {
      throw new Error('OpenAI image generation failed.');
    }
    return {
      type: 'ai',
      provider: 'openai',
      model: res.referenceImage.model || 'gpt-image-2',
      url: res.referenceImage.url,
      generatedAt: res.referenceImage.generatedAt || new Date().toISOString(),
      promptUsed: res.referenceImage.promptUsed || prompt || pose.title,
      environmentId: environment?.id,
      environmentName: environment?.name,
    };
  },
};

/**
 * 2. Upload Reference Provider (My Reference)
 * Allows the photographer to upload high-resolution local reference photos.
 * Status is AVAILABLE.
 */
export const UploadReferenceProvider: ReferenceProvider = {
  id: 'upload',
  name: 'My Reference',
  type: 'upload',
  status: 'available',
  statusMessage: 'Upload your photograph (JPG, JPEG, PNG, WEBP)',
  statusReason: 'Upload your own photograph or composition sample.',
  description: 'Upload your photograph',
  badgeText: 'AVAILABLE',
  capabilities: {
    generate: false,
    upload: true,
  },
  upload: async (file: File): Promise<ReferenceImageData> => {
    const dataUrl = await readFileAsDataURL(file);
    return {
      type: 'upload',
      provider: 'upload',
      url: dataUrl,
      generatedAt: new Date().toISOString(),
      promptUsed: file.name,
    };
  },
};

export const ALL_PROVIDERS: ReferenceProvider[] = [
  OpenAIImageProvider,
  UploadReferenceProvider,
];
