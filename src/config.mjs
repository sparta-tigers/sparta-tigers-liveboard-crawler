import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

export function loadEnv() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const envPath = process.env.NODE_ENV === 'production'
        ? path.resolve(__dirname, '..', '.env.production')
        : path.resolve(__dirname, '..', '.env.local')

    dotenv.config({path: envPath})
}