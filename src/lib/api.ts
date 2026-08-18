import { Pose, ColorStyle, ShootEvent, EnvironmentReference } from '../types';

export interface ProviderStatusResponse {
  creative: {
    openai: { connected: boolean };
  };
  reference: {
    openai: { available: boolean; status: string; reason?: string };
    upload: { available: boolean; status: string };
  };
}

export async function fetchProviderStatuses(): Promise<ProviderStatusResponse> {
  const response = await fetch('/api/providers/status');
  if (!response.ok) {
    throw new Error('Failed to fetch provider status');
  }
  return response.json();
}

export async function checkOpenAIStatus(): Promise<{ connected: boolean }> {
  const response = await fetch('/api/providers/openai/status');
  if (!response.ok) {
    return { connected: false };
  }
  return response.json();
}

export async function generateOpenAIPoseReference(
  event: ShootEvent,
  pose: Pose,
  overallConcept?: string,
  prompt?: string,
  environment?: EnvironmentReference
): Promise<{
  success: boolean;
  referenceImage: {
    type: 'ai';
    provider: 'openai';
    model: string;
    url: string;
    generatedAt: string;
    promptUsed: string;
    environmentId?: string;
    environmentName?: string;
  };
}> {
  const response = await fetch('/api/generate-openai-pose-reference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: {
        name: event.name,
        type: event.type === 'Custom' ? event.customType : event.type,
        location: event.location,
        style: event.style,
        timeOfDay: event.timeOfDay,
        description: event.description,
        outfitContext: event.outfitContext,
      },
      pose: {
        id: pose.id,
        order: pose.order,
        title: pose.title,
        category: pose.category,
        shootingIntent: pose.shootingIntent,
        clientDirection: pose.clientDirection,
        photographerConcept: pose.photographerConcept,
        mood: pose.mood,
        environmentId: environment?.id || pose.environmentId,
      },
      environment: environment
        ? {
            id: environment.id,
            name: environment.name,
            description: environment.description,
            imageUrl: environment.imageUrl,
          }
        : undefined,
      overallConcept: overallConcept || event.overallConcept,
      prompt,
    }),
  });

  if (!response.ok) {
    let errorMsg = 'Unable to generate the reference image.';
    try {
      const errData = await response.json();
      if (errData?.error) {
        errorMsg = errData.error;
      }
    } catch {
      // fallback
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

export async function generateShootGuide(event: ShootEvent): Promise<{
  title?: string;
  overallConcept?: string;
  poses: Pose[];
  colorStyle: ColorStyle;
}> {
  const response = await fetch('/api/generate-guide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventName: event.name,
      eventType: event.type === 'Custom' ? event.customType : event.type,
      location: event.location,
      style: event.style,
      timeOfDay: event.timeOfDay,
      description: event.description,
    }),
  });

  if (!response.ok) {
    let errorMsg = 'Failed to generate shoot guide';
    try {
      const errData = await response.json();
      if (errData?.error) {
        errorMsg = errData.error;
      }
    } catch {
      // fallback
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();

  // Ensure robust formatting of poses
  const rawPoses = Array.isArray(data.poses) ? data.poses : [];
  data.poses = rawPoses.map((p: any, index: number) => ({
    id: p.id || `pose-${String(index + 1).padStart(2, '0')}`,
    order: typeof p.order === 'number' ? p.order : index + 1,
    title: p.title || `Pose ${index + 1}`,
    category: p.category || 'Interaction',
    shootingIntent: p.shootingIntent || '',
    clientDirection: p.clientDirection || 'Look at each other naturally and take a slow breath.',
    photographerConcept: p.photographerConcept || 'Capture natural interaction with flattering depth.',
    mood: p.mood || event.style || 'Cinematic',
    completed: false,
  }));

  return data;
}

export async function analyzeColorPreset(params: {
  event: ShootEvent;
  image?: string;
  colorStyle?: ColorStyle;
  sourceInfo?: {
    type: 'approved_reference' | 'environment' | 'event_style';
    title: string;
    imageUrl?: string;
  };
}): Promise<{ success: boolean; recipe: any }> {
  const response = await fetch('/api/analyze-color-preset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: params.image,
      event: {
        name: params.event.name,
        type: params.event.type === 'Custom' ? params.event.customType : params.event.type,
        location: params.event.location,
        style: params.event.style,
        timeOfDay: params.event.timeOfDay,
        description: params.event.description,
        outfitContext: params.event.outfitContext,
      },
      colorStyle: params.colorStyle || params.event.colorStyle,
      sourceInfo: params.sourceInfo,
    }),
  });

  if (!response.ok) {
    let errorMsg = 'Failed to analyze color preset';
    try {
      const errData = await response.json();
      if (errData?.error) {
        errorMsg = errData.error;
      }
    } catch {
      // fallback
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

