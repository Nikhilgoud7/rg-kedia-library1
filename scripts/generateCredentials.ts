// scripts/generateCredentials.ts — Secure Synthetic Credential Generator CLI
import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { generateSyntheticCohort } from '../server/lib/cohort/syntheticGenerator.js';
import { validateSyntheticCohort } from '../server/lib/cohort/cohortValidator.js';
import {
  generateSyntheticCredentials,
  validateCredentialOutputPath,
} from '../server/lib/cohort/credentialGenerator.js';
import { SyntheticUserRecord } from '../server/lib/cohort/types.js';

// Load environment if present
dotenv.config();

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║    RG-Kedia LMS — Synthetic Credential Generator    ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  const args = process.argv.slice(2);

  const outArg = args.find((a) => a.startsWith('--out='));
  const inputArg = args.find((a) => a.startsWith('--input='));
  const studentsArg = args.find((a) => a.startsWith('--students='));
  const teachersArg = args.find((a) => a.startsWith('--teachers='));
  const librariansArg = args.find((a) => a.startsWith('--librarians='));
  const tagArg = args.find((a) => a.startsWith('--tag='));
  const formatArg = args.find((a) => a.startsWith('--format='));
  const overwrite = args.includes('--overwrite');
  const dryRun = args.includes('--dry-run');

  // Default output path is located outside repo in parent or temp directory
  const defaultOutputPath = path.resolve(
    os.tmpdir(),
    'rg-kedia-test-credentials',
    `synthetic-cohort-${Date.now()}.${formatArg ? formatArg.split('=')[1] : 'json'}`
  );

  const targetPath = outArg ? outArg.split('=')[1] : defaultOutputPath;

  // Validate output path boundary BEFORE doing any work
  try {
    validateCredentialOutputPath(targetPath);
  } catch (err: any) {
    console.error(`\n🛑 Security Violation: ${err.message}`);
    process.exit(1);
  }

  let cohort: SyntheticUserRecord[];

  if (inputArg) {
    const inputPath = path.resolve(inputArg.split('=')[1]);
    if (!fs.existsSync(inputPath)) {
      console.error(`\n❌ Error: Input cohort file not found: ${inputPath}`);
      process.exit(1);
    }
    const inputContent = fs.readFileSync(inputPath, 'utf8');
    const validation = await validateSyntheticCohort(inputContent);
    if (!validation.isValid) {
      console.error(`\n❌ Input cohort validation failed with ${validation.errors.length} error(s).`);
      validation.errors.slice(0, 10).forEach((e) => console.error(`   - Row ${e.row}: ${e.field} — ${e.message}`));
      process.exit(1);
    }
    cohort = validation.validRecords;
    console.log(`\n📄 Loaded and validated ${cohort.length} user records from ${inputPath}`);
  } else {
    const studentCount = studentsArg ? parseInt(studentsArg.split('=')[1], 10) : 20;
    const teacherCount = teachersArg ? parseInt(teachersArg.split('=')[1], 10) : 3;
    const librarianCount = librariansArg ? parseInt(librariansArg.split('=')[1], 10) : 1;
    const tag = tagArg ? tagArg.split('=')[1] : `p9d.${Date.now()}`;

    cohort = generateSyntheticCohort({
      studentCount,
      teacherCount,
      librarianCount,
      tag,
    });

    console.log(`\n⚙️ Generated ${cohort.length} synthetic user records:`);
    console.log(`   - Students:    ${studentCount}`);
    console.log(`   - Teachers:    ${teacherCount}`);
    console.log(`   - Librarians:  ${librarianCount}`);
  }

  // Pre-generation validation check
  const validation = await validateSyntheticCohort(cohort);
  if (!validation.isValid) {
    console.error(`\n❌ Cohort failed academic/role validation:`);
    validation.errors.forEach((e) => console.error(`   - Row ${e.row}: ${e.field} — ${e.message}`));
    process.exit(1);
  }

  if (dryRun) {
    console.log('\n🔎 DRY RUN completed successfully. No credentials written.');
    console.log(`   - Output Target:   ${targetPath}`);
    console.log(`   - User Count:      ${cohort.length}`);
    console.log(`   - Boundary Check:  PASSED (Target is outside repository root)`);
    process.exit(0);
  }

  console.log(`\n🔐 Generating high-entropy credentials & bcrypt hashes (salt=10)...`);

  try {
    const format = formatArg ? (formatArg.split('=')[1] as 'json' | 'csv') : undefined;
    const result = await generateSyntheticCredentials(cohort, {
      outputPath: targetPath,
      overwrite,
      format,
    });

    console.log('\n✅ Synthetic credentials created successfully:');
    console.log(`   - Destination:     ${result.outputPath}`);
    console.log(`   - Total Users:     ${result.recordCount}`);
    console.log(`   - File Size:       ${(result.fileSizeBytes / 1024).toFixed(2)} KB`);
    console.log(`   - Format:          ${result.format.toUpperCase()}`);
    console.log(`   - Generation Time: ${result.durationMs}ms`);
    console.log(`   - File Mode:       0600 (owner-only access)`);
    console.log(`   - Forced Password Change: true (mustChangePassword flag enabled for all)`);
    console.log('\n🛡️ SECURITY NOTICE:');
    console.log('   - Output file is located OUTSIDE the Git repository.');
    console.log('   - Zero passwords or secret keys were printed to the console.');
    console.log('   - DO NOT copy or commit this file into version control.');
  } catch (err: any) {
    console.error(`\n💥 Error generating credentials: ${err.message}`);
    process.exit(1);
  }
}

main();
