import mongoose from "mongoose";
import { env } from "../../config/env.js";

export interface HealthCheckResult {
    service: string;
    status: "UP";
    environment: string;
    timestamp: string;
    uptimeSeconds: number;
}

export interface ReadinessCheckResult {
    service: string;
    status: "READY" | "NOT_READY";
    timestamp: string;
    dependencies: {
        database: {
            status: "UP" | "DOWN";
            name: string | null;
        };
    };
}

class HealthService {
    getHealthStatus(): HealthCheckResult {
        return {
            service: "E-Invoice-Service",
            status: "UP",
            environment: env.NODE_ENV,
            timestamp: new Date().toISOString(),
            uptimeSeconds: Math.floor(process.uptime()),
        };
    }

    getReadinessStatus(): ReadinessCheckResult {
        const isDatabaseConnected = mongoose.connection.readyState === 1;

        return {
            service: "E-Invoice-Service",
            status: isDatabaseConnected ? "READY" : "NOT_READY",
            timestamp: new Date().toISOString(),
            dependencies: {
                database: {
                    status: isDatabaseConnected ? "UP" : "DOWN",
                    name: mongoose.connection.name || null,
                },
            },
        };
    }
}

export const healthService = new HealthService();
