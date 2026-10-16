// tests/suites/authorization.test.js — Step 4 Role Authorization Matrix Suite
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runAuthorizationTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // 1. Create synthetic personas
    const student = await dataManager.createStudent({ tag: 'authz_stu' });
    const student2 = await dataManager.createStudent({ tag: 'authz_stu2' });
    const teacher = await dataManager.createTeacher({ tag: 'authz_tea' });
    const librarian = await dataManager.createLibrarian({ tag: 'authz_lib' });

    // Create a book with an issued copy to student
    const book = await dataManager.createBook({ title: 'Authorization Matrix Book', totalCopies: 2 });
    const activeLending = await dataManager.createLending({
      userId: student.id,
      bookCopyId: book.copies[0].id,
      status: 'ISSUED',
    });

    const studentClient = createApiClient(baseUrl);
    const teacherClient = createApiClient(baseUrl);
    const librarianClient = createApiClient(baseUrl);

    studentClient.loginAs(student);
    teacherClient.loginAs(teacher);
    librarianClient.loginAs(librarian);

    // 2. Students cannot access librarian-only endpoints
    const stuAdminUsers = await studentClient.request('GET', '/api/admin/users');
    assert(stuAdminUsers.status === 403, 'Student is forbidden from GET /api/admin/users (HTTP 403)', `Got status ${stuAdminUsers.status}`);

    const stuAdminDash = await studentClient.request('GET', '/api/admin/dashboard');
    assert(stuAdminDash.status === 403, 'Student is forbidden from GET /api/admin/dashboard (HTTP 403)', `Got status ${stuAdminDash.status}`);

    const stuCreateBook = await studentClient.request('POST', '/api/books', {
      body: { title: 'Illegal Book', author: 'Hacker', segment: 'Commerce' },
    });
    assert(stuCreateBook.status === 403, 'Student is forbidden from POST /api/books (HTTP 403)', `Got status ${stuCreateBook.status}`);

    const stuRegister = await studentClient.request('POST', '/api/auth/register', {
      body: { name: 'New User', email: 'illegal@example.test', password: 'Pass', role: 'STUDENT' },
    });
    assert(stuRegister.status === 403, 'Student is forbidden from POST /api/auth/register (HTTP 403)', `Got status ${stuRegister.status}`);

    const stuPendingRequests = await studentClient.request('GET', '/api/lending/requests');
    assert(stuPendingRequests.status === 403, 'Student is forbidden from GET /api/lending/requests (HTTP 403)', `Got status ${stuPendingRequests.status}`);

    // 3. Students cannot access teacher-only endpoints
    const stuRequestReturn = await studentClient.request('POST', `/api/lending/request-return/${activeLending.id}`);
    assert(stuRequestReturn.status === 403, 'Student is forbidden from POST /api/lending/request-return (HTTP 403)', `Got status ${stuRequestReturn.status}`);

    // 4. Teachers cannot access librarian-only endpoints
    const teaAdminUsers = await teacherClient.request('GET', '/api/admin/users');
    assert(teaAdminUsers.status === 403, 'Teacher is forbidden from GET /api/admin/users (HTTP 403)', `Got status ${teaAdminUsers.status}`);

    const teaAdminDash = await teacherClient.request('GET', '/api/admin/dashboard');
    assert(teaAdminDash.status === 403, 'Teacher is forbidden from GET /api/admin/dashboard (HTTP 403)', `Got status ${teaAdminDash.status}`);

    const teaCreateBook = await teacherClient.request('POST', '/api/books', {
      body: { title: 'Teacher Book', author: 'Teacher', segment: 'Commerce' },
    });
    assert(teaCreateBook.status === 403, 'Teacher is forbidden from POST /api/books (HTTP 403)', `Got status ${teaCreateBook.status}`);

    const teaApprove = await teacherClient.request('POST', '/api/lending/approve/fake-id');
    assert(teaApprove.status === 403, 'Teacher is forbidden from POST /api/lending/approve (HTTP 403)', `Got status ${teaApprove.status}`);

    // 5. Librarians retain full administrative access
    const libAdminUsers = await librarianClient.request('GET', '/api/admin/users');
    assert(libAdminUsers.status === 200, 'Librarian can access GET /api/admin/users (HTTP 200)', `Got status ${libAdminUsers.status}`);

    const libLendingRequests = await librarianClient.request('GET', '/api/lending/requests');
    assert(libLendingRequests.status === 200, 'Librarian can access GET /api/lending/requests (HTTP 200)', `Got status ${libLendingRequests.status}`);

    // 6. Users cannot modify protected account fields via profile API
    const attemptRoleElevation = await studentClient.request('PUT', '/api/user/profile', {
      body: { role: 'LIBRARIAN', name: 'Student Hacker' },
    });
    assert(attemptRoleElevation.status === 403, 'Profile update rejects elevation to LIBRARIAN role with HTTP 403', `Got status ${attemptRoleElevation.status}`);

    const attemptRollChange = await studentClient.request('PUT', '/api/user/profile', {
      body: { rollNumber: 'NEW-ROLL-1234' },
    });
    assert(attemptRollChange.status === 403, 'Profile update rejects modification of rollNumber with HTTP 403', `Got status ${attemptRollChange.status}`);

    // Legitimate profile update (name and phone only)
    const validProfileUpdate = await studentClient.request('PUT', '/api/user/profile', {
      body: { name: 'Updated Student Name', phone: '9999888877' },
    });
    assert(validProfileUpdate.status === 200, 'Profile update accepts allowed fields (name, phone) with HTTP 200', `Got status ${validProfileUpdate.status}`);

    // 7. Cross-user isolation: student cannot access another student's borrowings
    const stu1Borrowings = await studentClient.request('GET', '/api/lending/my-books');
    assert(stu1Borrowings.status === 200, 'Student 1 fetches own borrowings');
    const stu1LendingIds = (stu1Borrowings.data?.lendings || []).map((l) => l.id);
    assert(stu1LendingIds.includes(activeLending.id), 'Student 1 borrowings contain active lending');

    const student2Client = createApiClient(baseUrl);
    student2Client.loginAs(student2);
    const stu2Borrowings = await student2Client.request('GET', '/api/lending/my-books');
    const stu2LendingIds = (stu2Borrowings.data?.lendings || []).map((l) => l.id);
    assert(!stu2LendingIds.includes(activeLending.id), "Student 2 cannot see Student 1's active lending");

    // 8. Borrower identity masking in book details
    // Student perspective:
    const stuBookDetail = await studentClient.request('GET', `/api/books/${book.id}`);
    assert(stuBookDetail.status === 200, 'Student can view book details');
    const stuCopies = stuBookDetail.data?.book?.copies || [];
    const stuHasBorrowerInfo = stuCopies.some((c) => c.lendings || c.user || c.borrower);
    assert(!stuHasBorrowerInfo, 'Student view masks borrower identities completely');

    // Teacher perspective:
    const teaBookDetail = await teacherClient.request('GET', `/api/books/${book.id}`);
    assert(teaBookDetail.status === 200, 'Teacher can view book details');
    const teaCopies = teaBookDetail.data?.book?.copies || [];
    const issuedCopyTea = teaCopies.find((c) => c.id === book.copies[0].id);
    const teaBorrower = issuedCopyTea?.lendings?.[0]?.user;
    assert(Boolean(teaBorrower?.name && teaBorrower?.rollNumber), 'Teacher view includes borrower name and rollNumber for copy lookup');
    assert(!teaBorrower?.phone && !teaBorrower?.email, 'Teacher view does NOT leak borrower phone or email in book details');

    // Librarian perspective:
    const libBookDetail = await librarianClient.request('GET', `/api/books/${book.id}`);
    assert(libBookDetail.status === 200, 'Librarian can view book details');
    const libCopies = libBookDetail.data?.book?.copies || [];
    const issuedCopyLib = libCopies.find((c) => c.id === book.copies[0].id);
    const libBorrower = issuedCopyLib?.lendings?.[0]?.user;
    assert(Boolean(libBorrower?.name && libBorrower?.rollNumber && libBorrower?.program), 'Librarian view includes full borrower academic record');

    // Secret leak audit on all authorization responses
    const allAuthzLeaks = [
      ...findLeakedSecrets(stuAdminUsers.data),
      ...findLeakedSecrets(stuBookDetail.data),
      ...findLeakedSecrets(teaBookDetail.data),
      ...findLeakedSecrets(libBookDetail.data),
    ];
    assert(allAuthzLeaks.length === 0, 'No authorization response leaked secrets', `Leaked: ${allAuthzLeaks.join(', ')}`);

  } finally {
    await dataManager.cleanup();
  }
}
