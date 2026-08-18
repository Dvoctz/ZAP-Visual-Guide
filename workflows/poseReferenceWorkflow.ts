import { sleep, FatalError } from "workflow";
import OpenAI from "openai";

let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key || key.trim().length === 0) {
      throw new FatalError("OpenAI API key is not configured in server environment.");
    }
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

export async function generatePoseReferenceWorkflow(input: {
  event: any;
  pose: any;
  overallConcept?: string;
  prompt?: string;
  environment?: any;
}) {
  "use workflow";

  // Step 1: Prepare prompt and inputs
  const preparedData = await preparePosePromptStep(input);

  // Step 2: Call OpenAI GPT Image 2
  const imageResult = await callOpenAIImageStep(preparedData);

  return imageResult;
}

async function preparePosePromptStep(input: {
  event: any;
  pose: any;
  overallConcept?: string;
  prompt?: string;
  environment?: any;
}) {
  "use step";
  const { event, pose, overallConcept, prompt: customPrompt, environment } = input;
  
  if (customPrompt && typeof customPrompt === 'string' && customPrompt.trim().length > 0) {
    return { prompt: customPrompt.trim() };
  }

  const eventName = event?.name || 'Wedding / Couple Shoot';
  const eventType = event?.type || 'Portrait Shoot';
  const location = event?.location || 'Scenic Location';
  const outfitContext = event?.outfitContext;
  
  const poseTitle = pose?.title || 'Portrait Pose';
  const clientDir = pose?.clientDirection || '';
  const photoConcept = pose?.photographerConcept || '';
  
  const brideOutfit = outfitContext?.bride || 'Traditional high-end wedding attire with elegant drape';
  const groomOutfit = outfitContext?.groom || 'Coordinating formal wedding attire';

  let prompt = `Professional wedding & editorial photography reference image.
Event: ${eventName} (${eventType}) at ${location}.
Overall Concept: ${overallConcept || 'Timeless, romantic cinematic aesthetic'}.
Pose & Composition: ${poseTitle}. ${clientDir}. ${photoConcept}.
Subjects & Attire:
- Bride Outfit: ${brideOutfit}
- Groom Outfit: ${groomOutfit}
Environment & Lighting: ${environment?.name ? `${environment.name}: ${environment.description || ''}` : 'Natural cinematic golden hour lighting'}.
High-end editorial photograph shot on 35mm/85mm prime lens with natural depth of field and authentic skin textures. No text, logos, or watermarks.`;

  return { prompt };
}

async function callOpenAIImageStep(data: { prompt: string }) {
  "use step";
  const openai = getOpenAIClient();
  
  // Use 1024x1024 for stable generation under Vercel runtime bounds
  const response = await openai.images.generate({
    model: 'gpt-image-2',
    prompt: data.prompt,
    n: 1,
    size: '1024x1024',
  });

  const item = response?.data?.[0];
  if (!item?.b64_json) {
    throw new FatalError("OpenAI did not return image data for this pose reference.");
  }

  const imageUrl = `data:image/png;base64,${item.b64_json}`;
  return {
    imageUrl,
    model: 'gpt-image-2',
    size: '1024x1024',
  };
}
