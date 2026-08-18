import app from '../server';

// Set Vercel serverless execution timeout to 60s for OpenAI image generation
export const maxDuration = 60;

export default app;
