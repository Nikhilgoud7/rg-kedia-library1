// server/lib/cohort/cohortValidator.ts — Synthetic User Cohort Validation Engine
import { parseCsv } from '../bulkImportFormat.js';
import {
  SyntheticUserRecord,
  UserRole,
  AcademicProgram,
  SecondLanguage,
  VALID_ROLES,
  VALID_PROGRAMS,
  VALID_LANGUAGES,
  ACADEMIC_YEAR_SEMESTER_MAP,
  CohortValidationError,
  CohortSummaryStats,
  CohortValidationResult,
  CohortValidationOptions,
} from './types.js';

export const MAX_COHORT_RECORDS = 5000;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const ROLL_NUMBER_REGEX = /^(?:\d{10,12}|RGK\d{4,8})$/i;
const PHONE_REGEX = /^[6-9]\d{9}$/;

/**
 * Parses raw input (CSV string, JSON string, or object array) into normalized SyntheticUserRecord array.
 */
export function parseCohortInput(input: SyntheticUserRecord[] | string): {
  records: SyntheticUserRecord[];
  parseErrors: CohortValidationError[];
} {
  const parseErrors: CohortValidationError[] = [];

  if (Array.isArray(input)) {
    return { records: input, parseErrors };
  }

  if (typeof input !== 'string') {
    parseErrors.push({
      row: 0,
      field: 'input',
      code: 'INVALID_INPUT_TYPE',
      message: 'Cohort input must be an array of records or a string (JSON/CSV).',
    });
    return { records: [], parseErrors };
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    parseErrors.push({
      row: 0,
      field: 'input',
      code: 'EMPTY_INPUT',
      message: 'Cohort input is empty.',
    });
    return { records: [], parseErrors };
  }

  // Attempt JSON parsing if starts with [ or {
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const rawRecords: any[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.credentials)
        ? parsed.credentials
        : Array.isArray(parsed.users)
        ? parsed.users
        : [];

      if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
        parseErrors.push({
          row: 0,
          field: 'json',
          code: 'NO_RECORDS_IN_JSON',
          message: 'Parsed JSON does not contain an array of user records.',
        });
        return { records: [], parseErrors };
      }

      return {
        records: rawRecords.map((r) => ({
          name: String(r.name || '').trim(),
          email: String(r.email || '').trim(),
          role: String(r.role || '').toUpperCase().trim() as UserRole,
          phone: r.phone ? String(r.phone).trim() : null,
          rollNumber: r.rollNumber ? String(r.rollNumber).trim() : null,
          program: r.program ? String(r.program).toUpperCase().trim() : null,
          branch: r.branch ? String(r.branch).trim() : null,
          year: r.year !== undefined && r.year !== null && r.year !== '' ? Number(r.year) : null,
          semester: r.semester !== undefined && r.semester !== null && r.semester !== '' ? Number(r.semester) : null,
          secondLanguage: r.secondLanguage ? String(r.secondLanguage).toUpperCase().trim() : null,
        })),
        parseErrors,
      };
    } catch (err: any) {
      parseErrors.push({
        row: 0,
        field: 'json',
        code: 'JSON_PARSE_ERROR',
        message: `Failed to parse cohort JSON: ${err.message}`,
      });
      return { records: [], parseErrors };
    }
  }

  // Otherwise, parse as CSV using RFC 4180 parser
  const csvRows = parseCsv(trimmed).filter(
    (row) => row.length > 0 && !(row.length === 1 && row[0].trim() === '') && !row[0].startsWith('#')
  );

  if (csvRows.length === 0) {
    parseErrors.push({
      row: 0,
      field: 'csv',
      code: 'EMPTY_CSV',
      message: 'CSV contains no rows or only comments/blank lines.',
    });
    return { records: [], parseErrors };
  }

  // Map header row
  const header = csvRows[0].map((h) => h.toLowerCase().trim());
  const nameIdx = header.indexOf('name');
  const emailIdx = header.indexOf('email');
  const roleIdx = header.indexOf('role');
  const rollIdx = header.indexOf('rollnumber') !== -1 ? header.indexOf('rollnumber') : header.indexOf('roll_number');
  const programIdx = header.indexOf('program');
  const branchIdx = header.indexOf('branch');
  const yearIdx = header.indexOf('year');
  const semIdx = header.indexOf('semester') !== -1 ? header.indexOf('semester') : header.indexOf('sem');
  const langIdx =
    header.indexOf('secondlanguage') !== -1 ? header.indexOf('secondlanguage') : header.indexOf('second_language');
  const phoneIdx = header.indexOf('phone');

  if (nameIdx === -1 || emailIdx === -1 || roleIdx === -1) {
    parseErrors.push({
      row: 1,
      field: 'header',
      code: 'MISSING_REQUIRED_HEADERS',
      message: 'CSV header must include at least: Name, Email, Role',
    });
    return { records: [], parseErrors };
  }

  const records: SyntheticUserRecord[] = [];

  for (let i = 1; i < csvRows.length; i++) {
    const row = csvRows[i];
    const getVal = (idx: number) => (idx !== -1 && idx < row.length && row[idx].trim() ? row[idx].trim() : null);

    const yearVal = getVal(yearIdx);
    const semVal = getVal(semIdx);

    records.push({
      name: getVal(nameIdx) || '',
      email: getVal(emailIdx) || '',
      role: (getVal(roleIdx)?.toUpperCase() || '') as UserRole,
      rollNumber: getVal(rollIdx),
      program: getVal(programIdx)?.toUpperCase() || null,
      branch: getVal(branchIdx),
      year: yearVal !== null ? Number(yearVal) : null,
      semester: semVal !== null ? Number(semVal) : null,
      secondLanguage: getVal(langIdx)?.toUpperCase() || null,
      phone: getVal(phoneIdx),
    });
  }

  return { records, parseErrors };
}

/**
 * Validates a cohort of synthetic user records against academic rules,
 * roll number formats, role restrictions, duplicate rules, and optionally DB uniqueness.
 */
export async function validateSyntheticCohort(
  input: SyntheticUserRecord[] | string,
  options: CohortValidationOptions = {}
): Promise<CohortValidationResult> {
  const { records, parseErrors } = parseCohortInput(input);
  const errors: CohortValidationError[] = [...parseErrors];

  const maxRecords = options.maxRecords || MAX_COHORT_RECORDS;

  const summary: CohortSummaryStats = {
    totalRecords: records.length,
    validRecords: 0,
    invalidRecords: 0,
    byRole: { STUDENT: 0, TEACHER: 0, LIBRARIAN: 0 },
    byProgram: {},
    byYear: {},
    bySemester: {},
    academicMismatches: 0,
    duplicateEmails: 0,
    duplicateRollNumbers: 0,
    dbConflicts: 0,
  };

  if (errors.length > 0) {
    summary.invalidRecords = records.length;
    return {
      isValid: false,
      summary,
      errors,
      validRecords: [],
    };
  }

  if (records.length > maxRecords) {
    errors.push({
      row: 0,
      field: 'cohort',
      code: 'MAX_COHORT_EXCEEDED',
      message: `Cohort contains ${records.length} records, exceeding maximum of ${maxRecords}.`,
    });
    summary.invalidRecords = records.length;
    return { isValid: false, summary, errors, validRecords: [] };
  }

  const seenEmails = new Map<string, number>();
  const seenRollNumbers = new Map<string, number>();

  const rowErrorIndices = new Set<number>();

  // Pass 1: Schema and Role-specific Validation
  records.forEach((record, index) => {
    const rowNum = index + 1; // 1-based data row
    let rowHasError = false;

    const addError = (field: string, code: string, message: string, value?: unknown) => {
      errors.push({ row: rowNum, field, code, message, value });
      rowHasError = true;
      rowErrorIndices.add(index);
    };

    // 1. Name validation
    if (!record.name || record.name.trim().length < 2) {
      addError('name', 'INVALID_NAME', 'Name must be at least 2 characters.', record.name);
    } else if (record.name.trim().length > 100) {
      addError('name', 'NAME_TOO_LONG', 'Name cannot exceed 100 characters.', record.name);
    }

    // 2. Email validation
    const emailNorm = record.email ? record.email.toLowerCase().trim() : '';
    if (!emailNorm || !EMAIL_REGEX.test(emailNorm)) {
      addError('email', 'INVALID_EMAIL', 'A valid email address is required.', record.email);
    } else if (options.allowedEmailDomains && options.allowedEmailDomains.length > 0) {
      const matchesDomain = options.allowedEmailDomains.some((dom) => emailNorm.endsWith(dom.toLowerCase()));
      if (!matchesDomain) {
        addError(
          'email',
          'EMAIL_DOMAIN_NOT_ALLOWED',
          `Email domain not allowed. Must match: ${options.allowedEmailDomains.join(', ')}`,
          emailNorm
        );
      }
    }

    // Intra-cohort email duplicate check
    if (emailNorm) {
      if (seenEmails.has(emailNorm)) {
        addError(
          'email',
          'DUPLICATE_EMAIL_IN_COHORT',
          `Duplicate email within cohort (already used at row ${seenEmails.get(emailNorm)}).`,
          emailNorm
        );
        summary.duplicateEmails++;
      } else {
        seenEmails.set(emailNorm, rowNum);
      }
    }

    // 3. Role validation
    const roleNorm = record.role ? (String(record.role).toUpperCase().trim() as UserRole) : null;
    if (!roleNorm || !VALID_ROLES.includes(roleNorm)) {
      addError('role', 'INVALID_ROLE', `Role must be one of: ${VALID_ROLES.join(', ')}`, record.role);
    } else {
      summary.byRole[roleNorm] = (summary.byRole[roleNorm] || 0) + 1;
    }

    // 4. Phone validation (optional)
    if (record.phone) {
      const phoneClean = String(record.phone).trim();
      if (!PHONE_REGEX.test(phoneClean)) {
        addError('phone', 'INVALID_PHONE', 'Phone must be a valid 10-digit Indian mobile number.', phoneClean);
      }
    }

    // 5. Role-specific validation
    if (roleNorm === 'STUDENT') {
      // Roll Number
      const roll = record.rollNumber ? String(record.rollNumber).trim() : '';
      if (!roll) {
        addError('rollNumber', 'MISSING_ROLL_NUMBER', 'Roll number is mandatory for students.');
      } else if (!ROLL_NUMBER_REGEX.test(roll)) {
        addError(
          'rollNumber',
          'INVALID_ROLL_NUMBER_FORMAT',
          'Roll number must be 10-12 digits or RGK-prefixed student ID.',
          roll
        );
      } else {
        const rollUpper = roll.toUpperCase();
        if (seenRollNumbers.has(rollUpper)) {
          addError(
            'rollNumber',
            'DUPLICATE_ROLL_NUMBER_IN_COHORT',
            `Duplicate roll number within cohort (already used at row ${seenRollNumbers.get(rollUpper)}).`,
            roll
          );
          summary.duplicateRollNumbers++;
        } else {
          seenRollNumbers.set(rollUpper, rowNum);
        }
      }

      // Academic Program
      const prog = record.program ? (String(record.program).toUpperCase().trim() as AcademicProgram) : null;
      if (!prog || !VALID_PROGRAMS.includes(prog)) {
        addError(
          'program',
          'INVALID_PROGRAM',
          `Program is required for students and must be one of: ${VALID_PROGRAMS.join(', ')}`,
          record.program
        );
      } else {
        summary.byProgram[prog] = (summary.byProgram[prog] || 0) + 1;
      }

      // Academic Year & Semester
      const year = record.year !== undefined && record.year !== null ? Number(record.year) : null;
      const sem = record.semester !== undefined && record.semester !== null ? Number(record.semester) : null;

      if (year === null || isNaN(year) || year < 1 || year > 3) {
        addError('year', 'INVALID_YEAR', 'Year must be 1, 2, or 3.', record.year);
      } else {
        summary.byYear[year] = (summary.byYear[year] || 0) + 1;
      }

      if (sem === null || isNaN(sem) || sem < 1 || sem > 6) {
        addError('semester', 'INVALID_SEMESTER', 'Semester must be between 1 and 6.', record.semester);
      } else {
        summary.bySemester[sem] = (summary.bySemester[sem] || 0) + 1;
      }

      // Academic Year / Semester Consistency Check
      if (year !== null && sem !== null && year >= 1 && year <= 3 && sem >= 1 && sem <= 6) {
        const validSems = ACADEMIC_YEAR_SEMESTER_MAP[year];
        if (!validSems.includes(sem)) {
          addError(
            'semester',
            'ACADEMIC_MISMATCH',
            `Year ${year} cannot have Semester ${sem}. Valid semesters for Year ${year} are ${validSems.join(', ')}.`,
            { year, semester: sem }
          );
          summary.academicMismatches++;
        }
      }

      // Second Language
      if (record.secondLanguage) {
        const lang = String(record.secondLanguage).toUpperCase().trim() as SecondLanguage;
        if (!VALID_LANGUAGES.includes(lang)) {
          addError(
            'secondLanguage',
            'INVALID_LANGUAGE',
            `Second language must be one of: ${VALID_LANGUAGES.join(', ')}`,
            record.secondLanguage
          );
        }
      }
    } else if (roleNorm === 'TEACHER' || roleNorm === 'LIBRARIAN') {
      // Teachers and librarians should not have student roll numbers, years, or semesters
      if (record.rollNumber && String(record.rollNumber).trim()) {
        addError(
          'rollNumber',
          'ROLE_FIELD_MISMATCH',
          `Roll number is not permitted for ${roleNorm} role.`,
          record.rollNumber
        );
      }
      if (record.year !== undefined && record.year !== null && record.year !== ('' as any)) {
        addError('year', 'ROLE_FIELD_MISMATCH', `Year is not permitted for ${roleNorm} role.`, record.year);
      }
      if (record.semester !== undefined && record.semester !== null && record.semester !== ('' as any)) {
        addError(
          'semester',
          'ROLE_FIELD_MISMATCH',
          `Semester is not permitted for ${roleNorm} role.`,
          record.semester
        );
      }
    }
  });

  // Pass 2: Optional Database Conflict Checks
  if (options.checkDatabase === true && options.prisma) {
    const emailsToCheck = Array.from(seenEmails.keys());
    const rollNumbersToCheck = Array.from(seenRollNumbers.keys());

    if (emailsToCheck.length > 0 || rollNumbersToCheck.length > 0) {
      try {
        const existingUsers = await options.prisma.user.findMany({
          where: {
            OR: [
              ...(emailsToCheck.length > 0 ? [{ email: { in: emailsToCheck } }] : []),
              ...(rollNumbersToCheck.length > 0 ? [{ rollNumber: { in: rollNumbersToCheck } }] : []),
            ],
          },
          select: {
            id: true,
            email: true,
            rollNumber: true,
          },
        });

        const existingEmails = new Set(existingUsers.map((u: any) => u.email.toLowerCase()));
        const existingRolls = new Set(
          existingUsers.filter((u: any) => u.rollNumber).map((u: any) => u.rollNumber.toUpperCase())
        );

        records.forEach((record, idx) => {
          const rowNum = idx + 1;
          const emailNorm = record.email ? record.email.toLowerCase().trim() : '';
          const rollUpper = record.rollNumber ? record.rollNumber.toUpperCase().trim() : '';

          if (emailNorm && existingEmails.has(emailNorm)) {
            errors.push({
              row: rowNum,
              field: 'email',
              code: 'DATABASE_EMAIL_CONFLICT',
              message: `User with email '${emailNorm}' already exists in the database.`,
            });
            rowErrorIndices.add(idx);
            summary.dbConflicts++;
          }

          if (rollUpper && existingRolls.has(rollUpper)) {
            errors.push({
              row: rowNum,
              field: 'rollNumber',
              code: 'DATABASE_ROLL_NUMBER_CONFLICT',
              message: `Student with roll number '${rollUpper}' already exists in the database.`,
            });
            rowErrorIndices.add(idx);
            summary.dbConflicts++;
          }
        });
      } catch (err: any) {
        errors.push({
          row: 0,
          field: 'database',
          code: 'DB_CHECK_FAILED',
          message: `Database conflict check failed: ${err.message}`,
        });
      }
    }
  }

  summary.invalidRecords = rowErrorIndices.size;
  summary.validRecords = records.length - rowErrorIndices.size;

  const validRecords = records.filter((_, idx) => !rowErrorIndices.has(idx));

  return {
    isValid: errors.length === 0,
    summary,
    errors,
    validRecords,
  };
}
