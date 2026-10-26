// tests/suites/auditAnnualInstitutional.test.js — Phase 11E Annual Institutional Audit Test Suite
import { PrismaClient } from '@prisma/client';
import { createApiClient } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runAuditAnnualInstitutionalTests(baseUrl, assert) {
  const prisma = new PrismaClient();
  const dataManager = new TestDataManager();
  const createdAuditIds = [];

  try {
    // -------------------------------------------------------------------------
    // Setup Test Personas & Test Data
    // -------------------------------------------------------------------------
    const bcomStudent = await dataManager.createStudent({ tag: 'ann_bcom', program: 'BCOM', branch: 'General' });
    const bbaStudent = await dataManager.createStudent({ tag: 'ann_bba', program: 'BBA' });
    const bscStudent = await dataManager.createStudent({ tag: 'ann_bsc', program: 'BSC', branch: 'Computer Science' });
    const teacher = await dataManager.createTeacher({ tag: 'ann_tea' });
    const librarian = await dataManager.createLibrarian({ tag: 'ann_lib' });

    const anonClient = createApiClient(baseUrl);
    const studentClient = createApiClient(baseUrl);
    const teacherClient = createApiClient(baseUrl);
    const librarianClient = createApiClient(baseUrl);

    studentClient.loginAs(bcomStudent);
    teacherClient.loginAs(teacher);
    librarianClient.loginAs(librarian);

    // Create books and circulation records within Academic Year 2025-2026 (June 1, 2025 to May 31, 2026)
    const book = await dataManager.createBook({
      title: 'Institutional Economics and Business Law',
      category: 'TEXTBOOK',
      totalCopies: 4,
    });

    const copies = await prisma.bookCopy.findMany({ where: { bookId: book.id } });

    // Create lendings across different programs in Academic Year 2025-2026
    const ayLoanDate = new Date('2025-10-15T10:00:00Z');
    const ayDueDate = new Date('2025-10-29T10:00:00Z');

    await prisma.lending.createMany({
      data: [
        {
          userId: bcomStudent.id,
          bookCopyId: copies[0].id,
          issuedDate: ayLoanDate,
          dueDate: ayDueDate,
          status: 'RETURNED',
          returnedDate: new Date('2025-10-25T11:00:00Z'),
          issuedById: librarian.id,
        },
        {
          userId: bbaStudent.id,
          bookCopyId: copies[1].id,
          issuedDate: ayLoanDate,
          dueDate: ayDueDate,
          status: 'ISSUED',
          issuedById: librarian.id,
        },
        {
          userId: bscStudent.id,
          bookCopyId: copies[2].id,
          issuedDate: ayLoanDate,
          dueDate: ayDueDate,
          status: 'ISSUED',
          issuedById: librarian.id,
        },
        {
          userId: teacher.id,
          bookCopyId: copies[3].id,
          issuedDate: ayLoanDate,
          dueDate: ayDueDate,
          status: 'ISSUED',
          issuedById: librarian.id,
        },
      ],
    });

    // =========================================================================
    // SECTION A: Initiate Annual Institutional Audit
    // =========================================================================
    const createAnnualRes = await librarianClient.request('POST', '/api/audits', {
      body: {
        type: 'ANNUAL',
        title: 'Annual Institutional Library Audit & Governance Review — AY 2025-2026',
        periodStart: '2025-06-01',
        periodEnd: '2026-05-31',
        academicYear: '2025-2026',
        observations: 'Full statutory compliance review for Osmania University inspection.',
        recommendations: 'Expand digital catalog and enhance barcoding speed.',
      },
    });

    assert(createAnnualRes.status === 201, 'Librarian can create ANNUAL audit (HTTP 201)', `Got status ${createAnnualRes.status}`);
    const annualAudit = createAnnualRes.body.data;
    createdAuditIds.push(annualAudit.id);

    // =========================================================================
    // SECTION B: Authorization Validation
    // =========================================================================
    const anonRes = await anonClient.request('GET', `/api/audits/${annualAudit.id}/report`);
    assert(anonRes.status === 401, 'Anonymous user rejected from annual report (HTTP 401)', `Got status ${anonRes.status}`);

    const stuRes = await studentClient.request('GET', `/api/audits/${annualAudit.id}/report`);
    assert(stuRes.status === 403, 'Student rejected from annual report (HTTP 403)', `Got status ${stuRes.status}`);

    const teaRes = await teacherClient.request('GET', `/api/audits/${annualAudit.id}/report`);
    assert(teaRes.status === 403, 'Teacher rejected from annual report (HTTP 403)', `Got status ${teaRes.status}`);

    // =========================================================================
    // SECTION C: Annual Report Compilation & Program Circulation Breakdown
    // =========================================================================
    const reportRes = await librarianClient.request('GET', `/api/audits/${annualAudit.id}/report`);
    assert(reportRes.status === 200, 'Librarian can fetch annual audit report (HTTP 200)', `Got status ${reportRes.status}`);

    const report = reportRes.body.data;
    assert(Boolean(report.annualInstitutional), 'Report contains annualInstitutional section');
    const annual = report.annualInstitutional;

    // Verify institutional header
    assert(annual.institution.includes('R.G. Kedia College'), 'Identifies institution as R.G. Kedia College');
    assert(annual.affiliation.includes('Osmania University'), 'Identifies affiliation as Osmania University');
    assert(annual.academicYear === '2025-2026', 'Academic year matches 2025-2026');

    // Verify Program Circulation breakdown
    assert(annual.programCirculation.bcom >= 1, 'B.Com circulation tracked');
    assert(annual.programCirculation.bba >= 1, 'BBA circulation tracked');
    assert(annual.programCirculation.bsc >= 1, 'B.Sc circulation tracked');
    assert(annual.programCirculation.faculty >= 1, 'Faculty circulation tracked');
    assert(annual.programCirculation.totalLendingsInAcademicYear >= 4, 'Total AY loans accounted for');

    // Verify Regulatory Compliance tracking
    assert(typeof annual.regulatoryCompliance.monthlyAuditsConducted === 'number', 'monthlyAuditsConducted is a number');
    assert(typeof annual.regulatoryCompliance.reconciliationRatePercentage === 'number', 'reconciliationRatePercentage is a number');

    // Verify Prior Year Baseline Disclosure
    assert(
      annual.priorYearComparison.disclosure.length > 0,
      'Contains explicit institutional disclosure on prior year baseline comparison'
    );

    // =========================================================================
    // SECTION D: Freezing Annual Snapshot & State Finalization
    // =========================================================================
    const freezeRes = await librarianClient.request('POST', `/api/audits/${annualAudit.id}/compile-snapshot`, { body: {} });
    assert(freezeRes.status === 200, 'Annual audit snapshot compiled and frozen (HTTP 200)', `Got status ${freezeRes.status}`);

    // Advance the annual audit to IN_PROGRESS then COMPLETED
    await librarianClient.request('PATCH', `/api/audits/${annualAudit.id}/status`, {
      body: { status: 'IN_PROGRESS' },
    });
    const closeRes = await librarianClient.request('PATCH', `/api/audits/${annualAudit.id}/status`, {
      body: { status: 'COMPLETED' },
    });
    assert(closeRes.status === 200, 'Annual audit advanced to COMPLETED');

    const finalReportRes = await librarianClient.request('GET', `/api/audits/${annualAudit.id}/report`);
    assert(finalReportRes.status === 200, 'Retrieve frozen annual report');
    assert(finalReportRes.body.isFrozenSnapshot === true, 'Served from frozen snapshotData');

  } finally {
    if (createdAuditIds.length > 0) {
      await prisma.libraryAudit.deleteMany({
        where: { id: { in: createdAuditIds } },
      }).catch(() => {});
    }
    await dataManager.cleanup();
    await prisma.$disconnect();
  }
}
