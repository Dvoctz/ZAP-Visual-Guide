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
    const { brief, vibe, category } = req.body;
    const client = getOpenAIClient();

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an elite creative director. Generate a detailed photo shoot concept and pose list as JSON.' },
        { role: 'user', content: `Brief: ${brief}\nVibe: ${vibe}\nCategory: ${category}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
    res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Generate Guide Error:', error);
    res.status(500).json({ error: sanitizeError(error?.message || 'Failed to generate guide.') });
  }
});

// Analyze Color Preset with GPT-4o Vision
app.post(['/api/analyze-color-preset', '/analyze-color-preset'], async (req, res) => {
  try {
    const { imageBase64, eventTitle } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Image base64 data is required' });
    }

    const client = getOpenAIClient();

    const prompt = `Analyze this reference photograph to extract its cinematic color grading profile, exposure characteristics, tone curve, and HSL palette for professional photography grading.
Return JSON with this schema:
{
  "name": string,
  "description": string,
  "dominantTones": [string],
  "contrast": "low" | "medium" | "high",
  "saturation": "muted" | "natural" | "vibrant",
  "colorTemperature": "warm" | "neutral" | "cool",
  "keyCharacteristics": [string],
  "lightroomSuggestions": {
    "exposure": number,
    "contrast": number,
    "highlights": number,
    "shadows": number,
    "whites": number,
    "blacks": number,
    "temp": number,
    "tint": number,
    "vibrance": number,
    "saturation": number
  }
}`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1200,
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
    res.json({ success: true, analysis: parsed });
  } catch (error: any) {
    console.error('Analyze Color Preset Error:', error);
    res.status(500).json({ error: sanitizeError(error?.message || 'Failed to analyze color preset.') });
  }
});

export { app };
export default app;
