import dotenv from 'dotenv';

// Load .env configuration
dotenv.config();

const rawJwtSecret = process.env.JWT_SECRET;
const weakSecrets = ['default-secret', 'secret', 'changeme'];

if (
  !rawJwtSecret ||
  rawJwtSecret.length < 32 ||
  weakSecrets.includes(rawJwtSecret.toLowerCase())
) {
  console.error(
    'FATAL: JWT_SECRET environment variable is missing, too short (< 32 characters), or using an insecure default value. Server cannot start safely.'
  );
  process.exit(1);
}

export const JWT_SECRET: string = rawJwtSecret;
export const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';
export const PORT: number = parseInt(process.env.PORT || '5000', 10);
export const NODE_ENV: string = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION: boolean = NODE_ENV === 'production';
export const CLIENT_URL: string = process.env.CLIENT_URL || 'http://localhost:5173';
export const UPLOAD_DIR: string = process.env.UPLOAD_DIR || './uploads';
export const MAX_FILE_SIZE: number = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10);
export const TRUST_PROXY: string | undefined = process.env.TRUST_PROXY;
