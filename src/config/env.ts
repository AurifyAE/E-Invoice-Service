import dotenv from 'dotenv';
dotenv.config();

export const env = {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    PORT: Number(process.env.PORT) ?? 6060,
    MONGODB_URI: process.env.MONGODB_URI!,
} as const;