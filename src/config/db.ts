import mongoose from "mongoose";
import dotenv from "dotenv";
import { env } from "./env.js";

dotenv.config();

const connectDB = async () => {
    const mongoURI = env.MONGODB_URI;

    if (!mongoURI)
        throw new Error("MONGODB_URI is not defined in the environment variables.");
    
    try {
        await mongoose.connect(mongoURI);
        console.log("MongoDB connected successfully");
    } catch (error: any) {
        console.error(`Error connecting to MongoDB: ${error.message}`);
        process.exit(1);
    }
}

export default connectDB;