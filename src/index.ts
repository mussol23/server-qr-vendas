import express from 'express';
import cors from 'cors';
import syncRouter from './routes/sync';
import adminEstablishmentsRouter from './routes/admin.establishments';
import userBootstrapRouter from './routes/user.bootstrap';
import userEstablishmentRouter from './routes/user.establishment';

const app = express();
const port = process.env.PORT || 8080;

// CORS configuration - CRITICAL: must come BEFORE routes
const corsOptions: cors.CorsOptions = {
  origin: [
    'http://localhost:3000',
    'https://localhost:3000',
    'http://localhost:5173',
    'https://localhost:5173',
    'capacitor://localhost',
    'ionic://localhost',
    // Add your deployed frontend domain here later
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'QR Vendas Server API' });
});

app.use('/sync', syncRouter);
app.use('/admin/establishments', adminEstablishmentsRouter);
app.use('/user/establishment', userEstablishmentRouter);
app.use('/user/bootstrap', userBootstrapRouter);

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
  console.log(`📡 CORS enabled for multiple origins`);
});
