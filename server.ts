import app from './api/index.js'; // Use .js extension for ESM runtime resolution
import express from 'express';
import path from 'path';

// Setup Vite dev middleware or static serving and listen
async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Only start listening if executed directly (standalone/dev), not when imported as serverless handler
const isDirectRun = Boolean(
  process.argv[1] && 
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.cjs') || process.argv[1].endsWith('server.js'))
);

if (isDirectRun) {
  startServer();
}

export { app };
export default app;


