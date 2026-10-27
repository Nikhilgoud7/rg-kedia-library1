// scripts/bootstrapAdmin.ts — Non-Destructive Initial Librarian Bootstrap CLI
import dotenv from 'dotenv';
import {
  bootstrapInitialLibrarian,
  validateBootstrapConfig,
  BootstrapResult,
} from '../server/lib/bootstrap/bootstrapAdmin.js';

// Safe environment loading
dotenv.config();

export { bootstrapInitialLibrarian, validateBootstrapConfig };

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const hasConfirm = args.includes('--confirm');

  // Guard against insecure CLI arguments leaking secrets (SEC-9F-02 compliance)
  if (args.some((a) => a.startsWith('--password') || a.startsWith('--pass'))) {
    console.error('\n🛑 Security Violation: Passing passwords via command-line arguments is insecure.');
    console.error('Command-line arguments can be exposed in system process listings (ps / Task Manager).');
    console.error('Provide the password via the INITIAL_LIBRARIAN_PASSWORD environment variable instead:\n');
    console.error('  INITIAL_LIBRARIAN_EMAIL="librarian@rgkedia.edu.in" INITIAL_LIBRARIAN_PASSWORD="<YourSecurePassword>" npm run admin:bootstrap\n');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       RG-Kedia LMS — Initial Librarian Bootstrap CLI         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  if (isDryRun) {
    console.log('\n[INFO] Running in DRY-RUN mode. Zero database mutations will occur.');
  }

  const result: BootstrapResult = await bootstrapInitialLibrarian({
    dryRun: isDryRun,
    confirmProduction: hasConfirm,
  });

  switch (result.status) {
    case 'SUCCESS':
      if (result.dryRun) {
        console.log(`\n✅ ${result.message}`);
      } else {
        console.log(`\n✅ ${result.message}`);
        console.log('\nAccount Details:');
        console.log(`  Name:                ${result.user?.name}`);
        console.log(`  Email:               ${result.user?.email}`);
        console.log(`  Role:                ${result.user?.role}`);
        console.log(`  Active:              ${result.user?.active}`);
        console.log(`  mustChangePassword:  ${result.user?.mustChangePassword}`);
        console.log(`  Created At:          ${result.user?.createdAt.toISOString()}`);
        console.log('\nNext steps:');
        console.log('  1. Navigate to the library login page.');
        console.log('  2. Log in using INITIAL_LIBRARIAN_EMAIL and INITIAL_LIBRARIAN_PASSWORD.');
        console.log('  3. The application will prompt for an immediate password change.');
      }
      process.exit(0);

    case 'ALREADY_INITIALIZED':
      console.log(`\nℹ️  ${result.message}`);
      if (result.existingLibrarian?.email) {
        console.log(`  Existing Email:      ${result.existingLibrarian.email}`);
      }
      console.log('No action taken. The system is already initialized.');
      process.exit(0);

    case 'EMAIL_ALREADY_EXISTS':
      console.error(`\n❌ ${result.message}`);
      process.exit(1);

    case 'VALIDATION_ERROR':
      console.error(`\n❌ ${result.message}`);
      console.error('\nUsage:');
      console.error('  INITIAL_LIBRARIAN_EMAIL="librarian@rgkedia.edu.in" INITIAL_LIBRARIAN_PASSWORD="<AtLeast12Characters>" npm run admin:bootstrap');
      console.error('  In production (NODE_ENV=production), append --confirm:');
      console.error('  INITIAL_LIBRARIAN_EMAIL="librarian@rgkedia.edu.in" INITIAL_LIBRARIAN_PASSWORD="<AtLeast12Characters>" npm run admin:bootstrap -- --confirm');
      console.error('  Add --dry-run to validate inputs without database modification:');
      console.error('  INITIAL_LIBRARIAN_EMAIL="librarian@rgkedia.edu.in" INITIAL_LIBRARIAN_PASSWORD="<AtLeast12Characters>" npm run admin:bootstrap -- --dry-run');
      process.exit(1);

    case 'DATABASE_ERROR':
    default:
      console.error(`\n❌ ${result.message}`);
      process.exit(1);
  }
}

// Only run main if executed directly via CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('bootstrapAdmin.ts')) {
  main().catch((err) => {
    console.error('\n❌ Fatal unhandled bootstrap error:', err?.message || err);
    process.exit(1);
  });
}
