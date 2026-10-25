// tests/suites/reportingFoundation.test.js — Phase 10A Reporting & Circulation Foundation Test Suite
import { PrismaClient } from '@prisma/client';
import { createApiClient } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';
import {
  neutralizeFormulaInjection,
  formatCsvCell,
  generateCsv,
} from '../../dist/server/lib/reports/csvExport.js';

export async function runReportingFoundationTests(baseUrl, assert) {
  const prisma = new PrismaClient();
  const dataManager = new TestDataManager();

  try {
    // -------------------------------------------------------------------------
    // Setup Test Personas
    // -------------------------------------------------------------------------
    const student = await dataManager.createStudent({ tag: 'rep_stu' });
    const teacher = await dataManager.createTeacher({ tag: 'rep_tea' });
    const librarian = await dataManager.createLibrarian({ tag: 'rep_lib' });

    const anonClient = createApiClient(baseUrl);
    const studentClient = createApiClient(baseUrl);
    const teacherClient = createApiClient(baseUrl);
    const librarianClient = createApiClient(baseUrl);

    studentClient.loginAs(student);
    teacherClient.loginAs(teacher);
    librarianClient.loginAs(librarian);

    // =========================================================================
    // SECTION A: Authorization Checks
    // =========================================================================

    // 1. Unauthenticated request rejected
    const unauthRes = await anonClient.request('GET', '/api/reports/circulation-summary?startDate=2026-01-01&endDate=2026-12-31');
    assert(
      unauthRes.status === 401,
      'Unauthenticated request to circulation-summary is rejected (HTTP 401)',
      `Got status ${unauthRes.status}`
    );

    // 2. Student request rejected
    const studentRes = await studentClient.request('GET', '/api/reports/circulation-summary?startDate=2026-01-01&endDate=2026-12-31');
    assert(
      studentRes.status === 403,
      'STUDENT role is rejected from accessing reports (HTTP 403)',
      `Got status ${studentRes.status}`
    );

    // 3. Teacher request rejected
    const teacherRes = await teacherClient.request('GET', '/api/reports/circulation-summary?startDate=2026-01-01&endDate=2026-12-31');
    assert(
      teacherRes.status === 403,
      'TEACHER role is rejected from accessing reports (HTTP 403)',
      `Got status ${teacherRes.status}`
    );

    // 4. Librarian can access reports
    const libRes = await librarianClient.request('GET', '/api/reports/circulation-summary?startDate=2026-01-01&endDate=2026-12-31');
    assert(
      libRes.status === 200,
      'LIBRARIAN role can access circulation-summary (HTTP 200)',
      `Got status ${libRes.status}`
    );
    assert(libRes.body?.success === true, 'Circulation summary response returns success: true');

    // =========================================================================
    // SECTION B: Seed Controlled Test Data for Aggregations
    // =========================================================================

    // Create Book A (BCOM)
    const bookA = await dataManager.createBook({
      title: 'Advanced Financial Accounting (10A)',
      author: 'Prof. S. R. Rao',
      isbn: '978-81-999901-0-1',
      totalCopies: 3,
    });
    // Associate with BCOM program
    await prisma.bookProgram.create({
      data: {
        bookId: bookA.id,
        program: 'BCOM',
        branch: 'General',
      },
    });

    // Create Book B (BBA)
    const bookB = await dataManager.createBook({
      title: 'Principles of Marketing Strategy (10A)',
      author: 'Dr. M. Venkat',
      isbn: '978-81-999901-0-2',
      totalCopies: 2,
    });
    await prisma.bookProgram.create({
      data: {
        bookId: bookB.id,
        program: 'BBA',
        branch: null,
      },
    });

    // Fetch Book Copies
    const copyA1 = await prisma.bookCopy.findFirst({ where: { bookId: bookA.id, copyNumber: 1 } });
    const copyA2 = await prisma.bookCopy.findFirst({ where: { bookId: bookA.id, copyNumber: 2 } });
    const copyB1 = await prisma.bookCopy.findFirst({ where: { bookId: bookB.id, copyNumber: 1 } });

    // Seed historical lendings in distinct months/weeks/days of 2026:
    // Loan 1: Issued 2026-03-10, Returned 2026-03-20, Renewals: 1 (Book A)
    const loan1 = await prisma.lending.create({
      data: {
        userId: student.id,
        bookCopyId: copyA1.id,
        issuedDate: new Date('2026-03-10T10:00:00.000Z'),
        dueDate: new Date('2026-03-24T10:00:00.000Z'),
        returnedDate: new Date('2026-03-20T14:30:00.000Z'),
        status: 'RETURNED',
        renewalCount: 1,
      },
    });

    // Loan 2: Issued 2026-03-15, Active ISSUED, Renewals: 0 (Book A)
    const loan2 = await prisma.lending.create({
      data: {
        userId: teacher.id,
        bookCopyId: copyA2.id,
        issuedDate: new Date('2026-03-15T09:00:00.000Z'),
        dueDate: new Date('2026-03-29T09:00:00.000Z'),
        status: 'ISSUED',
        renewalCount: 0,
      },
    });

    // Loan 3: Issued 2026-04-05, Returned 2026-04-12, Renewals: 2 (Book B)
    const loan3 = await prisma.lending.create({
      data: {
        userId: student.id,
        bookCopyId: copyB1.id,
        issuedDate: new Date('2026-04-05T11:00:00.000Z'),
        dueDate: new Date('2026-04-19T11:00:00.000Z'),
        returnedDate: new Date('2026-04-12T16:00:00.000Z'),
        status: 'RETURNED',
        renewalCount: 2,
      },
    });

    // =========================================================================
    // SECTION C: Circulation Summary Aggregations
    // =========================================================================

    // 5. Query March 2026 circulation summary (DAILY)
    const marchSummary = await librarianClient.request(
      'GET',
      '/api/reports/circulation-summary?startDate=2026-03-01&endDate=2026-03-31&period=DAILY'
    );
    assert(marchSummary.status === 200, 'March daily circulation summary returns HTTP 200');
    const marchTotals = marchSummary.body?.data?.totals;
    assert(marchTotals?.totalIssued >= 2, 'March totalIssued counts at least the 2 test loans issued in March');
    assert(marchTotals?.totalReturned >= 1, 'March totalReturned counts at least the 1 test loan returned in March');
    assert(marchTotals?.totalRenewals >= 1, 'March totalRenewals preserves renewal count correctly');

    // 6. Query April 2026 circulation summary (MONTHLY)
    const aprilSummary = await librarianClient.request(
      'GET',
      '/api/reports/circulation-summary?startDate=2026-04-01&endDate=2026-04-30&period=MONTHLY'
    );
    assert(aprilSummary.status === 200, 'April monthly circulation summary returns HTTP 200');
    const aprilData = aprilSummary.body?.data;
    assert(aprilData?.period === 'MONTHLY', 'April summary confirms period: MONTHLY');
    const aprilBucket = aprilData?.breakdown?.find((b) => b.period === '2026-04');
    assert(Boolean(aprilBucket), 'April summary contains 2026-04 breakdown bucket');
    assert(aprilBucket?.issuedCount >= 1, '2026-04 bucket has issuedCount >= 1');
    assert(aprilBucket?.returnedCount >= 1, '2026-04 bucket has returnedCount >= 1');

    // 7. Query WEEKLY aggregation
    const weeklySummary = await librarianClient.request(
      'GET',
      '/api/reports/circulation-summary?startDate=2026-03-01&endDate=2026-03-31&period=WEEKLY'
    );
    assert(weeklySummary.status === 200, 'Weekly circulation summary returns HTTP 200');
    assert(weeklySummary.body?.data?.period === 'WEEKLY', 'Summary confirms period: WEEKLY');
    const hasIsoWeek = weeklySummary.body?.data?.breakdown?.some((b) => /^2026-W\d{2}$/.test(b.period));
    assert(hasIsoWeek, 'Weekly breakdown periods match ISO week format (YYYY-Www)');

    // 8. Date boundary filtering (Zero activity window in 2025)
    const emptySummary = await librarianClient.request(
      'GET',
      '/api/reports/circulation-summary?startDate=2025-01-01&endDate=2025-01-31'
    );
    assert(emptySummary.status === 200, 'Empty date range query returns HTTP 200');
    assert(emptySummary.body?.data?.totals?.totalIssued === 0, 'Zero issued loans in empty window');
    assert(emptySummary.body?.data?.breakdown?.length === 0, 'Empty breakdown array when no records in range');

    // 9. Validation: Missing parameters
    const missingParamsRes = await librarianClient.request('GET', '/api/reports/circulation-summary');
    assert(missingParamsRes.status === 400, 'Missing date parameters returns HTTP 400');
    assert(missingParamsRes.body?.error?.includes('Missing required parameters'), 'Error mentions missing parameters');

    // 10. Validation: Inverted date range
    const invertedDateRes = await librarianClient.request(
      'GET',
      '/api/reports/circulation-summary?startDate=2026-12-31&endDate=2026-01-01'
    );
    assert(invertedDateRes.status === 400, 'Inverted date range returns HTTP 400');
    assert(invertedDateRes.body?.error?.includes('startDate cannot be after endDate'), 'Error notes inverted dates');

    // 11. Validation: Malformed date string
    const malformedDateRes = await librarianClient.request(
      'GET',
      '/api/reports/circulation-summary?startDate=not-a-date&endDate=2026-12-31'
    );
    assert(malformedDateRes.status === 400, 'Malformed date parameter returns HTTP 400');
    assert(malformedDateRes.body?.error?.includes('Invalid date format'), 'Error notes invalid date format');

    // 12. Validation: Invalid period
    const invalidPeriodRes = await librarianClient.request(
      'GET',
      '/api/reports/circulation-summary?startDate=2026-01-01&endDate=2026-12-31&period=HOURLY'
    );
    assert(invalidPeriodRes.status === 400, 'Invalid period parameter returns HTTP 400');
    assert(invalidPeriodRes.body?.error?.includes('Invalid period'), 'Error notes invalid period');

    // =========================================================================
    // SECTION D: Top Borrowed Titles Aggregations
    // =========================================================================

    // 13. Top borrowed titles across all programs
    const topTitlesRes = await librarianClient.request('GET', '/api/reports/top-borrowed?limit=10');
    assert(topTitlesRes.status === 200, 'Top borrowed titles returns HTTP 200');
    assert(topTitlesRes.body?.success === true, 'Top borrowed titles returns success: true');
    const titles = topTitlesRes.body?.data?.titles || [];
    assert(Array.isArray(titles), 'Top borrowed titles returns an array');
    assert(titles.length > 0, 'Top borrowed titles array has items');

    // 14. Descending order validation
    let isSortedDesc = true;
    for (let i = 1; i < titles.length; i++) {
      if (titles[i].borrowCount > titles[i - 1].borrowCount) {
        isSortedDesc = false;
        break;
      }
    }
    assert(isSortedDesc, 'Top borrowed titles are sorted strictly in descending order of borrowCount');

    // 15. Check Book A borrowing count
    const bookAStats = titles.find((t) => t.bookId === bookA.id);
    assert(Boolean(bookAStats), 'Book A appears in top borrowed titles');
    assert(bookAStats?.borrowCount >= 2, 'Book A reflects at least 2 borrowings from test data');
    assert(bookAStats?.programs?.includes('BCOM'), 'Book A reflects BCOM program mapping');

    // 16. Program filter: BBA
    const bbaReport = await librarianClient.request('GET', '/api/reports/top-borrowed?programId=BBA');
    assert(bbaReport.status === 200, 'Program-filtered top borrowed returns HTTP 200');
    const bbaTitles = bbaReport.body?.data?.titles || [];
    const hasNonBba = bbaTitles.some((t) => !t.programs.includes('BBA'));
    assert(!hasNonBba, 'Program-filtered report contains only books mapped to specified program');

    // 17. Result limit enforcement
    const limitedReport = await librarianClient.request('GET', '/api/reports/top-borrowed?limit=1');
    assert(limitedReport.status === 200, 'Bounded limit query returns HTTP 200');
    assert(limitedReport.body?.data?.titles?.length === 1, 'Limit=1 returns exactly 1 title');

    // 18. Invalid limit parameter
    const invalidLimitRes = await librarianClient.request('GET', '/api/reports/top-borrowed?limit=9999');
    assert(invalidLimitRes.status === 400, 'Out-of-range limit parameter returns HTTP 400');

    // 19. Invalid program filter
    const invalidProgRes = await librarianClient.request('GET', '/api/reports/top-borrowed?programId=INVALID');
    assert(invalidProgRes.status === 400, 'Invalid program filter returns HTTP 400');

    // =========================================================================
    // SECTION E: CSV Export Security & Formula Neutralization
    // =========================================================================

    // 20. Unit Test: neutralizeFormulaInjection on trigger characters
    const equalsInj = neutralizeFormulaInjection('=SUM(A1:A10)');
    assert(equalsInj === "'=SUM(A1:A10)", 'Formula injection with = is prepended with apostrophe');

    const plusInj = neutralizeFormulaInjection('+cmd|/c calc!A0');
    assert(plusInj === "'+cmd|/c calc!A0", 'Formula injection with + is prepended with apostrophe');

    const minusInj = neutralizeFormulaInjection('-1+1');
    assert(minusInj === "'-1+1", 'Formula injection with - is prepended with apostrophe');

    const atInj = neutralizeFormulaInjection('@HYPERLINK("http://attacker.com","click")');
    assert(atInj === "'@HYPERLINK(\"http://attacker.com\",\"click\")", 'Formula injection with @ is prepended with apostrophe');

    const tabInj = neutralizeFormulaInjection('\t=MALICIOUS()');
    assert(tabInj === "'\t=MALICIOUS()", 'Leading tab before formula trigger is neutralized');

    const normalText = neutralizeFormulaInjection('Normal Book Title');
    assert(normalText === 'Normal Book Title', 'Safe text without trigger is unmodified');

    // 21. Unit Test: formatCsvCell RFC 4180 Escaping
    const escapedQuotes = formatCsvCell('Book with "Quotes" inside', false);
    assert(escapedQuotes === '"Book with ""Quotes"" inside"', 'Double-quotes are escaped according to RFC 4180');

    const commaCell = formatCsvCell('Author, Senior Lecturer', false);
    assert(commaCell === '"Author, Senior Lecturer"', 'Cells containing commas are quoted');

    const newlineCell = formatCsvCell("First line\nSecond line", false);
    assert(newlineCell === "\"First line\nSecond line\"", 'Cells containing newlines are quoted');

    const unicodeCell = formatCsvCell('హైదరాబాద్ (Telugu Script)', false);
    assert(unicodeCell === 'హైదరాబాద్ (Telugu Script)', 'Unicode text is preserved intact');

    const nullCell = formatCsvCell(null, false);
    assert(nullCell === '', 'Null raw values format to empty string');

    const undefCell = formatCsvCell(undefined, false);
    assert(undefCell === '', 'Undefined raw values format to empty string');

    // 22. CSV Export Endpoint Test: circulation-summary format=csv
    const csvCircRes = await librarianClient.request(
      'GET',
      '/api/reports/circulation-summary?startDate=2026-03-01&endDate=2026-03-31&format=csv'
    );
    assert(csvCircRes.status === 200, 'CSV circulation export returns HTTP 200');
    const circContentType = csvCircRes.headers.get('content-type') || '';
    assert(circContentType.includes('text/csv'), 'CSV endpoint returns Content-Type: text/csv');
    const circBody = typeof csvCircRes.data === 'string' ? csvCircRes.data : '';
    // Verify UTF-8 BOM in unit generator output and check decoded body contents
    const unitCsv = generateCsv([{ test: 1 }], [{ key: 'test', header: 'Test' }], { includeBom: true });
    assert(unitCsv.charCodeAt(0) === 0xFEFF, 'generateCsv prepends UTF-8 BOM character (0xFEFF)');
    assert(circBody.includes('Period,Issued Loans,Returned Loans'), 'CSV header row matches specifications');

    // 23. CSV Export Endpoint Test: top-borrowed format=csv
    const csvTopRes = await librarianClient.request('GET', '/api/reports/top-borrowed?limit=5&format=csv');
    assert(csvTopRes.status === 200, 'CSV top-borrowed export returns HTTP 200');
    const topContentType = csvTopRes.headers.get('content-type') || '';
    assert(topContentType.includes('text/csv'), 'Top borrowed CSV endpoint returns Content-Type: text/csv');
    const topBody = typeof csvTopRes.data === 'string' ? csvTopRes.data : '';
    assert(topBody.includes('Book Title,Author,ISBN,Category'), 'CSV top-borrowed contains expected columns');

    // Clean up created lending rows
    await prisma.lending.deleteMany({
      where: {
        id: { in: [loan1.id, loan2.id, loan3.id] },
      },
    });
  } finally {
    await dataManager.cleanup();
    await prisma.$disconnect();
  }
}
