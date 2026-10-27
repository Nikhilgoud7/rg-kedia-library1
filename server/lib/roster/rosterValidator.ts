// server/lib/roster/rosterValidator.ts — Production Student Roster CSV Validation Engine
import { parseCsv } from '../bulkImportFormat.js';
import {
  StudentRosterRecord,
  RosterValidationError,
  RosterValidationResult,
  RosterSummaryStats,
  AcademicProgram,
  SecondLanguage,
  VALID_PROGRAMS,
  VALID_LANGUAGES,
  ACADEMIC_YEAR_SEMESTER_MAP,
  MAX_ROSTER_RECORDS,
} from './types.js';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// Accepts Osmania University format (1052-YY-PPP-NNN or 10-12 digits), RGK prefix, or standard college alphanumeric
const ROLL_NUMBER_REGEX = /^(?:\d{4}-\d{2}-\d{3}-\d{3}|\d{10,12}|RGK\d{4,8}|[A-Za-z0-9-]{4,25})$/i;
const PHONE_REGEX = /^[6-9]\d{9}$/;

/**
 * Normalizes header string by lowercasing and stripping non-alphanumeric characters.
 */
function normalizeHeaderName(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Validates a CSV string representing an official college student roster.
 */
export function validateRosterCsv(
  csvText: string,
  options: { maxRecords?: number } = {}
): RosterValidationResult {
  const maxRecords = options.maxRecords || MAX_ROSTER_RECORDS;
  const errors: RosterValidationError[] = [];
  const validRecords: StudentRosterRecord[] = [];

  const summary: RosterSummaryStats = {
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    byProgram: { BCOM: 0, BBA: 0, BSC: 0 },
    byYear: { 1: 0, 2: 0, 3: 0 },
    bySemester: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    duplicateEmails: 0,
    duplicateRollNumbers: 0,
  };

  if (!csvText || typeof csvText !== 'string' || !csvText.trim()) {
    errors.push({
      row: 0,
      field: 'file',
      code: 'EMPTY_FILE',
      message: 'The uploaded CSV file is empty.',
    });
    return {
      isValid: false,
      totalRows: 0,
      validRecords: [],
      errors,
      summary,
    };
  }

  // Parse CSV adhering to RFC 4180
  const rawRows = parseCsv(csvText);

  // Filter out completely blank lines or comments
  const nonEmptyRows = rawRows.filter(
    (row) => row.length > 0 && !(row.length === 1 && row[0].trim() === '') && !row[0].startsWith('#')
  );

  if (nonEmptyRows.length === 0) {
    errors.push({
      row: 0,
      field: 'file',
      code: 'EMPTY_CSV_CONTENT',
      message: 'The CSV file contains no data rows.',
    });
    return {
      isValid: false,
      totalRows: 0,
      validRecords: [],
      errors,
      summary,
    };
  }

  // 1. Validate Header Row (Row 1)
  const rawHeaders = nonEmptyRows[0];
  const normalizedHeaders = rawHeaders.map(normalizeHeaderName);

  const headerIndexMap: Record<string, number> = {
    name: -1,
    rollNumber: -1,
    email: -1,
    program: -1,
    branch: -1,
    year: -1,
    semester: -1,
    secondLanguage: -1,
    phone: -1,
  };

  normalizedHeaders.forEach((col, idx) => {
    if (['name', 'studentname', 'fullname'].includes(col)) headerIndexMap.name = idx;
    else if (['rollnumber', 'rollno', 'hallticketno', 'hallticketnumber', 'roll'].includes(col)) headerIndexMap.rollNumber = idx;
    else if (['email', 'emailid', 'studentemail'].includes(col)) headerIndexMap.email = idx;
    else if (['program', 'course', 'degree'].includes(col)) headerIndexMap.program = idx;
    else if (['branch', 'stream', 'specialization'].includes(col)) headerIndexMap.branch = idx;
    else if (['year', 'classyear', 'academicyear'].includes(col)) headerIndexMap.year = idx;
    else if (['semester', 'sem'].includes(col)) headerIndexMap.semester = idx;
    else if (['secondlanguage', 'language', 'seclang'].includes(col)) headerIndexMap.secondLanguage = idx;
    else if (['phone', 'phonenumber', 'phoneno', 'mobile', 'mobileno', 'contact'].includes(col)) headerIndexMap.phone = idx;
  });

  const missingHeaders: string[] = [];
  if (headerIndexMap.name === -1) missingHeaders.push('Name');
  if (headerIndexMap.rollNumber === -1) missingHeaders.push('RollNumber');
  if (headerIndexMap.email === -1) missingHeaders.push('Email');
  if (headerIndexMap.program === -1) missingHeaders.push('Program');

  if (missingHeaders.length > 0) {
    errors.push({
      row: 1,
      field: 'header',
      code: 'MISSING_REQUIRED_HEADERS',
      message: `CSV header is missing required columns: ${missingHeaders.join(', ')}. Expected at least: Name, RollNumber, Email, Program.`,
      value: rawHeaders.join(','),
    });
    return {
      isValid: false,
      totalRows: 0,
      validRecords: [],
      errors,
      summary,
    };
  }

  const dataRows = nonEmptyRows.slice(1);
  summary.totalRows = dataRows.length;

  if (dataRows.length === 0) {
    errors.push({
      row: 1,
      field: 'data',
      code: 'NO_DATA_ROWS',
      message: 'CSV file contains headers but no student data rows.',
    });
    return {
      isValid: false,
      totalRows: 0,
      validRecords: [],
      errors,
      summary,
    };
  }

  if (dataRows.length > maxRecords) {
    errors.push({
      row: 0,
      field: 'file',
      code: 'MAX_RECORDS_EXCEEDED',
      message: `CSV file contains ${dataRows.length} records, which exceeds maximum batch limit of ${maxRecords}.`,
      value: dataRows.length,
    });
    return {
      isValid: false,
      totalRows: dataRows.length,
      validRecords: [],
      errors,
      summary,
    };
  }

  // Tracking for Intra-file Duplicates
  const seenEmails = new Map<string, number>(); // normalized email -> rowNumber
  const seenRollNumbers = new Map<string, number>(); // normalized rollNumber -> rowNumber

  // 2. Validate Data Rows (Row 2, 3, ...)
  dataRows.forEach((rowCols, index) => {
    const rowNumber = index + 2; // 1-based index (header is row 1)
    let rowHasError = false;

    const getValue = (idx: number): string => {
      return idx !== -1 && idx < rowCols.length && rowCols[idx] !== undefined ? rowCols[idx].trim() : '';
    };

    const rawName = getValue(headerIndexMap.name);
    const rawRoll = getValue(headerIndexMap.rollNumber);
    const rawEmail = getValue(headerIndexMap.email);
    const rawProgram = getValue(headerIndexMap.program);
    const rawBranch = getValue(headerIndexMap.branch);
    const rawYear = getValue(headerIndexMap.year);
    const rawSem = getValue(headerIndexMap.semester);
    const rawLang = getValue(headerIndexMap.secondLanguage);
    const rawPhone = getValue(headerIndexMap.phone);

    // Validate Name
    if (!rawName) {
      errors.push({
        row: rowNumber,
        field: 'name',
        code: 'REQUIRED_FIELD_MISSING',
        message: 'Student name is required.',
      });
      rowHasError = true;
    } else if (rawName.length < 2) {
      errors.push({
        row: rowNumber,
        field: 'name',
        code: 'INVALID_NAME_LENGTH',
        message: 'Student name must be at least 2 characters.',
        value: rawName,
      });
      rowHasError = true;
    }

    // Validate Roll Number
    let normalizedRoll = '';
    if (!rawRoll) {
      errors.push({
        row: rowNumber,
        field: 'rollNumber',
        code: 'REQUIRED_FIELD_MISSING',
        message: 'Roll number is required.',
      });
      rowHasError = true;
    } else {
      normalizedRoll = rawRoll.toUpperCase();
      if (!ROLL_NUMBER_REGEX.test(normalizedRoll)) {
        errors.push({
          row: rowNumber,
          field: 'rollNumber',
          code: 'INVALID_ROLL_NUMBER',
          message: `Roll number "${rawRoll}" does not match the college or university roll number format.`,
          value: rawRoll,
        });
        rowHasError = true;
      } else if (seenRollNumbers.has(normalizedRoll)) {
        const firstSeen = seenRollNumbers.get(normalizedRoll)!;
        errors.push({
          row: rowNumber,
          field: 'rollNumber',
          code: 'DUPLICATE_ROLL_NUMBER_IN_FILE',
          message: `Duplicate roll number "${normalizedRoll}" in CSV (first defined on row ${firstSeen}).`,
          value: normalizedRoll,
        });
        summary.duplicateRollNumbers++;
        rowHasError = true;
      } else {
        seenRollNumbers.set(normalizedRoll, rowNumber);
      }
    }

    // Validate Email
    let normalizedEmail = '';
    if (!rawEmail) {
      errors.push({
        row: rowNumber,
        field: 'email',
        code: 'REQUIRED_FIELD_MISSING',
        message: 'Student email is required.',
      });
      rowHasError = true;
    } else {
      normalizedEmail = rawEmail.toLowerCase();
      if (!EMAIL_REGEX.test(normalizedEmail)) {
        errors.push({
          row: rowNumber,
          field: 'email',
          code: 'INVALID_EMAIL_FORMAT',
          message: `Email "${rawEmail}" is not a valid email address.`,
          value: rawEmail,
        });
        rowHasError = true;
      } else if (seenEmails.has(normalizedEmail)) {
        const firstSeen = seenEmails.get(normalizedEmail)!;
        errors.push({
          row: rowNumber,
          field: 'email',
          code: 'DUPLICATE_EMAIL_IN_FILE',
          message: `Duplicate email "${normalizedEmail}" in CSV (first defined on row ${firstSeen}).`,
          value: normalizedEmail,
        });
        summary.duplicateEmails++;
        rowHasError = true;
      } else {
        seenEmails.set(normalizedEmail, rowNumber);
      }
    }

    // Validate Program
    let normalizedProgram: AcademicProgram | null = null;
    if (!rawProgram) {
      errors.push({
        row: rowNumber,
        field: 'program',
        code: 'REQUIRED_FIELD_MISSING',
        message: 'Degree program is required (BCOM, BBA, or BSC).',
      });
      rowHasError = true;
    } else {
      const upProg = rawProgram.toUpperCase();
      if (!VALID_PROGRAMS.includes(upProg as AcademicProgram)) {
        errors.push({
          row: rowNumber,
          field: 'program',
          code: 'INVALID_PROGRAM',
          message: `Program "${rawProgram}" is invalid. Allowed programs: ${VALID_PROGRAMS.join(', ')}.`,
          value: rawProgram,
        });
        rowHasError = true;
      } else {
        normalizedProgram = upProg as AcademicProgram;
      }
    }

    // Validate Year & Semester
    let parsedYear: number | null = null;
    if (rawYear) {
      const yNum = Number(rawYear);
      if (!Number.isInteger(yNum) || yNum < 1 || yNum > 3) {
        errors.push({
          row: rowNumber,
          field: 'year',
          code: 'INVALID_YEAR',
          message: `Academic year must be 1, 2, or 3 (received "${rawYear}").`,
          value: rawYear,
        });
        rowHasError = true;
      } else {
        parsedYear = yNum;
      }
    }

    let parsedSem: number | null = null;
    if (rawSem) {
      const sNum = Number(rawSem);
      if (!Number.isInteger(sNum) || sNum < 1 || sNum > 6) {
        errors.push({
          row: rowNumber,
          field: 'semester',
          code: 'INVALID_SEMESTER',
          message: `Semester must be an integer between 1 and 6 (received "${rawSem}").`,
          value: rawSem,
        });
        rowHasError = true;
      } else {
        parsedSem = sNum;
      }
    }

    // Academic Year-Semester Alignment Verification
    if (parsedYear !== null && parsedSem !== null) {
      const allowedSems = ACADEMIC_YEAR_SEMESTER_MAP[parsedYear];
      if (allowedSems && !allowedSems.includes(parsedSem)) {
        errors.push({
          row: rowNumber,
          field: 'semester',
          code: 'ACADEMIC_YEAR_SEMESTER_MISMATCH',
          message: `Academic year ${parsedYear} corresponds to semester(s) ${allowedSems.join(', ')}, but received semester ${parsedSem}.`,
          value: { year: parsedYear, semester: parsedSem },
        });
        rowHasError = true;
      }
    } else if (parsedSem !== null && parsedYear === null) {
      // Auto-derive year from semester if omitted
      parsedYear = Math.ceil(parsedSem / 2);
    }

    // Validate Second Language
    let normalizedLanguage: SecondLanguage | null = null;
    if (rawLang) {
      const upLang = rawLang.toUpperCase();
      if (!VALID_LANGUAGES.includes(upLang as SecondLanguage)) {
        errors.push({
          row: rowNumber,
          field: 'secondLanguage',
          code: 'INVALID_LANGUAGE',
          message: `Second language "${rawLang}" is invalid. Allowed languages: ${VALID_LANGUAGES.join(', ')}.`,
          value: rawLang,
        });
        rowHasError = true;
      } else {
        normalizedLanguage = upLang as SecondLanguage;
      }
    }

    // Validate Phone
    let normalizedPhone: string | null = null;
    if (rawPhone) {
      const cleanPhone = rawPhone.replace(/[\s-]/g, '');
      if (!PHONE_REGEX.test(cleanPhone)) {
        errors.push({
          row: rowNumber,
          field: 'phone',
          code: 'INVALID_PHONE',
          message: `Phone number "${rawPhone}" must be a 10-digit Indian mobile number starting with 6-9.`,
          value: rawPhone,
        });
        rowHasError = true;
      } else {
        normalizedPhone = cleanPhone;
      }
    }

    if (rowHasError) {
      summary.invalidRows++;
    } else {
      summary.validRows++;
      if (normalizedProgram) summary.byProgram[normalizedProgram] = (summary.byProgram[normalizedProgram] || 0) + 1;
      if (parsedYear) summary.byYear[parsedYear] = (summary.byYear[parsedYear] || 0) + 1;
      if (parsedSem) summary.bySemester[parsedSem] = (summary.bySemester[parsedSem] || 0) + 1;

      validRecords.push({
        rowNumber,
        name: rawName,
        rollNumber: normalizedRoll,
        email: normalizedEmail,
        program: normalizedProgram!,
        branch: rawBranch || null,
        year: parsedYear,
        semester: parsedSem,
        secondLanguage: normalizedLanguage,
        phone: normalizedPhone,
      });
    }
  });

  return {
    isValid: errors.length === 0,
    totalRows: summary.totalRows,
    validRecords,
    errors,
    summary,
  };
}

/**
 * Pre-flight check against database to detect existing emails and roll numbers.
 */
export async function checkRosterDbCollisions(
  records: StudentRosterRecord[],
  prisma: any
): Promise<{
  existingEmails: string[];
  existingRollNumbers: string[];
  conflicts: Array<{ rollNumber?: string; email?: string; reason: string }>;
}> {
  if (!prisma || records.length === 0) {
    return {
      existingEmails: [],
      existingRollNumbers: [],
      conflicts: [],
    };
  }

  const emails = Array.from(new Set(records.map((r) => r.email)));
  const rollNumbers = Array.from(new Set(records.map((r) => r.rollNumber)));

  const [existingByEmail, existingByRoll] = await Promise.all([
    prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true, rollNumber: true, role: true },
    }),
    prisma.user.findMany({
      where: { rollNumber: { in: rollNumbers } },
      select: { id: true, email: true, rollNumber: true, role: true },
    }),
  ]);

  const existingEmailSet = new Set<string>(existingByEmail.map((u: any) => u.email.toLowerCase()));
  const existingRollSet = new Set<string>(existingByRoll.map((u: any) => u.rollNumber?.toUpperCase()).filter(Boolean));

  const conflicts: Array<{ rollNumber?: string; email?: string; reason: string }> = [];

  for (const record of records) {
    const userWithEmail = existingByEmail.find((u: any) => u.email.toLowerCase() === record.email.toLowerCase());
    const userWithRoll = existingByRoll.find((u: any) => u.rollNumber?.toUpperCase() === record.rollNumber.toUpperCase());

    if (userWithEmail && userWithRoll) {
      if (userWithEmail.id !== userWithRoll.id) {
        conflicts.push({
          email: record.email,
          rollNumber: record.rollNumber,
          reason: `Email "${record.email}" and Roll Number "${record.rollNumber}" belong to two different existing accounts in the database.`,
        });
      }
    } else if (userWithEmail && !userWithRoll) {
      conflicts.push({
        email: record.email,
        rollNumber: record.rollNumber,
        reason: `Email "${record.email}" is already registered in the database with roll number "${userWithEmail.rollNumber || 'none'}".`,
      });
    } else if (!userWithEmail && userWithRoll) {
      conflicts.push({
        email: record.email,
        rollNumber: record.rollNumber,
        reason: `Roll number "${record.rollNumber}" is already registered in the database with email "${userWithRoll.email}".`,
      });
    }
  }

  return {
    existingEmails: Array.from(existingEmailSet),
    existingRollNumbers: Array.from(existingRollSet),
    conflicts,
  };
}
