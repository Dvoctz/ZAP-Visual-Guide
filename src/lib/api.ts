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
  success?: boolean;
  data?: any;
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

  const rawPoses =
    Array.isArray(payload.poses)
      ? payload.poses
      : Array.isArray(data.poses)
        ? data.poses
        : [];

  if (rawPoses.length === 0) {
    throw new Error(
      'OpenAI returned an empty or malformed posing sequence. Please retry.'
    );
  }

  const formattedPoses: Pose[] = rawPoses.map((p: any, index: number) => ({
    id: p.id || `pose-${String(index + 1).padStart(2, '0')}`,
    order: typeof p.order === 'number' ? p.order : index + 1,
    title: p.title || `Pose ${index + 1}`,
    category: p.category || 'Interaction',
    shootingIntent: p.shootingIntent || '',
    clientDirection:
      p.clientDirection ||
      'Look at each other naturally and take a slow breath.',
    photographerConcept:
      p.photographerConcept ||
      'Capture natural interaction with flattering depth.',
    mood: p.mood || event.style || 'Cinematic',
    completed: false,
  }));

  return {
    success: true,
    data: payload,
    overallConcept:
      payload.overallConcept ||
      data.overallConcept ||
      '',
    poses: formattedPoses,
    colorStyle:
      payload.colorStyle ||
      data.colorStyle ||
      {},
  };
}

async function prepareAnalysisImage(dataUrl: string, maxSize = 1024): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) return dataUrl;
  
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      
      if (width <= maxSize && height <= maxSize) {
        // Still convert to standard jpeg to normalize format and reduce byte size
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
        return;
      }
      
      if (width > height) {
        if (width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function detectMimeFromBase64(base64: string): string {
  const cleaned = base64.replace(/[\s\r\n\t]/g, '');
  if (cleaned.startsWith('/9j')) return 'image/jpeg';
  if (cleaned.startsWith('iVBOR')) return 'image/png';
  if (cleaned.startsWith('UklGR')) return 'image/webp';
  return 'unknown';
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
  let analysisImage: string | undefined = undefined;

  if (params.image && params.image !== 'indexeddb') {
    const rawImage = params.image;
    let declaredMime = 'none';
    let base64Part = rawImage;

    if (rawImage.startsWith('data:')) {
      const semiIdx = rawImage.indexOf(';base64,');
      if (semiIdx !== -1) {
        declaredMime = rawImage.slice(5, semiIdx);
        base64Part = rawImage.slice(semiIdx + 8);
      }
    }

    const detectedMime = detectMimeFromBase64(base64Part);
    console.log('[ColorPreset] source type:', params.sourceInfo?.type || (rawImage ? 'reference' : 'event'));
    console.log('[ColorPreset] declared MIME type:', declaredMime);
    console.log('[ColorPreset] detected MIME type:', detectedMime);
    console.log('[ColorPreset] data URL valid:', rawImage.startsWith('data:image/'));
    console.log('[ColorPreset] Base64 payload length:', base64Part.length);
    console.log('[ColorPreset] approximate image byte size:', Math.round((base64Part.length * 3) / 4), 'bytes');

    // Generate an in-memory compressed/scaled version for vision analysis ONLY without modifying original
    analysisImage = await prepareAnalysisImage(rawImage, 1024);
    const analysisBase64 = analysisImage.startsWith('data:') 
      ? analysisImage.slice(analysisImage.indexOf(',') + 1) 
      : analysisImage;
    console.log('[ColorPreset] Analysis version Base64 length:', analysisBase64.length);
    console.log('[ColorPreset] Analysis version byte size:', Math.round((analysisBase64.length * 3) / 4), 'bytes');
  }

  // Construct minimal, single-image payload
  const requestPayload = {
    image: analysisImage,
    event: {
      name: params.event?.name,
      type: params.event?.type === 'Custom' ? params.event?.customType : params.event?.type,
      location: params.event?.location,
      style: params.event?.style,
      timeOfDay: params.event?.timeOfDay,
      description: params.event?.description,
      outfitContext: params.event?.outfitContext,
    },
    colorStyle: params.colorStyle || params.event?.colorStyle,
    sourceInfo: params.sourceInfo
      ? {
          type: params.sourceInfo.type,
          title: params.sourceInfo.title,
        }
      : undefined,
  };

  const payloadString = JSON.stringify(requestPayload);
  console.log('[ColorPreset] request JSON byte size:', new Blob([payloadString]).size, 'bytes');

  const response = await fetch('/api/analyze-color-preset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payloadString,
  });

  if (!response.ok) {
    let errorMsg = 'Failed to analyze color preset';
    try {
      const text = await response.text();
      try {
        const errData = JSON.parse(text);
        if (errData?.error) {
          errorMsg = errData.error;
        }
      } catch {
        errorMsg = `Server error (${response.status}): ` + text.substring(0, 150);
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

