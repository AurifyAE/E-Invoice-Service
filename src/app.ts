import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requestLogger } from './middleware/request-logger.js';
import routes from './routes/index.js';

const app = express();
const corsOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim().replace(/\/$/, ''));

app.disable('x-powered-by');
app.use(helmet({
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    crossOriginResourcePolicy: {
        policy: 'cross-origin',
    },
    referrerPolicy: {
        policy: 'no-referrer',
    },
}));
app.use(cors({
    origin: corsOrigins,
}));
app.use(requestLogger);
app.use(express.json());

app.use('/api/v1', routes);

export default app;
