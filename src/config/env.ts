import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(6060),
    CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required').default('http://localhost:5173'),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    AIGENTRIX_BASE_URL: z.string().min(1, 'AIGENTRIX_BASE_URL is required'),
    AIGENTRIX_INVOICE_TYPE_CODE: z.string().min(1, 'AIGENTRIX_INVOICE_TYPE_CODE is required'),
    AIGENTRIX_INVOICE_CREDITNOTE_CODE: z.string().min(1, 'AIGENTRIX_INVOICE_CREDITNOTE_CODE is required'),
    AIGENTRIX_INVOICE_STATUS: z.string().min(1, 'AIGENTRIX_INVOICE_STATUS is required'),
    AIGENTRIX_STATUS_TIMELINE_TYPE: z.string().min(1, 'AIGENTRIX_STATUS_TIMELINE_TYPE is required'),
    // ZATCA is an optional integration at service startup. Its configuration is
    // checked only when a ZATCA endpoint is used, so existing Aigentrix flows
    // remain deployable without the Java SDK installed.
    ZATCA_SDK_ROOT: z.string().min(1).optional(),
    ZATCA_FATOORA_HOME: z.string().min(1).optional(),
    ZATCA_SDK_CONFIG: z.string().min(1).optional(),
    ZATCA_FATOORA_EXECUTABLE: z.string().min(1).optional(),
    ZATCA_JAVA_HOME: z.string().min(1).optional(),
    ZATCA_TEMP_DIR: z.string().min(1).optional(),
    ZATCA_INITIAL_PIH: z.string().min(1).optional(),
    ZATCA_REGISTRATION_SCHEME: z.string().trim().min(1).optional(),
    ZATCA_SDK_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
});

export const env = envSchema.parse(process.env);
