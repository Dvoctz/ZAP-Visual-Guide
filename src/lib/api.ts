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
  const startRes = await fetch('/api/generate-openai-pose-reference', {
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

  if (!startRes.ok) {
    let errorMsg = 'Unable to start reference image generation.';
    try {
      const errData = await startRes.json();
      if (errData?.error) {
        errorMsg = errData.error;
      }
    } catch {}
    throw new Error(errorMsg);
  }

  const startData = await startRes.json();
  const jobId = startData.jobId;
  if (!jobId) {
    throw new Error('Failed to obtain workflow job ID for reference generation.');
  }

  // Poll status endpoint every 3 seconds (up to 60 attempts = 180s)
  const maxAttempts = 60;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const statusRes = await fetch(`/api/pose-reference-status/${jobId}`);
    if (!statusRes.ok) continue;

    const statusData = await statusRes.json();
    if (statusData.status === 'completed') {
      const imgUrl = statusData.image || statusData.result?.imageUrl;
      if (!imgUrl) {
        throw new Error('Workflow completed but did not return an image URL.');
      }
      return {
        success: true,
        referenceImage: {
          type: 'ai',
          provider: 'openai',
          model: statusData.metadata?.model || statusData.result?.model || 'gpt-image-2',
          url: imgUrl,
          generatedAt: new Date().toISOString(),
          promptUsed: prompt || pose.title,
          environmentId: environment?.id,
          environmentName: environment?.name,
        },
      };
    } else if (statusData.status === 'failed') {
      throw new Error(statusData.error || 'Reference generation workflow failed.');
    }
    // If queued or running, continue polling
  }

  throw new Error('Reference image generation timed out while waiting for workflow completion.');
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
      outfitContext: event.outfitContext,
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
  const payload = data.data || data;

  const rawPoses = Array.isArray(payload.poses) ? payload.poses : [];

  if (rawPoses.length === 0) {
    throw new Error('OpenAI returned an empty or malformed posing sequence. Please retry.');
  }

  const formattedPoses: Pose[] = rawPoses.map((p: any, index: number) => ({
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

  return {
    title: payload.title || event.name,
    overallConcept: payload.overallConcept || payload.concept || '',
    poses: formattedPoses,
    colorStyle: payload.colorStyle || {},
  };
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
  const imageDataUrl = params.image || undefined;

  const response = await fetch('/api/analyze-color-preset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageDataUrl,
      imageBase64: imageDataUrl,
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

  const data = await response.json();
  if (!data || !data.recipe) {
    throw new Error('Server did not return a valid color preset recipe.');
  }

  return data;
}

