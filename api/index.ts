import express from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';

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

// Generate reference image for a single pose using OpenAI gpt-image-2
app.post(['/api/generate-openai-pose-reference', '/generate-openai-pose-reference'], async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim().length === 0) {
      return res.status(400).json({
        error: 'OpenAI is not connected. Configure OPENAI_API_KEY in the server environment.',
      });
    }

    const { event, pose, overallConcept, prompt: customPrompt, environment } = req.body;

    if (!pose || !pose.title) {
      return res.status(400).json({ error: 'Pose title is required.' });
    }

    const eventName = event?.name || 'Destination Indian Wedding';
    const eventType = event?.type === 'Custom' ? (event?.customType || 'Couple Shoot') : (event?.type || 'Couple Shoot');
    const location = event?.location || 'Stone Town, Zanzibar';
    const style = event?.style || 'Cinematic, Romantic, Editorial';
    const timeOfDay = event?.timeOfDay || 'Golden Hour';

    // Use prompt provided by ReferencePromptBuilder or fallback
    let promptToUse = (customPrompt && typeof customPrompt === 'string' && customPrompt.trim().length > 0)
      ? customPrompt.trim()
      : `A professional destination wedding photography reference image created as an exact posing and visual guide.
Pose: "${pose.title}"
Direction: "${pose.clientDirection || ''}"
Concept: "${pose.photographerConcept || ''}"
Mood: "${pose.mood || style}"
Event: ${eventName} (${eventType}) at ${location} in ${timeOfDay} light.
Indian wedding attire with natural fabric drape.
High-end editorial photograph shot on 35mm/85mm prime lens with natural depth of field and authentic skin textures. No text, logos, or watermarks.`;

    console.log(`[OpenAI Image] Generating reference image for pose: "${pose.title}" with gpt-image-2${environment ? ` [Environment: ${environment.name}]` : ''}`);

    const openai = getOpenAIClient();

    let response: any;
    try {
      response = await openai.images.generate({
        model: 'gpt-image-2',
        prompt: promptToUse,
        n: 1,
        size: '1024x1536' as any,
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn(`[OpenAI Image] First call attempt with 1024x1536 failed:`, msg);
      if (msg.includes('size') || msg.includes('dimension') || msg.includes('supported values')) {
        // Retry with 1024x1024 if size was rejected
        response = await openai.images.generate({
          model: 'gpt-image-2',
          prompt: promptToUse,
          n: 1,
          size: '1024x1024' as any,
        });
      } else {
        throw err;
      }
    }

    let imageDataUrl: string | null = null;
    const item = response?.data?.[0];
    if (item?.b64_json) {
      imageDataUrl = `data:image/png;base64,${item.b64_json}`;
    } else if (item?.url) {
      // Fetch image URL and convert to base64 data URL for durable offline client storage in IndexedDB
      const imgFetch = await fetch(item.url);
      const arrayBuf = await imgFetch.arrayBuffer();
      const b64 = Buffer.from(arrayBuf).toString('base64');
      const cType = imgFetch.headers.get('content-type') || 'image/png';
      imageDataUrl = `data:${cType};base64,${b64}`;
    }

    if (!imageDataUrl) {
      throw new Error('OpenAI did not return image data for this pose.');
    }

    res.json({
      success: true,
      referenceImage: {
        type: 'ai',
        provider: 'openai',
        model: 'gpt-image-2',
        url: imageDataUrl,
        generatedAt: new Date().toISOString(),
        promptUsed: promptToUse,
        environmentId: environment?.id,
        environmentName: environment?.name,
      },
    });
  } catch (error: any) {
    console.error('OpenAI Pose Reference Image Generation Error:', error);
    let errorMsg = error?.message || String(error);
    const status = error?.status || error?.statusCode;

    if (status === 401 || errorMsg.includes('Incorrect API key') || errorMsg.includes('invalid_api_key')) {
      errorMsg = 'OpenAI is connected incorrectly. Check the OPENAI_API_KEY configuration.';
    } else if (status === 429 || errorMsg.includes('insufficient_quota') || errorMsg.includes('billing') || errorMsg.includes('credits')) {
      errorMsg = 'OPENAI API BILLING / CREDIT ERROR: API billing or quota unavailable for this request.';
    } else if (errorMsg.includes('content_policy_violation') || errorMsg.includes('safety system')) {
      errorMsg = 'OPENAI IMAGE GENERATION FAILED: Content policy filter triggered.';
    } else if (!errorMsg.startsWith('OPENAI') && !errorMsg.startsWith('OpenAI')) {
      errorMsg = `OPENAI IMAGE GENERATION FAILED: ${errorMsg}`;
    }

    const safeMessage = sanitizeError(errorMsg);
    res.status(500).json({ error: safeMessage });
  }
});

// Master Shoot Guide Generation API using OpenAI Structured Outputs
app.post(['/api/generate-guide', '/api/generate-creative-guide', '/generate-guide', '/generate-creative-guide'], async (req, res) => {
  const hasKey = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0);
  console.log(`[Diagnostic] POST /api/generate-creative-guide: Request received`);
  console.log(`[Diagnostic] Route reached: ${req.originalUrl || req.url}`);
  console.log(`[Diagnostic] OPENAI_API_KEY_PRESENT = ${hasKey}`);

  try {
    if (!hasKey) {
      console.warn('[Diagnostic] Aborting: OPENAI_API_KEY is not configured in server environment.');
      return res.status(400).json({
        error: 'OpenAI is not connected. Configure OPENAI_API_KEY in the server environment.',
      });
    }

    const { eventName, eventType, location, style, timeOfDay, description } = req.body;

    if (!eventName || !location) {
      console.warn('[Diagnostic] Aborting: Missing eventName or location in request body.');
      return res.status(400).json({ error: 'Event name and location are required.' });
    }

    // Determine recommended pose count guidelines based on event type
    const typeLower = (eventType || '').toLowerCase();
    let poseCountGuide = '15–20 strong poses';
    if (typeLower.includes('bridal')) {
      poseCountGuide = '10–15 focused, elegant bridal poses';
    } else if (typeLower.includes('groom')) {
      poseCountGuide = '8–12 strong, refined groom poses';
    } else if (typeLower.includes('getting ready')) {
      poseCountGuide = '10–15 narrative detail and getting-ready poses';
    } else if (typeLower.includes('haldi')) {
      poseCountGuide = '15–22 dynamic, joyous, ritual and portrait poses';
    } else if (typeLower.includes('mehndi')) {
      poseCountGuide = '15–22 intricate, relaxed, and celebratory poses';
    } else if (typeLower.includes('wedding')) {
      poseCountGuide = '20–28 key ceremonial, emotional, portrait, and ritual moments';
    } else if (typeLower.includes('reception')) {
      poseCountGuide = '15–22 glamorous, editorial, romantic, and party poses';
    } else if (typeLower.includes('pre-wedding') || typeLower.includes('couple')) {
      poseCountGuide = '15–20 diverse, non-repetitive narrative poses';
    } else {
      poseCountGuide = '10–16 carefully curated poses tailored to the scale of the session';
    }

    const prompt = `You are an acclaimed luxury Indian wedding photographer and creative director known for timeless, editorial, and deeply emotional imagery.
Create a master visual shooting guide and matching color grading style for this specific assignment.

=== EVENT INFORMATION ===
- Event Title: ${eventName}
- Event Type: ${eventType || 'Couple Shoot'}
- Location & Environment: ${location}
- Style & Mood: ${style || 'Cinematic, Romantic, Editorial'}
- Time of Day & Lighting: ${timeOfDay || 'Golden Hour'}
- Creative Description / Notes: ${description || 'Atmospheric portraits and natural connection.'}

=== 1. CREATIVE THINKING & PHOTOGRAPHIC INTELLIGENCE ===
Before generating the poses, analyze:
* The Environment: What makes this exact location (${location}) visually distinct? Incorporate its specific architectural elements (e.g. carved stone doors, narrow historic alleys, arches, textured walls, staircases, balconies, water reflections, horizon lines, vegetation, light pockets).
* The Light: How does the light at "${timeOfDay}" interact with the scene? (Rim lighting, soft bounced fill, architectural shadows, golden flare, window light, dramatic split-light).
* Emotional Flow: Start with comfortable, low-pressure natural moments, build trust and fluid movement, capture intimate connections, push into high-fashion editorial compositions, and culminate in unforgettable signature hero images.
* Non-Generic Posing: Avoid cliché repetitive "stand together and smile at camera" prompts. Every single pose must have an authentic reason for existing with clear composition and purpose.

=== 2. SEQUENCE ARC & POSE COUNT ===
Generate ${poseCountGuide}. Quality and intentionality come first; every pose must feel essential.
Build an authentic shooting arc:
1. [Warm Up]: Relaxed opening portraits, comfortable posture, getting acclimated to the space.
2. [Interaction / Connection]: Unprompted smiles, whispered words, looking away together, tactile touches (hands, shoulders, cheek).
3. [Walking / Movement]: Natural stride down pathways, leading each other, dynamic walking shots, turning gently.
4. [Environmental / Architecture]: Framing the couple through archways, doors, corridors, textured walls, depth of field across the location.
5. [Intimate Portraits]: Micro-connections, foreheads touching, eyes closed in golden light, soft cheek touches, breathing together.
6. [Editorial Compositions]: Negative space, bold geometry, asymmetric framing, striking eye contact, magazine-worthy staging.
7. [Creative Movement]: Garment flow (veil, dupatta, train, skirt), wind interaction, gentle spins, dramatic backlight flares.
8. [Hero Photographs]: The showstopping signature frames of the shoot that define the entire collection.

=== 3. PER-POSE GUIDELINES ===
For EACH pose, provide:
- "id": A unique string ID formatted as "pose-01", "pose-02", etc.
- "order": A 1-based integer order number (1, 2, 3, ...).
- "title": A concise, evocative name (e.g. "Omani Door Whispers", "The Coral Alley Stroll", "Rooftop Amber Veil", "Symmetrical Archway Embrace").
- "category": Choose the most fitting category: "Warm Up", "Interaction", "Walking", "Environmental", "Intimate", "Editorial", "Movement", "Creative", or "Hero".
- "shootingIntent": A brief 1-sentence note for the photographer explaining the exact objective (e.g. "Establish depth using leading alley walls.", "Capture genuine laughter through playful whisper cue.", "Create the definitive wide hero landscape portrait.").
- "clientDirection": The EXACT words the photographer speaks to the couple. Keep it natural, human, conversational, and direct (e.g. "Walk slowly toward me, keep your shoulders close, and don't look at the camera. Just tell each other about your morning."). NEVER use technical photography jargon in clientDirection.
- "photographerConcept": Practical compositional & lighting guidance (framing, foreground elements, light angle, balance, perspective). Do not mechanically list aperture/ISO unless it has a critical creative purpose.
- "mood": 2-3 words capturing the emotional tone (e.g. "Intimate, Soulful", "Playful & Effortless", "Grand & Cinematic").

=== 4. MATCHING COLOR STYLE ===
Derive a dedicated color grading recipe crafted for this EXACT location and lighting condition. The color style MUST visually match the aesthetic world of the posing guide.
Define:
- name: Evocative preset/look name (e.g. "Stone Town Amber & Terracotta", "Zanzibar Golden Dune", "Royal Heritage Emerald & Ochre").
- overallLook: Detailed aesthetic description of the palette, contrast curve, and emotional atmosphere.
- skinTone: Exact treatment of Indian and diverse skin tones (e.g. "Luminous golden undertones with soft peach roll-off; highlights preserved with zero orange cast").
- highlights: Highlight tint and roll-off behavior.
- shadows: Shadow depth, tint, and lift level.
- whites & blacks: Exposure limits and matte/filmic quality.
- contrast: Contrast curve and mid-tone clarity.
- temperature & saturation: Kelvin shift and HSL saturation balance.
- colorDirection: Specific color harmony (e.g. split-toning, complementary warmth vs coolness).
- filmCharacter: Film emulation quality (grain texture, halation, bloom, roll-off).
- editingNotes: Concrete Lightroom/Capture One guidance for the post-processing team.`;

    const jsonSchema = {
      name: 'shoot_guide',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          overallConcept: { type: 'string' },
          poses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                order: { type: 'number' },
                title: { type: 'string' },
                category: { type: 'string' },
                shootingIntent: { type: 'string' },
                clientDirection: { type: 'string' },
                photographerConcept: { type: 'string' },
                mood: { type: 'string' },
              },
              required: [
                'id',
                'order',
                'title',
                'category',
                'shootingIntent',
                'clientDirection',
                'photographerConcept',
                'mood',
              ],
              additionalProperties: false,
            },
          },
          colorStyle: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              overallLook: { type: 'string' },
              skinTone: { type: 'string' },
              highlights: { type: 'string' },
              shadows: { type: 'string' },
              whites: { type: 'string' },
              blacks: { type: 'string' },
              contrast: { type: 'string' },
              temperature: { type: 'string' },
              saturation: { type: 'string' },
              colorDirection: { type: 'string' },
              filmCharacter: { type: 'string' },
              editingNotes: { type: 'string' },
            },
            required: [
              'name',
              'overallLook',
              'skinTone',
              'highlights',
              'shadows',
              'whites',
              'blacks',
              'contrast',
              'temperature',
              'saturation',
              'colorDirection',
              'filmCharacter',
              'editingNotes',
            ],
            additionalProperties: false,
          },
        },
        required: ['title', 'overallConcept', 'poses', 'colorStyle'],
        additionalProperties: false,
      },
    };

    const openai = getOpenAIClient();
    const candidateModels = ['gpt-4o', 'gpt-4o-mini'];
    let lastError: any = null;
    let rawText: string | undefined;

    console.log(`[Diagnostic] OpenAI request started`);

    for (const modelName of candidateModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          console.log(`[Diagnostic] Calling model: ${modelName} (attempt ${attempt + 1})`);
          const response = await openai.chat.completions.create({
            model: modelName,
            messages: [
              {
                role: 'system',
                content: 'You are an acclaimed luxury destination wedding photographer and creative director.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: jsonSchema as any,
            },
          });
          rawText = response.choices?.[0]?.message?.content || undefined;
          if (rawText) {
            console.log(`[Diagnostic] OpenAI request completed successfully with model: ${modelName}`);
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`[Diagnostic] Model ${modelName} attempt ${attempt + 1} error:`, err?.name, err?.status, sanitizeError(err?.message || ''));
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }
      if (rawText) break;
    }

    if (!rawText) {
      throw lastError || new Error('OpenAI returned an empty response.');
    }

    console.log(`[Diagnostic] OpenAI response parsing started`);
    const result = JSON.parse(rawText.trim());

    // Validate structured schema
    if (!result.poses || !Array.isArray(result.poses) || result.poses.length === 0 || !result.colorStyle) {
      throw new Error('OpenAI returned incomplete guide data.');
    }
    console.log(`[Diagnostic] OpenAI response parsing completed (poses: ${result.poses.length})`);

    res.json(result);
  } catch (error: any) {
    let errorMsg = error?.message || String(error);
    const status = error?.status || error?.statusCode || 500;
    const errorType = error?.name || typeof error;

    if (status === 401 || errorMsg.includes('Incorrect API key') || errorMsg.includes('invalid_api_key')) {
      errorMsg = 'OpenAI is connected incorrectly. Check the OPENAI_API_KEY configuration.';
    } else if (status === 429 || errorMsg.includes('insufficient_quota') || errorMsg.includes('billing') || errorMsg.includes('credits')) {
      errorMsg = 'OPENAI API BILLING / CREDIT ERROR: API billing or quota unavailable for this request.';
    } else if (!errorMsg.startsWith('OPENAI') && !errorMsg.startsWith('OpenAI')) {
      errorMsg = `OPENAI CREATIVE GENERATION FAILED: ${errorMsg}`;
    }

    const safeMessage = sanitizeError(errorMsg);
    console.error(`[Diagnostic] Error caught: type=${errorType}, status=${status}, message=${safeMessage}`);
    res.status(status === 400 ? 400 : 500).json({ error: safeMessage });
  }
});

// OpenAI Visual Color Analysis & Structured Lightroom Recipe Generator
app.post(['/api/analyze-color-preset', '/analyze-color-preset'], async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim().length === 0) {
      return res.status(400).json({
        error: 'OpenAI is not connected. Configure OPENAI_API_KEY in the server environment.',
      });
    }

    const { image, event, colorStyle, sourceInfo } = req.body;
    const eventName = event?.name || 'Wedding Shoot';
    const location = event?.location || 'Destination Location';
    const style = event?.style || 'Cinematic, Timeless, Editorial';
    const timeOfDay = event?.timeOfDay || 'Golden Hour';
    const eventType = event?.type === 'Custom' ? (event?.customType || 'Couple Shoot') : (event?.type || 'Couple Shoot');

    const isVisionAnalysis = image && typeof image === 'string' && (image.startsWith('data:image/') || image.startsWith('http'));

    if (sourceInfo?.type === 'approved_reference' && !isVisionAnalysis) {
      return res.status(400).json({
        error: 'REFERENCE IMAGE UNAVAILABLE: No valid reference image found for color analysis.',
      });
    }

    const systemPrompt = `You are analyzing a professional wedding photograph as a colorist.
Analyze the visual characteristics of the supplied reference image (or event aesthetic data).
Create a Lightroom color recipe intended to reproduce the reference's overall tonal and color character when applied to other photographs from the same shoot.

=== CORE ANALYSIS FOCUS ===
1. WHITE BALANCE:
   - Overall warmth/coolness and tint character.
   - Express whiteBalance.temperature strictly in photographic Kelvin units (range: 2500 to 8500 Kelvin; e.g. 5600 for daylight, 6000-6500 for warm golden hour, 4800-5200 for clean editorial).
   - Express whiteBalance.tint strictly in standard Lightroom tint values (range: -25 to +25, e.g. 0 for neutral, +3 to +6 for gentle magenta skin tone warmth, -3 to -6 for green neutralizing).
   - Set whiteBalance.mode to 'Custom'.

2. EXPOSURE & CONTRAST:
   - Overall brightness, micro-contrast, highlight roll-off, shadow density, and black point.
   - Highlights (-15 to -40) to preserve delicate embroidery, veil lace, and sky textures.
   - Shadows (+10 to +30) to lift and open darks smoothly.
   - Blacks (-5 to -20) for rich tonal anchors.

3. COLOR & HSL SEPARATION:
   - Overall saturation and vibrance.
   - Dominant color palette, green rendering (subdue bright fluorescent greens), blue rendering (deepen cyan/sky), yellow/orange rendering (rich warm accents).

4. SKIN TONE PRIORITY (HIGHEST COLOR PRIORITY):
   - Natural skin tones must be protected. Pay particular attention to rich melanin skin.
   - Strictly avoid: orange skin, red skin, yellow skin, magenta skin, gray skin, muddy skin, plastic skin, or over-saturated skin.

5. COLOR GRADING (3-WAY SPLIT TONING):
   - Highlight hue, midtone hue, shadow hue with gentle saturation (5-15% highlights, 4-12% shadows).

6. FILM CHARACTER & VIGNETTE:
   - Fine 35mm grain (amount: 10-25, size: 20-30, roughness: 40-50) and subtle vignette (-5 to -15) if present.

=== CRITICAL INSTRUCTIONS ===
- The color analysis must focus strictly on COLOR, TONALITY, LIGHT, CONTRAST, and FILM CHARACTER.
- Do NOT attempt to reproduce faces, people, clothing, objects, architecture, composition, pose, or background structure. The resulting preset must be universally reusable on other photographs from the assignment.
- Moderation of values: The goal is professional wedding color, NOT an extreme Instagram filter.

Return ONLY a strict JSON object adhering to the schema.`;

    const userTextPrompt = isVisionAnalysis
      ? `Analyze the supplied approved reference photograph for "${eventName}" (${eventType} at ${location} in ${timeOfDay} light).
Extract the color, tonality, contrast, and film characteristics to formulate a reusable professional Lightroom Develop preset recipe.`
      : `Formulate a professional Lightroom Develop color recipe for "${eventName}" (${eventType}):
Location: ${location}
Lighting / Time: ${timeOfDay}
Aesthetic Style: ${style}
${sourceInfo ? `Color Source: ${sourceInfo.title} (${sourceInfo.type})` : ''}
${colorStyle ? `Styling Notes: "${colorStyle.overallLook || ''}". Skin: "${colorStyle.skinTone || ''}". Direction: "${colorStyle.colorDirection || ''}".` : ''}`;

    const hslSchema = {
      type: 'object',
      properties: {
        hue: { type: 'number' },
        saturation: { type: 'number' },
        luminance: { type: 'number' },
      },
      required: ['hue', 'saturation', 'luminance'],
      additionalProperties: false,
    };

    const pointSchema = {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
      },
      required: ['x', 'y'],
      additionalProperties: false,
    };

    const colorRecipeJsonSchema = {
      name: 'color_recipe',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          presetName: { type: 'string' },
          description: { type: 'string' },
          whiteBalance: {
            type: 'object',
            properties: {
              mode: { type: 'string', enum: ['Custom', 'As Shot'] },
              temperature: { type: 'number' },
              tint: { type: 'number' },
            },
            required: ['mode', 'temperature', 'tint'],
            additionalProperties: false,
          },
          basic: {
            type: 'object',
            properties: {
              exposure: { type: 'number' },
              contrast: { type: 'number' },
              highlights: { type: 'number' },
              shadows: { type: 'number' },
              whites: { type: 'number' },
              blacks: { type: 'number' },
              texture: { type: 'number' },
              clarity: { type: 'number' },
              dehaze: { type: 'number' },
              vibrance: { type: 'number' },
              saturation: { type: 'number' },
            },
            required: [
              'exposure',
              'contrast',
              'highlights',
              'shadows',
              'whites',
              'blacks',
              'texture',
              'clarity',
              'dehaze',
              'vibrance',
              'saturation',
            ],
            additionalProperties: false,
          },
          toneCurve: {
            type: 'object',
            properties: {
              rgb: { type: 'array', items: pointSchema },
              red: { type: 'array', items: pointSchema },
              green: { type: 'array', items: pointSchema },
              blue: { type: 'array', items: pointSchema },
            },
            required: ['rgb', 'red', 'green', 'blue'],
            additionalProperties: false,
          },
          colorMixer: {
            type: 'object',
            properties: {
              red: hslSchema,
              orange: hslSchema,
              yellow: hslSchema,
              green: hslSchema,
              aqua: hslSchema,
              blue: hslSchema,
              purple: hslSchema,
              magenta: hslSchema,
            },
            required: ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'],
            additionalProperties: false,
          },
          colorGrading: {
            type: 'object',
            properties: {
              shadows: {
                type: 'object',
                properties: {
                  hue: { type: 'number' },
                  saturation: { type: 'number' },
                  luminance: { type: 'number' },
                },
                required: ['hue', 'saturation', 'luminance'],
                additionalProperties: false,
              },
              midtones: {
                type: 'object',
                properties: {
                  hue: { type: 'number' },
                  saturation: { type: 'number' },
                  luminance: { type: 'number' },
                },
                required: ['hue', 'saturation', 'luminance'],
                additionalProperties: false,
              },
              highlights: {
                type: 'object',
                properties: {
                  hue: { type: 'number' },
                  saturation: { type: 'number' },
                  luminance: { type: 'number' },
                },
                required: ['hue', 'saturation', 'luminance'],
                additionalProperties: false,
              },
              blending: { type: 'number' },
              balance: { type: 'number' },
            },
            required: ['shadows', 'midtones', 'highlights', 'blending', 'balance'],
            additionalProperties: false,
          },
          detail: {
            type: 'object',
            properties: {
              grainAmount: { type: 'number' },
              grainSize: { type: 'number' },
              grainRoughness: { type: 'number' },
            },
            required: ['grainAmount', 'grainSize', 'grainRoughness'],
            additionalProperties: false,
          },
          effects: {
            type: 'object',
            properties: {
              vignette: { type: 'number' },
            },
            required: ['vignette'],
            additionalProperties: false,
          },
        },
        required: [
          'presetName',
          'description',
          'whiteBalance',
          'basic',
          'toneCurve',
          'colorMixer',
          'colorGrading',
          'detail',
          'effects',
        ],
        additionalProperties: false,
      },
    };

    const openai = getOpenAIClient();
    let userMessageContent: any;

    if (image && typeof image === 'string' && (image.startsWith('data:image/') || image.startsWith('http'))) {
      console.log(`[OpenAI Color Analysis] Processing vision color analysis with image reference`);
      userMessageContent = [
        { type: 'text', text: userTextPrompt },
        {
          type: 'image_url',
          image_url: {
            url: image,
            detail: 'high',
          },
        },
      ];
    } else {
      console.log(`[OpenAI Color Analysis] Processing text-based color analysis for event: ${eventName}`);
      userMessageContent = userTextPrompt;
    }

    const candidateModels = ['gpt-4o', 'gpt-4o-mini'];
    let rawJsonText: string | undefined;
    let lastErr: any = null;

    for (const modelName of candidateModels) {
      try {
        console.log(`[OpenAI Color Analysis] Calling model: ${modelName}`);
        const response = await openai.chat.completions.create({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessageContent },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: colorRecipeJsonSchema as any,
          },
        });

        rawJsonText = response.choices?.[0]?.message?.content || undefined;
        if (rawJsonText) {
          console.log(`[OpenAI Color Analysis] Succeeded with model: ${modelName}`);
          break;
        }
      } catch (err: any) {
        lastErr = err;
        console.warn(`[OpenAI Color Analysis] Model ${modelName} failed:`, err?.message);
      }
    }

    if (!rawJsonText) {
      throw lastErr || new Error('OpenAI returned an empty response for color analysis.');
    }

    const recipe = JSON.parse(rawJsonText.trim());

    // Safe debug logging ONLY for white balance (no keys, no image data, no personal info)
    if (recipe && recipe.whiteBalance) {
      console.log(`[ColorPreset Server Debug] White Balance: temperature = ${recipe.whiteBalance.temperature}K, tint = ${recipe.whiteBalance.tint}, mode = ${recipe.whiteBalance.mode || 'Custom'}`);
    }

    res.json({
      success: true,
      recipe,
    });
  } catch (error: any) {
    console.error('OpenAI Color Analysis Error:', error);
    let errorMsg = error?.message || String(error);
    const status = error?.status || error?.statusCode;

    if (status === 401 || errorMsg.includes('Incorrect API key') || errorMsg.includes('invalid_api_key')) {
      errorMsg = 'OpenAI is connected incorrectly. Check the OPENAI_API_KEY configuration.';
    } else if (status === 429 || errorMsg.includes('insufficient_quota') || errorMsg.includes('billing') || errorMsg.includes('credits')) {
      errorMsg = 'OPENAI API CREDITS UNAVAILABLE: API billing or quota unavailable for this request.';
    } else if (!errorMsg.startsWith('OPENAI') && !errorMsg.startsWith('OpenAI')) {
      errorMsg = `COLOR ANALYSIS FAILED: ${errorMsg}`;
    }

    const safeMessage = sanitizeError(errorMsg);
    res.status(500).json({ error: safeMessage });
  }
});

export { app };
export default app;

// Set Vercel serverless execution timeout to 60s for OpenAI image generation
export const maxDuration = 60;

