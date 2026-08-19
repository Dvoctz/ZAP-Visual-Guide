import express from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { start, getRun } from 'workflow/api';
import { generatePoseReferenceWorkflow } from '../workflows/poseReferenceWorkflow.js';

dotenv.config();

function sanitizeError(msg: string): string {
  if (!msg) return 'Unknown error occurred';
  return msg
    .replace(/key=[a-zA-Z0-9_\-]+/gi, 'key=***')
    .replace(/AIza[a-zA-Z0-9_\-]+/g, '***')
    .replace(/sk-[a-zA-Z0-9_\-]+/g, '***')
    .replace(/Bearer\s+[a-zA-Z0-9_\-]+/gi, 'Bearer ***');
}

let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key || key.trim().length === 0) {
      throw new Error('OPENAI_API_KEY environment variable is not configured.');
    }
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

const app = express();

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Providers Health Check & Status Endpoint (OpenAI Only)
app.get(['/api/providers/status', '/providers/status'], (req, res) => {
  const hasOpenAI = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0);

  res.json({
    creative: {
      openai: { connected: hasOpenAI },
    },
    reference: {
      openai: {
        available: hasOpenAI,
        status: hasOpenAI ? 'available' : 'not_connected',
        reason: hasOpenAI ? 'Connected and ready with GPT Image 2.' : 'Configure OPENAI_API_KEY to enable GPT Image 2.',
      },
      upload: {
        available: true,
        status: 'available',
      },
    },
  });
});

// Dedicated OpenAI status check
app.get(['/api/providers/openai/status', '/providers/openai/status'], (req, res) => {
  const connected = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0);
  res.json({ connected });
});

// Generate reference image for a single pose using Vercel Workflow and OpenAI gpt-image-2 asynchronously
app.post(['/api/generate-openai-pose-reference', '/generate-openai-pose-reference'], async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim().length === 0) {
      return res.status(400).json({
        error: 'OpenAI is not connected. Configure OPENAI_API_KEY in the server environment.',
      });
    }

    const { event, pose, overallConcept, prompt, environment } = req.body;

    if (!pose || !pose.title) {
      return res.status(400).json({ error: 'Pose title is required.' });
    }

    console.log(`[Workflow] Starting pose reference workflow for pose: "${pose.title}"`);
    const run = await start(generatePoseReferenceWorkflow, [{
      event,
      pose,
      overallConcept,
      prompt,
      environment,
    }]);

    return res.json({
      success: true,
      jobId: run.runId,
      status: 'queued',
    });
  } catch (error: any) {
    console.error('Workflow Start Error:', error);
    const safeMessage = sanitizeError(error?.message || String(error));
    return res.status(500).json({ error: safeMessage });
  }
});

// Status check endpoint for workflow job
app.get(['/api/pose-reference-status/:jobId', '/pose-reference-status/:jobId'], async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const run = await getRun(jobId);
    if (!run) {
      return res.status(404).json({ error: 'Workflow run not found' });
    }

    const status = await run.status;
    let result = null;
    let error = null;

    if (status === 'completed') {
      result = await run.returnValue;
    } else if (status === 'failed') {
      error = sanitizeError((run as any).error?.message || 'Workflow execution failed');
    }

    return res.json({
      jobId: run.runId,
      status,
      result,
      image: (result as any)?.imageUrl || null,
      metadata: {
        model: (result as any)?.model || 'gpt-image-2',
        size: (result as any)?.size || '1024x1024',
      },
      error,
    });
  } catch (err: any) {
    console.error('Workflow Status Error:', err);
    return res.status(500).json({ error: sanitizeError(err?.message || String(err)) });
  }
});

// Legacy synchronous generate-reference endpoint (calls OpenAI directly if requested)
app.post(['/api/generate-reference', '/generate-reference'], async (req, res) => {
  try {
    const { prompt, negativePrompt, count = 1, size = '1024x1024', style = 'natural' } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const client = getOpenAIClient();
    const response = await client.images.generate({
      model: 'gpt-image-2',
      prompt: prompt,
      n: count,
      size: size,
      response_format: 'b64_json',
    });

    const images = response.data.map(item => `data:image/jpeg;base64,${item.b64_json}`);
    res.json({ images });
  } catch (error: any) {
    console.error('OpenAI Reference Generation Error:', error);
    res.status(500).json({ error: sanitizeError(error?.message || 'Failed to generate reference image.') });
  }
});

// Creative Guide Generation (Structured JSON with OpenAI GPT-4o)
app.post(['/api/generate-creative-guide', '/generate-creative-guide'], async (req, res) => {
  try {
    const {
      clientBrief,
      environmentNotes,
      creativePreferences,
      lightingConditions,
      specialConsiderations,
      vibe,
      category,
    } = req.body;

    const client = getOpenAIClient();

    const systemPrompt = `You are an elite creative director and photography producer. Generate an exhaustive, professional shoot guide in strictly valid JSON format.
Return ONLY valid JSON matching this schema:
{
  "title": string,
  "concept": string,
  "colorPalette": [{ "name": string, "hex": string, "usage": string }],
  "lightingRecommendations": [string],
  "locationSuggestions": [string],
  "stylingRecommendations": [string],
  "poses": [{
    "id": string,
    "title": string,
    "category": string,
    "description": string,
    "cues": [string],
    "framing": string,
    "cameraAngle": string,
    "mood": string
  }],
  "productionNotes": [string]
}`;

    const userPrompt = `Client Brief: ${clientBrief || 'N/A'}
Vibe / Aesthetics: ${vibe || 'N/A'}
Category: ${category || 'Portrait'}
Environment Notes: ${environmentNotes || 'N/A'}
Creative Preferences: ${creativePreferences || 'N/A'}
Lighting: ${lightingConditions || 'N/A'}
Special Considerations: ${specialConsiderations || 'N/A'}

Generate a cohesive, complete shoot creative guide with 8-12 diverse, well-described poses.`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content returned from OpenAI.');
    }

    const parsedGuide = JSON.parse(content);
    res.json({ success: true, guide: parsedGuide });
  } catch (error: any) {
    console.error('Creative Guide Generation Error:', error);
    res.status(500).json({ error: sanitizeError(error?.message || 'Failed to generate creative guide.') });
  }
});

// Legacy Generate Guide Endpoint
app.post(['/api/generate-guide', '/generate-guide'], async (req, res) => {
  try {
    const {
      eventName,
      eventType,
      location,
      style,
      timeOfDay,
      description,
      outfitContext,
      brief,
      vibe,
      category,
    } = req.body;

    const resolvedEventName = eventName || brief || '';
    const resolvedEventType = eventType || category || '';
    const resolvedStyle = style || vibe || '';
    const resolvedLocation = location || '';
    const resolvedTimeOfDay = timeOfDay || '';
    const resolvedDescription = description || '';

    const client = getOpenAIClient();

    const systemPrompt = `You are an elite creative director and professional wedding/event photographer.
Generate a comprehensive, practical 8-12 pose shoot guide and color recipe for the photo shoot as valid JSON.
The JSON must strictly have the following top-level structure:
{
  "overallConcept": "Detailed overall concept, lighting, and mood description for the shoot",
  "poses": [
    {
      "id": "pose-01",
      "order": 1,
      "title": "Pose Title",
      "category": "e.g. Interaction, Movement, Environmental, Intimate, Editorial",
      "shootingIntent": "Clear technical and compositional intent for the photographer",
      "clientDirection": "Exact verbal coaching prompts to give to the client",
      "photographerConcept": "Framing, lens choice, depth of field, and lighting guidance",
      "mood": "Specific emotional tone"
    }
  ],
  "colorStyle": {
    "name": "Preset / Color Grade Name",
    "overallLook": "Detailed visual description of color palette and aesthetic",
    "skinTone": "Skin tone treatment and preservation guidance",
    "highlights": "Highlight tones and roll-off",
    "shadows": "Shadow depth, tint, and lift",
    "whites": "White point character",
    "blacks": "Black level and fade",
    "contrast": "Contrast curve behavior",
    "temperature": "White balance / color temperature direction",
    "saturation": "Overall and selective saturation balance",
    "colorDirection": "Color shifts and split toning notes",
    "filmCharacter": "Grain, texture, or film simulation qualities",
    "editingNotes": "Practical Lightroom / camera raw adjustment guidance"
  }
}
Generate between 8 and 12 distinct, practical poses suitable for professional wedding and portrait photographers. Return JSON only.`;

    const userPrompt = `Event:
${resolvedEventName}

Event Type:
${resolvedEventType}

Location:
${resolvedLocation}

Style:
${resolvedStyle}

Time of Day:
${resolvedTimeOfDay}

Description:
${resolvedDescription}

Outfit Context:
${JSON.stringify(outfitContext || {})}

Create an 8-12 pose professional photo shoot guide and color style based on these inputs.`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');

    if (!parsed || !Array.isArray(parsed.poses) || parsed.poses.length === 0) {
      throw new Error('OpenAI returned an empty or malformed posing sequence. Please retry.');
    }

    res.json({
      success: true,
      overallConcept: parsed.overallConcept || '',
      poses: parsed.poses,
      colorStyle: parsed.colorStyle || {},
      data: parsed,
    });
  } catch (error: any) {
    console.error('Generate Guide Error:', error);
    res.status(500).json({ error: sanitizeError(error?.message || 'Failed to generate guide.') });
  }
});

function normalizeImageDataUrl(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'indexeddb') return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // If it's a data URL, we trust it and let OpenAI handle any MIME mismatch,
  // except we will gracefully fallback to detecting the signature if OpenAI complains.
  // Actually, we must fix the MIME type if the AI generator gave us a wrong one.
  let isDataUrl = false;
  let originalMime = '';
  let base64Payload = trimmed;

  if (trimmed.startsWith('data:')) {
    isDataUrl = true;
    const base64Index = trimmed.indexOf(';base64,');
    if (base64Index !== -1) {
      originalMime = trimmed.slice(5, base64Index);
      base64Payload = trimmed.slice(base64Index + 8);
    } else {
      const commaIndex = trimmed.indexOf(',');
      if (commaIndex !== -1) {
        originalMime = trimmed.slice(5, commaIndex);
        base64Payload = trimmed.slice(commaIndex + 1);
      }
    }
  }

  // Strip whitespaces securely
  base64Payload = base64Payload.replace(/[\s\r\n\t]/g, '');

  if (base64Payload.startsWith('/9j')) {
    return `data:image/jpeg;base64,${base64Payload}`;
  }
  if (base64Payload.startsWith('iVBOR')) {
    return `data:image/png;base64,${base64Payload}`;
  }
  if (base64Payload.startsWith('UklGR')) {
    return `data:image/webp;base64,${base64Payload}`;
  }

  // If it is a data URL but we couldn't detect the magic bytes,
  // just return it as is and let OpenAI validate it.
  if (isDataUrl) {
    return trimmed; 
  }

  return null;
}

const COLOR_RECIPE_JSON_SCHEMA = `{
  "presetName": "string (e.g. ZAP - Golden Hour Cinematic)",
  "description": "string (Brief description of the color profile and tonal intent)",
  "whiteBalance": {
    "mode": "Custom",
    "temperature": 5600,
    "tint": 6
  },
  "basic": {
    "exposure": 0.1,
    "contrast": 10,
    "highlights": -15,
    "shadows": 20,
    "whites": -5,
    "blacks": 8,
    "texture": 5,
    "clarity": 3,
    "dehaze": 2,
    "vibrance": 12,
    "saturation": -3
  },
  "toneCurve": {
    "rgb": [{"x": 0, "y": 10}, {"x": 64, "y": 60}, {"x": 192, "y": 196}, {"x": 255, "y": 250}],
    "red": [{"x": 0, "y": 0}, {"x": 255, "y": 255}],
    "green": [{"x": 0, "y": 0}, {"x": 255, "y": 255}],
    "blue": [{"x": 0, "y": 0}, {"x": 255, "y": 255}]
  },
  "colorMixer": {
    "red": { "hue": 2, "saturation": -4, "luminance": 4 },
    "orange": { "hue": 3, "saturation": -2, "luminance": 6 },
    "yellow": { "hue": -6, "saturation": -10, "luminance": 4 },
    "green": { "hue": 12, "saturation": -22, "luminance": -8 },
    "aqua": { "hue": 4, "saturation": -12, "luminance": -3 },
    "blue": { "hue": -5, "saturation": -16, "luminance": -5 },
    "purple": { "hue": 0, "saturation": -15, "luminance": 0 },
    "magenta": { "hue": 0, "saturation": -15, "luminance": 0 }
  },
  "colorGrading": {
    "shadows": { "hue": 215, "saturation": 10, "luminance": -2 },
    "midtones": { "hue": 42, "saturation": 8, "luminance": 2 },
    "highlights": { "hue": 36, "saturation": 12, "luminance": 0 },
    "blending": 50,
    "balance": 0
  },
  "detail": {
    "grainAmount": 15,
    "grainSize": 25,
    "grainRoughness": 40
  },
  "effects": {
    "vignette": -5
  }
}`;

// Analyze Color Preset with GPT-4o (Vision or Event Narrative)
app.post(['/api/analyze-color-preset', '/analyze-color-preset'], async (req, res) => {
  try {
    console.log('[ColorPreset Trace] Route hit. Body keys:', Object.keys(req.body));
    const rawImage =
      req.body.image ??
      req.body.imageBase64 ??
      req.body.imageDataUrl ??
      req.body.imageUrl;

    console.log('[ColorPreset Trace] rawImage length:', rawImage ? rawImage.length : 0);
    const normalizedImageUrl = normalizeImageDataUrl(rawImage);
    console.log('[ColorPreset Trace] normalized:', !!normalizedImageUrl);
    if (rawImage && rawImage !== 'indexeddb' && !normalizedImageUrl) {
      return res.status(400).json({ error: 'The provided image is in an unsupported format or could not be recognized. Supported formats: JPEG, PNG, WEBP.' });
    }

    const { event, colorStyle, sourceInfo } = req.body;

    const client = getOpenAIClient();

    let response;

    if (normalizedImageUrl) {
      // Vision Multimodal Analysis
      const visionPrompt = `You are a master colorist and photographer developing a professional Adobe Lightroom develop preset (.XMP) based on this visual reference image.
Event Context:
- Name: ${event?.name || 'Editorial Shoot'}
- Type: ${event?.type || 'Portrait Shoot'}
- Location: ${event?.location || 'Scenic'}
- Style: ${event?.style || colorStyle?.name || 'Cinematic'}
- Time of Day: ${event?.timeOfDay || 'Daylight'}

Analyze the visual reference photo and formulate a complete, production-grade ColorRecipe for Lightroom:
1. White Balance: Choose realistic Kelvin temperature (2000K to 12000K, typical daylight 5200K-5800K, tungsten 3000K-3400K, golden hour 5800K-6500K) and tint (-150 to +150).
2. Basic Tonal & Exposure: Balanced exposure offset (-2.0 to +2.0), contrast (-50 to +50), highlight roll-off, shadow lift, blacks, texture, clarity, dehaze, vibrance, saturation.
3. HSL Color Mixer: Protect natural orange skin tones with gentle adjustments. Fine-tune foliage greens, sky/water blues, and ambient warm yellows.
4. Color Grading (3-Way Split Toning): Harmonious cinematic color wheel hues (0-360) and saturations (0-100) for shadows, midtones, and highlights.
5. Film Character Detail: Subtle organic grain and vignette.

Return ONLY a valid JSON object strictly matching this schema:
${COLOR_RECIPE_JSON_SCHEMA}`;

      response = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: visionPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: normalizedImageUrl,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1600,
      });
    } else {
      // Event Narrative / Metadata Analysis (no reference image provided)
      const eventPrompt = `You are a master colorist and photographer developing a professional Adobe Lightroom develop preset (.XMP) tailored for this photography event:
Event Name: ${event?.name || 'Editorial Shoot'}
Event Type: ${event?.type || 'Portrait Shoot'}
Location: ${event?.location || 'Scenic'}
Style / Look: ${event?.style || colorStyle?.name || 'Cinematic'}
Time of Day / Lighting: ${event?.timeOfDay || 'Natural Golden Hour'}
Overall Look: ${event?.description || colorStyle?.overallLook || 'Cinematic, rich tones with authentic skin textures'}
Film Character: ${colorStyle?.filmCharacter || 'Subtle film grain with soft highlight compression'}
Editing Notes: ${colorStyle?.editingNotes || 'Preserve radiant skin tones with clean shadow roll-off'}

Formulate a complete, production-grade ColorRecipe for Lightroom:
1. White Balance: Choose realistic Kelvin temperature (2000K to 12000K) and tint (-150 to +150) suited to the event lighting and mood.
2. Basic Tonal & Exposure: Balanced exposure offset, contrast, highlight roll-off, shadow lift, blacks, texture, clarity, dehaze, vibrance, saturation.
3. HSL Color Mixer: Protected radiant orange skin tones, refined foliage greens and sky blues.
4. Color Grading (3-Way Split Toning): Harmonious cinematic color wheel hues and saturations for shadows, midtones, highlights.
5. Film Character Detail: Organic grain and subtle vignette.

Return ONLY a valid JSON object strictly matching this schema:
${COLOR_RECIPE_JSON_SCHEMA}`;

      response = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: eventPrompt }],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1600,
      });
    }

    const rawContent = response.choices[0]?.message?.content || '{}';
    let parsedRecipe: any;
    try {
      parsedRecipe = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error('Failed to parse OpenAI ColorRecipe JSON:', rawContent);
      return res.status(500).json({ error: 'Invalid ColorRecipe JSON returned by OpenAI' });
    }

    if (!parsedRecipe || typeof parsedRecipe !== 'object') {
      return res.status(500).json({ error: 'Invalid ColorRecipe returned by OpenAI' });
    }

    // Attach metadata and sourceInfo
    parsedRecipe.sourceInfo = sourceInfo || (normalizedImageUrl ? {
      type: 'approved_reference',
      title: event?.name ? `${event.name} Reference` : 'Visual Reference',
    } : {
      type: 'event_style',
      title: event?.name ? `${event.name} Aesthetic` : 'Event Aesthetic',
    });
    parsedRecipe.generatedAt = new Date().toISOString();

    return res.json({
      success: true,
      recipe: parsedRecipe,
    });
  } catch (error: any) {
    console.error('Analyze Color Preset Error:', error);
    return res.status(500).json({ error: sanitizeError(error?.message || 'Failed to analyze color preset.') });
  }
});

export { app };
export default app;
