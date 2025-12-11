// Backend/app.js
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

import authRoutes from './routes/auth.routes.js';
import mindmapRoutes from './routes/mindmap.routes.js';
import nodeRoutes from './routes/node.routes.js';
import collabRoutes from './routes/collab.routes.js';

import { errorHandler } from './middlewares/error.middleware.js';

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/mindmaps', mindmapRoutes);
app.use('/api/nodes', nodeRoutes);
app.use('/api/collab', collabRoutes);

app.use(errorHandler);

export default app;
