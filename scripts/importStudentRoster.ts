// scripts/importStudentRoster.ts — Production Student Roster Import CLI
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  executeStudentRosterImport,
  sanitizeErrorMessage,
} from '../server/lib/roster/rosterImportEngine.js';
import { RosterImportOptions } from '../server/lib/roster/types.js';

// Load environment variables (.env)
dotenv.config();

function parseArgs(args: string[]): {
  filePath?: string;
  dryRun: boolean;
  execute: boolean;
  confirm: boolean;
  actorId?: string;
  skipExisting: boolean;
  credentialsOut?: string;
  credentialsFormat: 'json' | 'csv';
} {
  let filePath: string | undefined = undefined;
  let dryRun = false;
  let execute = false;
  let confirm = false;
  let actorId: string | undefined = undefined;
  let skipExisting = true;
  let credentialsOut: string | undefined = undefined;
  let credentialsFormat: 'json' | 'csv' = 'json';

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--execute') {
      execute = true;
    } else if (arg === '--confirm') {
      confirm = true;
    } else if (arg === '--no-skip-existing') {
      skipExisting = false;
    } else if (arg.startsWith('--file=')) {
      filePath = arg.slice(7).trim();
    } else if (arg.startsWith('--input=')) {
      filePath = arg.slice(8).trim();
    } else if (arg.startsWith('--actor-id=')) {
      actorId = arg.slice(11).trim();
    } else if (arg.startsWith('--credentials-out=')) {
      credentialsOut = arg.slice(18).trim();
    } else if (arg.startsWith('--credentials-format=')) {
      const fmt = arg.slice(21).trim().toLowerCase();
      if (fmt === 'csv' || fmt === 'json') {
        credentialsFormat = fmt;
      }
    } else if (!arg.startsWith('--') && !filePath) {
      filePath = arg.trim();
    }
  }

  // If neither --dry-run nor --execute is explicitly specified, default to safe --dry-run
  if (!execute && !dryRun) {
    dryRun = true;
  }

  return {
    filePath,
    dryRun,
    execute,
    confirm,
    actorId,
    skipExisting,
    credentialsOut,
    credentialsFormat,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  console.log('='.repeat(72));
  console.log(' RG-KEDIA COLLEGE OF COMMERCE — PRODUCTION STUDENT ROSTER IMPORTER');
  console.log('='.repeat(72));

  if (!options.filePath) {
    console.error('\nERROR: Missing input CSV file path.');
    console.log('\nUsage:');
    console.log('  npm run roster:import -- --file=<path-to-roster.csv> [--dry-run | --execute]');
    console.log('\nOptions:');
    console.log('  --file=<path>             Path to Excel-exported CSV roster file');
    console.log('  --dry-run                 Preview validation and duplicate checks (default, no DB writes)');
    console.log('  --execute                 Execute live import and account creation');
    console.log('  --confirm                 Required when executing in NODE_ENV=production');
    console.log('  --actor-id=<id>           Specific librarian actor ID for audit log');
    console.log('  --no-skip-existing        Fail on database collisions instead of skipping them');
    console.log('  --credentials-out=<path>  Export generated credentials (must be strictly OUTSIDE repo)');
    console.log('  --credentials-format=json Format of credential export ("json" or "csv", default: json)\n');
    process.exit(1);
  }

  const resolvedPath = path.resolve(options.filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`\nERROR: Input file not found: ${resolvedPath}\n`);
    process.exit(1);
  }

  let csvText: string;
  try {
    csvText = fs.readFileSync(resolvedPath, 'utf8');
  } catch (err: any) {
    console.error(`\nERROR: Failed to read CSV file: ${sanitizeErrorMessage(err.message)}\n`);
    process.exit(1);
  }

  console.log(`Input File:       ${resolvedPath}`);
  console.log(`Execution Mode:   ${options.dryRun ? 'DRY RUN (Preview Only, Zero DB Writes)' : 'LIVE EXECUTION'}`);
  console.log(`Environment:      ${process.env.NODE_ENV || 'development'}`);
  console.log(`Duplicate Policy: ${options.skipExisting ? 'Skip existing students idempotently' : 'Strict (Fail on duplicate)'}`);
  if (options.credentialsOut) {
    console.log(`Credentials Out:  ${options.credentialsOut} (${options.credentialsFormat})`);
  }
  console.log('-'.repeat(72));

  const importOptions: RosterImportOptions = {
    csvText,
    dryRun: options.dryRun,
    confirmProduction: options.confirm,
    actorId: options.actorId,
    skipExisting: options.skipExisting,
    credentialsOutputPath: options.credentialsOut,
    credentialsFormat: options.credentialsFormat,
    sourceName: path.basename(resolvedPath),
  };

  const result = await executeStudentRosterImport(importOptions);

  if (!result.success) {
    console.error(`\n❌ IMPORT FAILED [${result.code}]:`);
    console.error(`   ${sanitizeErrorMessage(result.error)}\n`);

    if (result.cleanupWarning) {
      console.warn(`   ⚠️ ${sanitizeErrorMessage(result.cleanupWarning)}`);
    }

    if (result.validation && result.validation.errors.length > 0) {
      console.log('Validation Errors (first 10):');
      result.validation.errors.slice(0, 10).forEach((err) => {
        console.log(` - Row ${err.row} [${err.field}]: ${sanitizeErrorMessage(err.message)} (${err.code})`);
      });
      if (result.validation.errors.length > 10) {
        console.log(`   ...and ${result.validation.errors.length - 10} more error(s).`);
      }
    }

    if (result.dbConflicts && result.dbConflicts.conflicts.length > 0) {
      console.log('\nDatabase Conflicts:');
      result.dbConflicts.conflicts.slice(0, 5).forEach((c) => {
        console.log(` - ${sanitizeErrorMessage(c.reason)}`);
      });
    }

    process.exit(1);
  }

  console.log(`\n✅ ${result.message}\n`);
  console.log('Summary:');
  console.log(` - Total CSV Rows:      ${result.summary.totalRows}`);
  console.log(` - Valid Student Rows:  ${result.summary.validRows}`);
  console.log(` - Accounts Created:    ${result.summary.createdCount}`);
  console.log(` - Existing Skipped:    ${result.summary.skippedCount}`);
  console.log(` - Database Conflicts:  ${result.summary.conflictCount}`);

  if (result.auditLogId) {
    console.log(` - Audit Log Event ID:  ${result.auditLogId}`);
  }
  if (result.credentialsFile) {
    console.log(` - Credentials Export:  ${result.credentialsFile}`);
    console.log('   ⚠️  Distribute temporary credentials securely. Enforce password change on first login.');
  }

  console.log('\n' + '='.repeat(72) + '\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nUNHANDLED EXCEPTION in roster import CLI:', sanitizeErrorMessage(err?.message || String(err)));
  process.exit(1);
});
