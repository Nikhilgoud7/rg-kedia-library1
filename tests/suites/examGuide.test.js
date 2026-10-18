// tests/suites/examGuide.test.js — Phase 5E Exam Guide & Academic Material Manager Hardening Suite
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to find project root directory
function findProjectRoot(startDir) {
  let current = startDir;
  while (current !== path.parse(current).root) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return path.resolve(startDir, '..');
}

const rootDir = findProjectRoot(__dirname);
const uploadDir = path.join(rootDir, 'uploads', 'exam-papers');

function isPathInside(childPath, parentDir) {
  const rel = path.relative(parentDir, childPath);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

// Helper to create synthetic FormData with a dummy file for testing
function createPaperFormData({
  title = 'Synthetic Question Paper',
  subject = 'Financial Accounting',
  program = 'BCOM',
  branch = 'General',
  year = 2024,
  semester = 1,
  type = 'PREVIOUS_YEAR',
  description = 'Unit 1 Journal Entries and Unit 2 Depreciation',
  fileName = 'sample-exam-paper.pdf',
  fileContent = '%PDF-1.4 test synthetic content',
  fileMime = 'application/pdf',
} = {}) {
  const form = new FormData();
  if (title !== null) form.append('title', title);
  if (subject !== null) form.append('subject', subject);
  if (program !== null) form.append('program', program);
  if (branch !== null) form.append('branch', branch);
  if (year !== null) form.append('year', String(year));
  if (semester !== null) form.append('semester', String(semester));
  if (type !== null) form.append('type', type);
  if (description !== null) form.append('description', description);

  if (fileName !== null) {
    const blob = new Blob([fileContent], { type: fileMime });
    form.append('file', blob, fileName);
  }

  return form;
}

export async function runExamGuideTests(baseUrl, assert) {
  const dataManager = new TestDataManager();
  const uploadedFilesToCleanup = new Set();

  try {
    // ---------------------------------------------------------
    // 1. Setup Personas
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'eg_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const teacher1 = await dataManager.createTeacher({ tag: 'eg_tch1' });
    const teacher1Client = createApiClient(baseUrl);
    teacher1Client.loginAs(teacher1);

    const teacher2 = await dataManager.createTeacher({ tag: 'eg_tch2' });
    const teacher2Client = createApiClient(baseUrl);
    teacher2Client.loginAs(teacher2);

    const student = await dataManager.createStudent({ tag: 'eg_stu' });
    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(student);

    const unauthClient = createApiClient(baseUrl);

    // ---------------------------------------------------------
    // 2. Upload Tests: Role Authorization & Validation
    // ---------------------------------------------------------

    // A. Student upload attempt -> 403
    const studentForm = createPaperFormData({ title: 'Student Unauthorized Paper' });
    const studentUploadRes = await studentClient.request('POST', '/api/exam/papers', { body: studentForm });
    assert(
      studentUploadRes.status === 403,
      'Student is forbidden from uploading exam papers with HTTP 403',
      `Got status ${studentUploadRes.status}`
    );

    // B. Unauthenticated upload attempt -> 401
    const unauthForm = createPaperFormData({ title: 'Unauth Paper' });
    const unauthUploadRes = await unauthClient.request('POST', '/api/exam/papers', { body: unauthForm });
    assert(
      unauthUploadRes.status === 401,
      'Unauthenticated user cannot upload exam papers with HTTP 401',
      `Got status ${unauthUploadRes.status}`
    );

    // C. Disallowed file extension -> 400
    const badExtForm = createPaperFormData({
      title: 'Disallowed Executable File',
      fileName: 'malicious.exe',
      fileContent: 'MZ binary content',
      fileMime: 'application/octet-stream',
    });
    const badExtRes = await librarianClient.request('POST', '/api/exam/papers', { body: badExtForm });
    assert(
      badExtRes.status === 400,
      'Disallowed file extension (.exe) is rejected with HTTP 400',
      `Got status ${badExtRes.status}`
    );

    // D. Missing required file -> 400
    const noFileForm = createPaperFormData({ fileName: null });
    const noFileRes = await librarianClient.request('POST', '/api/exam/papers', { body: noFileForm });
    assert(
      noFileRes.status === 400,
      'Upload without file is rejected with HTTP 400',
      `Got status ${noFileRes.status}`
    );

    // E. Invalid Program parameter -> 400
    const badProgForm = createPaperFormData({ program: 'ENGINEERING' });
    const badProgRes = await librarianClient.request('POST', '/api/exam/papers', { body: badProgForm });
    assert(
      badProgRes.status === 400,
      'Invalid program (ENGINEERING) is rejected with HTTP 400',
      `Got status ${badProgRes.status}`
    );

    // F. Invalid Semester parameter (< 1 or > 6) -> 400
    const badSemForm = createPaperFormData({ semester: 8 });
    const badSemRes = await librarianClient.request('POST', '/api/exam/papers', { body: badSemForm });
    assert(
      badSemRes.status === 400,
      'Invalid semester (8) is rejected with HTTP 400',
      `Got status ${badSemRes.status}`
    );

    // G. Invalid Year parameter -> 400
    const badYearForm = createPaperFormData({ year: 1980 });
    const badYearRes = await librarianClient.request('POST', '/api/exam/papers', { body: badYearForm });
    assert(
      badYearRes.status === 400,
      'Invalid year (1980) is rejected with HTTP 400',
      `Got status ${badYearRes.status}`
    );

    // H. Invalid Resource Type parameter -> 400
    const badTypeForm = createPaperFormData({ type: 'CHEATSHEET' });
    const badTypeRes = await librarianClient.request('POST', '/api/exam/papers', { body: badTypeForm });
    assert(
      badTypeRes.status === 400,
      'Invalid resource type (CHEATSHEET) is rejected with HTTP 400',
      `Got status ${badTypeRes.status}`
    );

    // ---------------------------------------------------------
    // 3. Successful Uploads & Transactional Audit Logging
    // ---------------------------------------------------------

    // Librarian uploads Paper 1 (BCOM, Sem 1, PREVIOUS_YEAR)
    const libPaperForm = createPaperFormData({
      title: 'Financial Accounting - I Nov 2023',
      subject: 'Financial Accounting',
      program: 'BCOM',
      branch: 'General',
      year: 2023,
      semester: 1,
      type: 'PREVIOUS_YEAR',
      description: 'University final exam paper with ledger problems and trial balance',
      fileName: 'fin-acc-2023.pdf',
    });
    const libUploadRes = await librarianClient.request('POST', '/api/exam/papers', { body: libPaperForm });
    assert(
      libUploadRes.status === 201,
      'Librarian uploads question paper successfully with HTTP 201',
      `Got status ${libUploadRes.status}`
    );
    const libPaper = libUploadRes.data.paper;
    assert(Boolean(libPaper && libPaper.id), 'Librarian upload response includes valid paper id');
    if (libPaper?.fileUrl) uploadedFilesToCleanup.add(libPaper.fileUrl);

    // Teacher 1 uploads Paper 2 (BBA, Sem 2, IMPORTANT_QUESTIONS)
    const tch1PaperForm = createPaperFormData({
      title: 'Marketing Principles Question Bank',
      subject: 'Principles of Marketing',
      program: 'BBA',
      branch: 'General Business Administration',
      year: 2024,
      semester: 2,
      type: 'IMPORTANT_QUESTIONS',
      description: '4Ps of marketing, consumer behavior case studies',
      fileName: 'bba-marketing-bank.pdf',
    });
    const tch1UploadRes = await teacher1Client.request('POST', '/api/exam/papers', { body: tch1PaperForm });
    assert(
      tch1UploadRes.status === 201,
      'Teacher 1 uploads question paper successfully with HTTP 201',
      `Got status ${tch1UploadRes.status}`
    );
    const tch1Paper = tch1UploadRes.data.paper;
    assert(Boolean(tch1Paper && tch1Paper.id), 'Teacher 1 upload response includes valid paper id');
    if (tch1Paper?.fileUrl) uploadedFilesToCleanup.add(tch1Paper.fileUrl);

    // Teacher 2 uploads Paper 3 (BSC, Sem 3, STUDY_GUIDE)
    const tch2PaperForm = createPaperFormData({
      title: 'Database Management Systems Study Notes',
      subject: 'DBMS and SQL',
      program: 'BSC',
      branch: 'Computer Science & Data',
      year: 2024,
      semester: 3,
      type: 'STUDY_GUIDE',
      description: 'Relational algebra, normal forms 1NF to BCNF, ER diagrams',
      fileName: 'bsc-dbms-notes.pdf',
    });
    const tch2UploadRes = await teacher2Client.request('POST', '/api/exam/papers', { body: tch2PaperForm });
    assert(
      tch2UploadRes.status === 201,
      'Teacher 2 uploads study guide successfully with HTTP 201',
      `Got status ${tch2UploadRes.status}`
    );
    const tch2Paper = tch2UploadRes.data.paper;
    assert(Boolean(tch2Paper && tch2Paper.id), 'Teacher 2 upload response includes valid paper id');
    if (tch2Paper?.fileUrl) uploadedFilesToCleanup.add(tch2Paper.fileUrl);

    // Librarian uploads Paper 4 (BCOM, Sem 1, STUDY_GUIDE) for pagination testing
    const libPaper2Form = createPaperFormData({
      title: 'Business Economics Formula Guide',
      subject: 'Business Economics',
      program: 'BCOM',
      branch: 'Honors',
      year: 2024,
      semester: 1,
      type: 'STUDY_GUIDE',
      description: 'Elasticity of demand, indifference curve analysis',
      fileName: 'bcom-economics-guide.pdf',
    });
    const libUpload2Res = await librarianClient.request('POST', '/api/exam/papers', { body: libPaper2Form });
    const libPaper2 = libUpload2Res.data.paper;
    if (libPaper2?.fileUrl) uploadedFilesToCleanup.add(libPaper2.fileUrl);

    // Verify AuditLog for EXAM_PAPER_UPLOADED
    const uploadAudit = await dataManager.prisma.auditLog.findFirst({
      where: {
        action: 'EXAM_PAPER_UPLOADED',
        targetId: libPaper.id,
      },
    });
    assert(Boolean(uploadAudit), 'AuditLog recorded EXAM_PAPER_UPLOADED action');
    assert(uploadAudit?.actorId === librarian.id, 'EXAM_PAPER_UPLOADED AuditLog captures actorId');
    assert(uploadAudit?.targetId === libPaper.id, 'EXAM_PAPER_UPLOADED AuditLog captures paper targetId');

    const auditDetails = uploadAudit?.details ? JSON.parse(uploadAudit.details) : {};
    assert(auditDetails.title === libPaper.title, 'EXAM_PAPER_UPLOADED details contains paper title');
    assert(auditDetails.program === 'BCOM', 'EXAM_PAPER_UPLOADED details contains program');

    // ---------------------------------------------------------
    // 4. Listing, Filtering, Search & Pagination Tests
    // ---------------------------------------------------------

    // A. Program Filtering
    const bcomFilterRes = await studentClient.request('GET', '/api/exam/papers?program=BCOM');
    assert(bcomFilterRes.status === 200, 'GET /api/exam/papers with program=BCOM returns HTTP 200');
    const bcomPapers = bcomFilterRes.data.papers || [];
    assert(
      bcomPapers.length >= 2 && bcomPapers.every((p) => p.program === 'BCOM'),
      'Program filter strictly isolates BCOM exam papers'
    );

    // B. Semester Filtering
    const sem1FilterRes = await studentClient.request('GET', '/api/exam/papers?semester=1');
    assert(sem1FilterRes.status === 200, 'GET /api/exam/papers with semester=1 returns HTTP 200');
    const sem1Papers = sem1FilterRes.data.papers || [];
    assert(
      sem1Papers.length >= 2 && sem1Papers.every((p) => p.semester === 1),
      'Semester filter strictly isolates Semester 1 papers'
    );

    // C. Resource Type Filtering
    const typeFilterRes = await studentClient.request('GET', '/api/exam/papers?type=IMPORTANT_QUESTIONS');
    assert(typeFilterRes.status === 200, 'GET /api/exam/papers with type=IMPORTANT_QUESTIONS returns HTTP 200');
    const typePapers = typeFilterRes.data.papers || [];
    assert(
      typePapers.length >= 1 && typePapers.every((p) => p.type === 'IMPORTANT_QUESTIONS'),
      'Type filter strictly isolates IMPORTANT_QUESTIONS papers'
    );

    // D. Search by Title
    const titleSearchRes = await studentClient.request('GET', '/api/exam/papers?search=Accounting');
    assert(titleSearchRes.status === 200, 'Search by title returns HTTP 200');
    const titleMatches = titleSearchRes.data.papers || [];
    assert(
      titleMatches.length >= 1 && titleMatches.some((p) => p.title.includes('Accounting')),
      'Search query accurately matches exam paper title'
    );

    // E. Search by Subject
    const subjectSearchRes = await studentClient.request('GET', '/api/exam/papers?search=Marketing');
    assert(subjectSearchRes.status === 200, 'Search by subject returns HTTP 200');
    const subjectMatches = subjectSearchRes.data.papers || [];
    assert(
      subjectMatches.length >= 1 && subjectMatches.some((p) => p.subject.includes('Marketing')),
      'Search query accurately matches subject name'
    );

    // F. Search by Description
    const descSearchRes = await studentClient.request('GET', '/api/exam/papers?search=Relational');
    assert(descSearchRes.status === 200, 'Search by description returns HTTP 200');
    const descMatches = descSearchRes.data.papers || [];
    assert(
      descMatches.length >= 1 && descMatches.some((p) => p.description && p.description.includes('Relational')),
      'Search query accurately matches content inside description'
    );

    // G. Server-Side Pagination
    const page1Res = await studentClient.request('GET', '/api/exam/papers?page=1&limit=2');
    assert(page1Res.status === 200, 'GET /api/exam/papers supports pagination params with HTTP 200');
    assert(page1Res.data.papers.length <= 2, 'Page limit bounds returned array to at most 2 items');
    assert(Boolean(page1Res.data.pagination), 'Response includes pagination metadata');
    assert(page1Res.data.pagination.page === 1, 'Pagination metadata correctly reflects page 1');
    assert(page1Res.data.pagination.limit === 2, 'Pagination metadata correctly reflects limit 2');
    assert(page1Res.data.pagination.total >= 4, 'Pagination metadata correctly reflects total count');
    assert(page1Res.data.pagination.totalPages >= 2, 'Pagination metadata accurately computes totalPages');

    // H. Backward Compatibility (Unpaginated requests still receive papers array and total summary)
    const unpaginatedRes = await studentClient.request('GET', '/api/exam/papers');
    assert(unpaginatedRes.status === 200, 'Legacy unpaginated GET /api/exam/papers returns HTTP 200');
    assert(Array.isArray(unpaginatedRes.data.papers), 'Legacy response maintains array under data.papers');
    assert(unpaginatedRes.data.papers.length >= 4, 'Unpaginated request returns all matching papers');

    // ---------------------------------------------------------
    // 5. Deletion Tests & Ownership Protections
    // ---------------------------------------------------------

    // A. Student cannot delete any paper -> 403
    const studentDeleteRes = await studentClient.request('DELETE', `/api/exam/papers/${libPaper.id}`);
    assert(
      studentDeleteRes.status === 403,
      'Student is forbidden from deleting exam papers with HTTP 403',
      `Got status ${studentDeleteRes.status}`
    );

    // B. Teacher cannot delete another user's paper -> 403
    const teacherDeleteOtherRes = await teacher1Client.request('DELETE', `/api/exam/papers/${tch2Paper.id}`);
    assert(
      teacherDeleteOtherRes.status === 403,
      'Teacher cannot delete another teacher paper with HTTP 403',
      `Got status ${teacherDeleteOtherRes.status}`
    );

    // C. Non-existent paper deletion -> 404
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    const notFoundDeleteRes = await librarianClient.request('DELETE', `/api/exam/papers/${nonExistentId}`);
    assert(
      notFoundDeleteRes.status === 404,
      'Deleting non-existent exam paper returns HTTP 404',
      `Got status ${notFoundDeleteRes.status}`
    );

    // D. Teacher deletes their OWN paper -> 200
    const teacherDeleteOwnRes = await teacher1Client.request('DELETE', `/api/exam/papers/${tch1Paper.id}`);
    assert(
      teacherDeleteOwnRes.status === 200,
      'Teacher successfully deletes own uploaded paper with HTTP 200',
      `Got status ${teacherDeleteOwnRes.status}`
    );

    // Verify paper is deleted in database
    const deletedPaperDb = await dataManager.prisma.examPaper.findUnique({ where: { id: tch1Paper.id } });
    assert(deletedPaperDb === null, 'Deleted paper is removed from the database');

    // Verify AuditLog for EXAM_PAPER_DELETED by Teacher
    const teacherDeleteAudit = await dataManager.prisma.auditLog.findFirst({
      where: {
        action: 'EXAM_PAPER_DELETED',
        targetId: tch1Paper.id,
      },
    });
    assert(Boolean(teacherDeleteAudit), 'AuditLog recorded EXAM_PAPER_DELETED for teacher deletion');
    assert(teacherDeleteAudit?.actorId === teacher1.id, 'EXAM_PAPER_DELETED captures teacher actorId');

    // E. Librarian deletes another teacher's paper (Librarian can delete any paper) -> 200
    const librarianDeleteTchPaperRes = await librarianClient.request('DELETE', `/api/exam/papers/${tch2Paper.id}`);
    assert(
      librarianDeleteTchPaperRes.status === 200,
      'Librarian can delete any paper with HTTP 200',
      `Got status ${librarianDeleteTchPaperRes.status}`
    );

    // Verify AuditLog for EXAM_PAPER_DELETED by Librarian
    const libDeleteAudit = await dataManager.prisma.auditLog.findFirst({
      where: {
        action: 'EXAM_PAPER_DELETED',
        targetId: tch2Paper.id,
      },
    });
    assert(Boolean(libDeleteAudit), 'AuditLog recorded EXAM_PAPER_DELETED for librarian deletion');
    assert(libDeleteAudit?.actorId === librarian.id, 'EXAM_PAPER_DELETED captures librarian actorId');

    // ---------------------------------------------------------
    // 6. Security Scans: Zero Secret Leakage
    // ---------------------------------------------------------
    const listLeaks = findLeakedSecrets(unpaginatedRes.data);
    assert(
      listLeaks.length === 0,
      'Zero sensitive security keys leaked in GET /api/exam/papers',
      `Leaked: ${listLeaks.join(', ')}`
    );

    const singlePaperRes = await studentClient.request('GET', `/api/exam/papers/${libPaper.id}`);
    assert(singlePaperRes.status === 200, 'GET /api/exam/papers/:id succeeds with HTTP 200');
    const singleLeaks = findLeakedSecrets(singlePaperRes.data);
    assert(
      singleLeaks.length === 0,
      'Zero sensitive security keys leaked in GET /api/exam/papers/:id',
      `Leaked: ${singleLeaks.join(', ')}`
    );
  } finally {
    // ---------------------------------------------------------
    // 7. Cleanup All Synthetic Data & Uploaded Files
    // ---------------------------------------------------------
    try {
      // Clean up physical files on disk created during tests
      for (const fileUrl of uploadedFilesToCleanup) {
        const relativePath = fileUrl.startsWith('/') ? fileUrl.slice(1) : fileUrl;
        const filePath = path.resolve(rootDir, relativePath);
        if (isPathInside(filePath, uploadDir) && fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch {}
        }
      }
    } catch {}

    await dataManager.cleanup();
  }
}
