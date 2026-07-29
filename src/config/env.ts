import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(6060),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
});

export const env = envSchema.parse(process.env);