import express from 'express';
import helmet from 'helmet';
import routes from './routes/index.js';

const app = express();

app.use(helmet());
app.use(express.json());

app.use('/api/v1', routes);

export default app;
