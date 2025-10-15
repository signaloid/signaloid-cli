import dotenv from "dotenv";
import path from "path";

const env = process.env.NODE_ENV || "default";

const envPath = path.resolve(__dirname, `../../environments/.env.${env}`);
dotenv.config({ path: envPath });

export default {
	NODE_ENV: process.env.NODE_ENV,
	API_URL: process.env.API_URL,
	SIGNALOID_URL: process.env.SIGNALOID_URL,
};
