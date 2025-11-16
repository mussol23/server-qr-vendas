import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authMiddleware } from './middleware/auth';
import syncRouter from './routes/sync';
import adminEstablishments from './routes/admin.establishments';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_, res) => res.json({ ok: true }));

app.use(authMiddleware);
app.use('/sync', syncRouter);
app.use('/admin', adminEstablishments);

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`API listening on :${port}`));
