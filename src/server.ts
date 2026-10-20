import connectDB from './config/db.js';
import { env } from './config/env.js';
import app from './app.js';
import { isErpTokenAuthConfigured, loadErpTokenKey } from './middleware/erp-auth.js';

const PORT = env.PORT;

// Connect to database and start the server
const startServer = async () => {
    try {
        await connectDB();
        // Parsed up front so a malformed ERP_TOKEN_PUBLIC_KEY stops startup instead of every request.
        await loadErpTokenKey();
        app.listen(PORT, () => {
            console.log(`Server running: http://localhost:${PORT}`);
            console.log(`E-Invoice auth: ${!isErpTokenAuthConfigured()
                ? 'tokens not checked (ERP_TOKEN_PUBLIC_KEY not set)'
                : env.EINVOICE_AUTH_REQUIRED ? 'ERP token required' : 'ERP token checked when sent (rollout mode)'}`);
        });
    } catch (error) {
        console.error('Failed to start the server:', error);
        process.exit(1);
    }
};

startServer();
