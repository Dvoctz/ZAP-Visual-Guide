import type { Request, Response } from 'express';
import app from '../server';

// Set Vercel serverless execution timeout to 60s for OpenAI image generation
export const maxDuration = 60;

export default function handler(req: Request, res: Response) {
  return app(req, res);
}
