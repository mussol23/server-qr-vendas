import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authMiddleware } from './middleware/auth';
import syncRouter from './routes/sync';
import adminEstablishments from './routes/admin.establishments';
import userBootstrap from './routes/user.bootstrap';
import userEstablishment from './routes/user.establishment';

const app = express();

const corsOptions: cors.CorsOptions = {
  origin: [
    'http://localhost:3000',
    'https://localhost:3000',
    'capacitor://localhost',
    'ionic://localhost',
    // adicione aqui o domínio final do front quando tiver
  ],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_, res) => res.json({ ok: true }));

app.use(authMiddleware);
app.use('/sync', syncRouter);
app.use('/admin', adminEstablishments);
app.use('/user', userEstablishment);
app.use('/user', userBootstrap);
app.use('/user', userEstablishment);
app.use('/user', userBootstrap);

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`API listening on :${port}`));
