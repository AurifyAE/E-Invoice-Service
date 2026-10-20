import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(6060),
    TYPE_INBOUND: z.literal('INBOUND').default('INBOUND'),
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
    // PINT AE fields whose Aigentrix field names are not yet confirmed (transaction-type
    // bitmask, credit note reason, preceding invoices, VAT point date, item details,
    // fallback buyer endpoint). They are validated and stored either way; they reach
    // Aigentrix only when this is "true".
    AIGENTRIX_SEND_EXTENDED_FIELDS: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    // ERP_Backend signs a short-lived ES256 token for each signed-in ERP user; this is its
    // public key (PEM, "\n" escapes allowed). Without it, tokens are not checked at all.
    ERP_TOKEN_PUBLIC_KEY: z.string().trim().default('').transform((value) => value.replace(/\\n/g, '\n')),
    // Rollout switch. While "false", a request with no token still goes through on the
    // ids it carries (and is logged), and a seller TRN outside the token is only logged.
    // A token that is present but invalid or expired is refused either way.
    EINVOICE_AUTH_REQUIRED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
}).refine(
    (config) => !config.EINVOICE_AUTH_REQUIRED || config.ERP_TOKEN_PUBLIC_KEY.length > 0,
    { message: 'ERP_TOKEN_PUBLIC_KEY is required when EINVOICE_AUTH_REQUIRED is "true"', path: ['ERP_TOKEN_PUBLIC_KEY'] },
);

export const env = envSchema.parse(process.env);
