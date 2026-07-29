import dotenv from 'dotenv';
import connectDB from './config/db.js';
import { env } from './config/env.js';

dotenv.config();

import app from './app.js';

const PORT = env.PORT;

// Connect to database and start the server
const startServer = async () => {
    try {
        await connectDB();
        app.listen(PORT, () => {
            console.log(`Server running: http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start the server:', error);
        process.exit(1);
    }
};

startServer();