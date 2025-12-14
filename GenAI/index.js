import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import aiRoutes from './routes/ai.routes.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use('/ai', aiRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`AI Service running on http://localhost:${PORT}`));
