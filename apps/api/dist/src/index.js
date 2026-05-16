import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import ingestionRoute from './routes/ingestion.js';
const app = new Hono();
// CORS for frontend
app.use('/*', cors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
}));
app.get('/health', (c) => {
    return c.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
    });
});
// Mount ingestion route
app.route('', ingestionRoute);
const port = 4000;
console.log(`Inos API server is running on port ${port}`);
serve({
    fetch: app.fetch,
    port,
});
export default app;
//# sourceMappingURL=index.js.map