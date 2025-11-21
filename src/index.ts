import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import syncRouter from './routes/sync';
import adminEstablishmentsRouter from './routes/admin.establishments';
import userBootstrapRouter from './routes/user.bootstrap';
import userEstablishmentRouter from './routes/user.establishment';
import employeesRouter from './routes/employees';

const app = express();
const port = process.env.PORT || 8080;

// CORS configuration - CRITICAL: must come BEFORE routes
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Lista de origens permitidas
    const allowedOrigins = [
      'http://localhost:3000',
      'https://localhost:3000',
      'http://localhost:5173',
      'https://localhost:5173',
      'https://localhost', // ⭐ Capacitor mobile
      'capacitor://localhost',
      'ionic://localhost',
    ];

    // Se a variável FRONTEND_URL estiver definida, adicionar à lista
    if (process.env.FRONTEND_URL) {
      allowedOrigins.push(process.env.FRONTEND_URL);
    }

    // Permitir requisições sem origin (mobile apps) ou de origens permitidas
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Log da origem bloqueada para debug
      console.log('⚠️ CORS: Origem não permitida:', origin);
      // IMPORTANTE: Aceitar mesmo assim para mobile funcionar
      // Em produção, você pode querer restringir isso
      callback(null, true);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight

// Aumentar limite de payload para suportar imagens em base64
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/', (req, res) => {
  res.json({ message: 'QR Vendas Server API' });
});

app.use('/sync', syncRouter);
app.use('/admin/establishments', adminEstablishmentsRouter);
app.use('/user/establishment', userEstablishmentRouter);
app.use('/user/bootstrap', userBootstrapRouter);
app.use('/employees', employeesRouter);

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
  console.log(`📡 CORS enabled for multiple origins`);
});
