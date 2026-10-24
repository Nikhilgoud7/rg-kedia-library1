// server/lib/cohort/syntheticGenerator.ts — Synthetic Cohort Generator for Testing & Staging
import { PrismaClient } from '@prisma/client';
import {
  SyntheticUserRecord,
  AcademicProgram,
  SecondLanguage,
  VALID_PROGRAMS,
  VALID_LANGUAGES,
  ACADEMIC_YEAR_SEMESTER_MAP,
} from './types.js';
import { generateSyntheticCredentials } from './credentialGenerator.js';
import { validateRestoreDatabaseTarget } from '../backup/restoreEngine.js';

export interface GenerateCohortOptions {
  studentCount?: number;
  teacherCount?: number;
  librarianCount?: number;
  tag?: string;
  emailDomain?: string;
}

const FIRST_NAMES = [
  'Aarav', 'Ananya', 'Rohan', 'Pooja', 'Vikram', 'Divya', 'Siddharth', 'Kavya',
  'Aditya', 'Sneha', 'Rahul', 'Neha', 'Arjun', 'Meera', 'Karthik', 'Swati',
  'Pranav', 'Anjali', 'Varun', 'Ritu', 'Nikhil', 'Priyanka', 'Suresh', 'Deepika',
];

const LAST_NAMES = [
  'Sharma', 'Reddy', 'Rao', 'Verma', 'Patel', 'Kulkarni', 'Joshi', 'Gupta',
  'Choudhary', 'Nair', 'Iyer', 'Deshmukh', 'Singh', 'Mishra', 'Agarwal', 'Bhat',
];

/**
 * Generates an array of structurally valid, academically consistent synthetic user records.
 */
export function generateSyntheticCohort(options: GenerateCohortOptions = {}): SyntheticUserRecord[] {
  const studentCount = options.studentCount ?? 20;
  const teacherCount = options.teacherCount ?? 3;
  const librarianCount = options.librarianCount ?? 1;
  const tag = options.tag ? `${options.tag}.` : '';
  const domain = options.emailDomain || 'rgkedia.edu.in';

  const records: SyntheticUserRecord[] = [];
  let userCounter = 1;

  // 1. Generate Students
  for (let i = 0; i < studentCount; i++) {
    const fName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lName = LAST_NAMES[(i * 3) % LAST_NAMES.length];
    const numStr = String(userCounter).padStart(4, '0');

    // Distribute evenly across programs: BCOM, BBA, BSC
    const program = VALID_PROGRAMS[i % VALID_PROGRAMS.length];

    // Distribute across academic years: 1, 2, 3
    const year = (i % 3) + 1;
    const sems = ACADEMIC_YEAR_SEMESTER_MAP[year];
    // Alternate between odd and even semester for the year
    const semester = sems[i % sems.length];

    // Second language
    const secondLanguage = VALID_LANGUAGES[i % VALID_LANGUAGES.length];

    // Roll number (12 digits, e.g. 111224000001)
    const rollNumber = `111224${String(userCounter).padStart(6, '0')}`;

    records.push({
      name: `${fName} ${lName}`,
      email: `synth.student.${tag}${numStr}@${domain}`.toLowerCase(),
      role: 'STUDENT',
      rollNumber,
      program,
      branch: program === 'BCOM' ? 'General' : program === 'BSC' ? 'Computer Science' : 'Marketing',
      year,
      semester,
      secondLanguage,
      phone: `9848${String(100000 + userCounter).slice(-6)}`,
    });

    userCounter++;
  }

  // 2. Generate Teachers
  const teacherDepts = ['Commerce & Accountancy', 'Business Management', 'Computer Science & IT'];
  for (let i = 0; i < teacherCount; i++) {
    const fName = FIRST_NAMES[(i + 10) % FIRST_NAMES.length];
    const lName = LAST_NAMES[(i + 5) % LAST_NAMES.length];
    const numStr = String(userCounter).padStart(4, '0');

    records.push({
      name: `Dr. ${fName} ${lName}`,
      email: `synth.teacher.${tag}${numStr}@${domain}`.toLowerCase(),
      role: 'TEACHER',
      rollNumber: null,
      program: null,
      branch: teacherDepts[i % teacherDepts.length],
      year: null,
      semester: null,
      secondLanguage: null,
      phone: `9988${String(200000 + userCounter).slice(-6)}`,
    });

    userCounter++;
  }

  // 3. Generate Librarians
  for (let i = 0; i < librarianCount; i++) {
    const fName = FIRST_NAMES[(i + 15) % FIRST_NAMES.length];
    const lName = LAST_NAMES[(i + 8) % LAST_NAMES.length];
    const numStr = String(userCounter).padStart(4, '0');

    records.push({
      name: `${fName} ${lName}`,
      email: `synth.librarian.${tag}${numStr}@${domain}`.toLowerCase(),
      role: 'LIBRARIAN',
      rollNumber: null,
      program: null,
      branch: 'Library Services',
      year: null,
      semester: null,
      secondLanguage: null,
      phone: `9700${String(300000 + userCounter).slice(-6)}`,
    });

    userCounter++;
  }

  return records;
}

/**
 * Loads a synthetic cohort into the isolated test database, ensuring strict guardrails.
 * All accounts are created with generated credentials and mustChangePassword = true.
 */
export async function seedSyntheticCohortToTestDb(
  prisma: PrismaClient,
  credentials: Array<{
    name: string;
    email: string;
    role: 'STUDENT' | 'TEACHER' | 'LIBRARIAN';
    rollNumber?: string | null;
    program?: string | null;
    branch?: string | null;
    year?: number | null;
    semester?: number | null;
    secondLanguage?: string | null;
    passwordHash: string;
    mustChangePassword: true;
  }>
): Promise<{ createdCount: number; userIds: string[] }> {
  // Guard target database connection
  validateRestoreDatabaseTarget(process.env.DATABASE_URL);

  const userIds: string[] = [];

  for (const cred of credentials) {
    const user = await prisma.user.create({
      data: {
        name: cred.name,
        email: cred.email,
        password: cred.passwordHash,
        role: cred.role,
        rollNumber: cred.rollNumber || null,
        program: cred.program || null,
        branch: cred.branch || null,
        year: cred.year ?? null,
        semester: cred.semester ?? null,
        secondLanguage: cred.secondLanguage || null,
        mustChangePassword: true,
        active: true,
      },
      select: { id: true },
    });
    userIds.push(user.id);
  }

  return {
    createdCount: userIds.length,
    userIds,
  };
}

/**
 * Cleanly removes seeded synthetic accounts by user ID.
 */
export async function cleanupSyntheticCohortFromTestDb(
  prisma: PrismaClient,
  userIds: string[]
): Promise<number> {
  validateRestoreDatabaseTarget(process.env.DATABASE_URL);

  if (!userIds || userIds.length === 0) return 0;

  const result = await prisma.user.deleteMany({
    where: {
      id: { in: userIds },
    },
  });

  return result.count;
}
