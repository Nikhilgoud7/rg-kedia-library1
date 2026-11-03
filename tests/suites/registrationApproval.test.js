// tests/suites/registrationApproval.test.js
// Student & Teacher Self-Registration with Librarian Approval Verification Suite
import crypto from 'crypto';
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runRegistrationApprovalTests(baseUrl, assert) {
  const dataManager = new TestDataManager();
  const prisma = dataManager.prisma;
  const api = createApiClient(baseUrl);

  try {
    const sessionNonce = crypto.randomBytes(3).toString('hex');
    const studentEmail = `reg_student_${sessionNonce}@rgkedia.edu.in`;
    const studentRoll = `1052-26-401-${Math.floor(100 + Math.random() * 899)}`;
    const studentPassword = 'StudentPass123!';

    const teacherEmail = `reg_faculty_${sessionNonce}@rgkedia.edu.in`;
    const teacherPassword = 'FacultyPass123!';

    // Setup a librarian to review registrations
    const librarian = await dataManager.createLibrarian({ tag: 'reg_admin' });
    const librarianApi = createApiClient(baseUrl);
    const libLogin = await librarianApi.login(librarian.email, librarian.plainPassword);
    assert(libLogin.status === 200, 'Librarian can log in to review registrations');

    // ─────────────────────────────────────────────────────────────
    // 1. Student Self-Registration
    // ─────────────────────────────────────────────────────────────
    // 1.1 Password mismatch check
    const mismatchRes = await api.request('POST', '/api/auth/register/student', {
      body: {
        name: 'Test Student',
        email: studentEmail,
        rollNumber: studentRoll,
        program: 'BCOM',
        branch: 'Computer Applications',
        semester: 1,
        gender: 'MALE',
        password: studentPassword,
        confirmPassword: 'MismatchPassword123!',
      },
    });
    assert(mismatchRes.status === 400, 'Student registration rejects mismatched passwords with HTTP 400');

    // 1.2 Weak password check (< 8 chars)
    const weakPassRes = await api.request('POST', '/api/auth/register/student', {
      body: {
        name: 'Test Student',
        email: studentEmail,
        rollNumber: studentRoll,
        program: 'BCOM',
        semester: 1,
        gender: 'MALE',
        password: 'short',
        confirmPassword: 'short',
      },
    });
    assert(weakPassRes.status === 400, 'Student registration rejects passwords < 8 chars with HTTP 400');

    // 1.3 Successful student registration
    const studentRegRes = await api.request('POST', '/api/auth/register/student', {
      body: {
        name: `Student Applicant ${sessionNonce}`,
        email: studentEmail,
        rollNumber: studentRoll,
        program: 'BCOM',
        branch: 'Computer Applications',
        semester: 1,
        gender: 'MALE',
        phone: '9876543210',
        password: studentPassword,
        confirmPassword: studentPassword,
      },
    });

    assert(studentRegRes.status === 201, 'Student self-registration returns HTTP 201', `Got status ${studentRegRes.status}`);
    assert(studentRegRes.data?.user?.role === 'STUDENT', 'Registered user role is STUDENT');
    assert(studentRegRes.data?.user?.approvalStatus === 'PENDING', 'Student registered with approvalStatus PENDING');

    // Track for guaranteed cleanup
    if (studentRegRes.data?.user?.id) {
      dataManager.createdUserIds.add(studentRegRes.data.user.id);
    }

    // Secret leakage verification
    const leaks = findLeakedSecrets(studentRegRes.data);
    assert(leaks.length === 0, 'Student registration response does not leak credentials', `Leaked: ${leaks.join(', ')}`);

    // Verify DB state
    const studentDbRecord = await prisma.user.findUnique({ where: { email: studentEmail } });
    assert(Boolean(studentDbRecord), 'Student user record persisted in database');
    assert(studentDbRecord?.active === false, 'Pending student account has active=false');
    assert(studentDbRecord?.approvalStatus === 'PENDING', 'Database approvalStatus is PENDING');

    // 1.4 Duplicate email registration rejection
    const dupEmailRes = await api.request('POST', '/api/auth/register/student', {
      body: {
        name: 'Duplicate Student',
        email: studentEmail,
        rollNumber: `NEW-ROLL-${sessionNonce}`,
        program: 'BCOM',
        semester: 1,
        gender: 'FEMALE',
        password: studentPassword,
        confirmPassword: studentPassword,
      },
    });
    assert(dupEmailRes.status === 409, 'Duplicate student email returns HTTP 409 Conflict');

    // 1.5 Duplicate roll number registration rejection
    const dupRollRes = await api.request('POST', '/api/auth/register/student', {
      body: {
        name: 'Duplicate Roll Student',
        email: `other_${sessionNonce}@rgkedia.edu.in`,
        rollNumber: studentRoll,
        program: 'BCOM',
        semester: 1,
        gender: 'FEMALE',
        password: studentPassword,
        confirmPassword: studentPassword,
      },
    });
    assert(dupRollRes.status === 409, 'Duplicate roll number returns HTTP 409 Conflict');

    // ─────────────────────────────────────────────────────────────
    // 2. Teacher Self-Registration
    // ─────────────────────────────────────────────────────────────
    const teacherRegRes = await api.request('POST', '/api/auth/register/teacher', {
      body: {
        name: `Faculty Applicant ${sessionNonce}`,
        email: teacherEmail,
        program: 'Commerce',
        branch: 'Financial Accounting',
        gender: 'FEMALE',
        phone: '9123456780',
        password: teacherPassword,
        confirmPassword: teacherPassword,
      },
    });

    assert(teacherRegRes.status === 201, 'Teacher self-registration returns HTTP 201', `Got status ${teacherRegRes.status}`);
    assert(teacherRegRes.data?.user?.role === 'TEACHER', 'Registered user role is TEACHER');
    assert(teacherRegRes.data?.user?.approvalStatus === 'PENDING', 'Teacher registered with approvalStatus PENDING');

    if (teacherRegRes.data?.user?.id) {
      dataManager.createdUserIds.add(teacherRegRes.data.user.id);
    }

    // Verify DB state & critical requirement: NO Staff ID or rollNumber required/stored
    const teacherDbRecord = await prisma.user.findUnique({ where: { email: teacherEmail } });
    assert(Boolean(teacherDbRecord), 'Teacher user record persisted in database');
    assert(teacherDbRecord?.active === false, 'Pending teacher account has active=false');
    assert(teacherDbRecord?.approvalStatus === 'PENDING', 'Database approvalStatus is PENDING');
    assert(teacherDbRecord?.rollNumber === null, 'Teachers do NOT have a staff ID or rollNumber');
    assert(teacherDbRecord?.semester === null, 'Teachers do NOT have a semester');

    // ─────────────────────────────────────────────────────────────
    // 3. Pending Account Login Gatekeeping
    // ─────────────────────────────────────────────────────────────
    // Student pending login attempt
    const pendingStudentLogin = await api.login(studentEmail, studentPassword);
    assert(pendingStudentLogin.status === 403, 'Pending student login is blocked with HTTP 403');
    assert(pendingStudentLogin.data?.code === 'REGISTRATION_PENDING', 'Returns code REGISTRATION_PENDING');
    assert(
      pendingStudentLogin.data?.error?.includes('awaiting librarian approval'),
      'Returns descriptive message explaining awaiting librarian approval'
    );
    assert(!pendingStudentLogin.cookie, 'No authentication cookie issued to pending student');

    // Teacher pending login attempt
    const pendingTeacherLogin = await api.login(teacherEmail, teacherPassword);
    assert(pendingTeacherLogin.status === 403, 'Pending teacher login is blocked with HTTP 403');
    assert(pendingTeacherLogin.data?.code === 'REGISTRATION_PENDING', 'Returns code REGISTRATION_PENDING');
    assert(!pendingTeacherLogin.cookie, 'No authentication cookie issued to pending teacher');

    // ─────────────────────────────────────────────────────────────
    // 4. Librarian Review & Approval Workflow
    // ─────────────────────────────────────────────────────────────
    // 4.1 Unauthorized access check to /api/admin/registrations
    const unauthApi = createApiClient(baseUrl);
    const unauthRegs = await unauthApi.request('GET', '/api/admin/registrations');
    assert(unauthRegs.status === 401, 'Unauthenticated user cannot access registrations (HTTP 401)');

    // 4.2 Librarian views pending registration queue
    const queueRes = await librarianApi.request('GET', '/api/admin/registrations?status=PENDING');
    assert(queueRes.status === 200, 'Librarian can fetch pending registrations queue (HTTP 200)');
    const pendingItems = queueRes.data?.registrations || [];
    const foundStudent = pendingItems.find((r) => r.id === studentRegRes.data.user.id);
    const foundTeacher = pendingItems.find((r) => r.id === teacherRegRes.data.user.id);
    assert(Boolean(foundStudent), 'Newly registered student appears in pending queue');
    assert(Boolean(foundTeacher), 'Newly registered teacher appears in pending queue');

    // 4.3 Librarian approves student registration
    const approveRes = await librarianApi.request('PUT', `/api/admin/registrations/${foundStudent.id}/approve`);
    assert(approveRes.status === 200, 'Librarian can approve student registration (HTTP 200)');
    assert(approveRes.data?.user?.approvalStatus === 'APPROVED', 'Approval returns approvalStatus APPROVED');
    assert(approveRes.data?.user?.active === true, 'Approved account is activated (active=true)');

    // Verify DB update
    const approvedStudentDb = await prisma.user.findUnique({ where: { id: foundStudent.id } });
    assert(approvedStudentDb?.approvalStatus === 'APPROVED', 'Student DB record has approvalStatus APPROVED');
    assert(approvedStudentDb?.active === true, 'Student DB record has active=true');
    assert(approvedStudentDb?.approvedById === librarian.id, 'Student DB record records approving librarian ID');
    assert(Boolean(approvedStudentDb?.approvedAt), 'Student DB record records approval timestamp');

    // 4.4 Newly approved student logs in successfully
    const approvedStudentLogin = await api.login(studentEmail, studentPassword);
    assert(approvedStudentLogin.status === 200, 'Newly approved student can now log in successfully (HTTP 200)');
    assert(Boolean(approvedStudentLogin.cookie), 'Approved student receives auth session cookie');
    assert(approvedStudentLogin.data?.user?.email === studentEmail, 'Returns authenticated student user profile');

    // ─────────────────────────────────────────────────────────────
    // 5. Librarian Rejection Workflow
    // ─────────────────────────────────────────────────────────────
    // 5.1 Librarian rejects teacher registration with a reason
    const rejectionReason = 'Department details could not be verified with college administration.';
    const rejectRes = await librarianApi.request('PUT', `/api/admin/registrations/${foundTeacher.id}/reject`, {
      body: { reason: rejectionReason },
    });
    assert(rejectRes.status === 200, 'Librarian can reject teacher registration (HTTP 200)');
    assert(rejectRes.data?.user?.approvalStatus === 'REJECTED', 'Rejection returns approvalStatus REJECTED');
    assert(rejectRes.data?.user?.active === false, 'Rejected account remains inactive (active=false)');
    assert(rejectRes.data?.user?.rejectionReason === rejectionReason, 'Rejection reason is recorded');

    // Verify DB update
    const rejectedTeacherDb = await prisma.user.findUnique({ where: { id: foundTeacher.id } });
    assert(rejectedTeacherDb?.approvalStatus === 'REJECTED', 'Teacher DB record has approvalStatus REJECTED');
    assert(rejectedTeacherDb?.active === false, 'Teacher DB record has active=false');
    assert(rejectedTeacherDb?.rejectionReason === rejectionReason, 'Teacher DB record has rejection reason stored');

    // 5.2 Rejected teacher login attempt
    const rejectedApi = createApiClient(baseUrl);
    const rejectedTeacherLogin = await rejectedApi.login(teacherEmail, teacherPassword);
    assert(rejectedTeacherLogin.status === 403, 'Rejected user login is blocked with HTTP 403');
    assert(rejectedTeacherLogin.data?.code === 'REGISTRATION_REJECTED', 'Returns code REGISTRATION_REJECTED');
    assert(
      rejectedTeacherLogin.data?.error?.includes(rejectionReason),
      'Returns message including the specific rejection reason'
    );
    assert(!rejectedTeacherLogin.cookie, 'No session cookie issued to rejected user');

    // ─────────────────────────────────────────────────────────────
    // 6. Security & Authorization Defenses
    // ─────────────────────────────────────────────────────────────
    // 6.1 A regular student cannot approve registrations
    const studentApi = createApiClient(baseUrl);
    await studentApi.login(studentEmail, studentPassword);
    const studentUnauthorizedApprove = await studentApi.request('PUT', `/api/admin/registrations/${foundTeacher.id}/approve`);
    assert(studentUnauthorizedApprove.status === 403, 'Student cannot approve registrations (HTTP 403)');

    // 6.2 Cannot reject a librarian account
    const rejectLibrarianRes = await librarianApi.request('PUT', `/api/admin/registrations/${librarian.id}/reject`, {
      body: { reason: 'Test' },
    });
    assert(rejectLibrarianRes.status === 400, 'Cannot reject librarian accounts (HTTP 400)');

    // ─────────────────────────────────────────────────────────────
    // 7. Regression Check: Existing Demo Accounts & Personas Continue Working
    // ─────────────────────────────────────────────────────────────
    // All existing accounts in DB have valid approvalStatus ('APPROVED' by default)
    const existingUsers = await prisma.user.findMany({ take: 10 });
    for (const u of existingUsers) {
      assert(
        u.approvalStatus === 'APPROVED' || u.approvalStatus === 'PENDING' || u.approvalStatus === 'REJECTED',
        `User ${u.email} has valid approvalStatus: ${u.approvalStatus}`
      );
    }

    // Verify existing active student created prior to self-registration logs in
    const testStudent = await dataManager.createStudent({ tag: 'reg_legacy' });
    const legacyStudentLogin = await createApiClient(baseUrl).login(testStudent.email, testStudent.plainPassword);
    assert(legacyStudentLogin.status === 200, 'Existing student continues to log in normally (HTTP 200)');

    // Verify existing active teacher created prior to self-registration logs in
    const testTeacher = await dataManager.createTeacher({ tag: 'reg_legacy' });
    const legacyTeacherLogin = await createApiClient(baseUrl).login(testTeacher.email, testTeacher.plainPassword);
    assert(legacyTeacherLogin.status === 200, 'Existing teacher continues to log in normally (HTTP 200)');
  } finally {
    await dataManager.cleanup();
  }
}
