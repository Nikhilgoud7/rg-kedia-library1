import { execSync } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const isDemoMode = process.env.DEMO_MODE === 'true';
const hasConfirmFlag = process.argv.includes('--confirm');
const hasForceSeed = process.env.FORCE_SEED === 'true';

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║        RG-Kedia LMS — Demo Reset CLI Utility         ║');
console.log('╚══════════════════════════════════════════════════════╝');

if (!isDemoMode) {
  console.error('\n❌ ERROR: demo:reset can only be executed when DEMO_MODE=true is set in the environment.');
  process.exit(1);
}

if (!hasConfirmFlag) {
  console.error('\n❌ ERROR: Confirmation flag --confirm is required to reset demo data.');
  console.error('Usage: npm run demo:reset -- --confirm');
  process.exit(1);
}

if (isProduction && !hasForceSeed) {
  console.error('\n❌ ERROR: demo:reset is blocked in production unless FORCE_SEED=true is explicitly set.');
  process.exit(1);
}

console.log('\n⏳ Resetting database to synthetic demo personas and clean catalog...');
try {
  execSync('npx tsx prisma/seed.ts', {
    stdio: 'inherit',
    env: { ...process.env },
  });
  console.log('\n✅ Demo database reset completed successfully.');
} catch (error: any) {
  console.error('\n❌ Failed to reset demo database:', error.message || error);
  process.exit(1);
}
