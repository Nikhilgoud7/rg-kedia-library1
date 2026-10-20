// tests/suites/crossPersonaInventory.test.js — Phase 6G Cross-Persona Physical Inventory & Student/Faculty Visibility Suite
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runCrossPersonaInventoryTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // ---------------------------------------------------------
    // 1. Setup Personas & Books with Physical Copies
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'p6g_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const teacher = await dataManager.createTeacher({ tag: 'p6g_tch' });
    const teacherClient = createApiClient(baseUrl);
    teacherClient.loginAs(teacher);

    const student1 = await dataManager.createStudent({ tag: 'p6g_stu1' });
    const student1Client = createApiClient(baseUrl);
    student1Client.loginAs(student1);

    const student2 = await dataManager.createStudent({ tag: 'p6g_stu2' });
    const student2Client = createApiClient(baseUrl);
    student2Client.loginAs(student2);

    const unauthClient = createApiClient(baseUrl);

    // Create book with 4 physical copies
    const book = await dataManager.createBook({
      title: 'Auditing and Financial Controls in Commerce',
      totalCopies: 4,
      tag: 'p6g_bk',
    });

    const initialCopies = await dataManager.prisma.bookCopy.findMany({
      where: { bookId: book.id },
      orderBy: { copyNumber: 'asc' },
    });
    assert(initialCopies.length === 4, 'Book initialized with exactly 4 physical copies');

    const copy1 = initialCopies[0];
    const copy2 = initialCopies[1];
    const copy3 = initialCopies[2];
    const copy4 = initialCopies[3];

    // Assign custom shelfLocation to copy1
    await dataManager.prisma.bookCopy.update({
      where: { id: copy1.id },
      data: { shelfLocation: 'Rack Commerce-B4' },
    });

    // ---------------------------------------------------------
    // 2. Issue copy1 to Student 1 & copy2 to Teacher
    // ---------------------------------------------------------
    // Student 1 requests book
    const req1 = await dataManager.createBookRequest({
      userId: student1.id,
      bookId: book.id,
      status: 'PENDING',
      type: 'BORROW',
    });

    // Librarian approves with copy1 barcode
    const approveStudentRes = await librarianClient.request('POST', `/api/lending/approve/${req1.id}`, {
      body: { bookCopyId: copy1.id, barcode: copy1.barcode, daysToReturn: 30 },
    });
    assert(approveStudentRes.status === 200, 'Librarian approved student borrow with specific copy1 barcode');

    // Teacher requests book
    const reqTeacher = await dataManager.createBookRequest({
      userId: teacher.id,
      bookId: book.id,
      status: 'PENDING',
      type: 'BORROW',
    });

    // Librarian approves teacher borrow with copy2
    const approveTeacherRes = await librarianClient.request('POST', `/api/lending/approve/${reqTeacher.id}`, {
      body: { bookCopyId: copy2.id, barcode: copy2.barcode, daysToReturn: 30 },
    });
    assert(approveTeacherRes.status === 200, 'Librarian approved teacher borrow with specific copy2 barcode');

    // ---------------------------------------------------------
    // 3. Student Borrowings Verification (GET /api/lending/my-books)
    // ---------------------------------------------------------
    const student1BooksRes = await student1Client.request('GET', '/api/lending/my-books?status=ISSUED');
    assert(student1BooksRes.status === 200, 'Student 1 fetches own active borrowings with HTTP 200');
    assert(student1BooksRes.body?.lendings?.length === 1, 'Student 1 has exactly 1 active checkout');

    const studentLending = student1BooksRes.body.lendings[0];
    assert(studentLending.bookCopyId === copy1.id, 'Active lending matches allocated copy1 ID');
    assert(studentLending.bookCopy?.barcode === copy1.barcode, 'Active lending exposes copy1 barcode to borrower');
    assert(studentLending.bookCopy?.copyNumber === 1, 'Active lending exposes copy1 sequential copyNumber');
    assert(
      studentLending.bookCopy?.shelfLocation === 'Rack Commerce-B4',
      'Active lending exposes accurate copy-level shelfLocation'
    );
    assert(studentLending.fine === 0, 'Zero fine verified on student active borrowing');

    // Cross-user borrowing isolation: Student 2 cannot see Student 1 or Teacher loans
    const student2BooksRes = await student2Client.request('GET', '/api/lending/my-books?status=ISSUED');
    assert(student2BooksRes.status === 200, 'Student 2 fetches own borrowings with HTTP 200');
    assert(student2BooksRes.body?.lendings?.length === 0, 'Student 2 has 0 borrowings (cross-user isolation verified)');

    // ---------------------------------------------------------
    // 4. Student Catalog Copy Privacy Verification (GET /api/books/:id)
    // ---------------------------------------------------------
    const studentDetailRes = await student1Client.request('GET', `/api/books/${book.id}`);
    assert(studentDetailRes.status === 200, 'Student can view book details with HTTP 200');
    const studentBook = studentDetailRes.body?.book;
    assert(Boolean(studentBook), 'Book data present in student response');
    assert(Array.isArray(studentBook.copies), 'Student view includes copies list');
    assert(studentBook.copies.length === 4, 'Student view lists all 4 physical copies');

    // Verify copy details in student view
    const studentCopy1 = studentBook.copies.find((c) => c.id === copy1.id);
    assert(Boolean(studentCopy1), 'Student view contains copy1');
    assert(studentCopy1.status === 'ISSUED', 'Student view reports copy1 status as ISSUED');
    assert(studentCopy1.barcode === copy1.barcode, 'Student view includes copy1 barcode');
    assert(studentCopy1.shelfLocation === 'Rack Commerce-B4', 'Student view includes copy1 rack location');

    // Privacy Guard: Student view MUST NOT contain lendings or borrower identities
    assert(!studentCopy1.lendings, 'Student view strictly omits lendings relation from copies');
    assert(!studentCopy1.user, 'Student view strictly omits user/borrower from copy');
    assert(!studentCopy1.borrower, 'Student view strictly omits borrower object from copy');

    // ---------------------------------------------------------
    // 5. Faculty Borrowings & Catalog View Verification
    // ---------------------------------------------------------
    const teacherBooksRes = await teacherClient.request('GET', '/api/lending/my-books?status=ISSUED');
    assert(teacherBooksRes.status === 200, 'Teacher fetches own borrowings with HTTP 200');
    assert(teacherBooksRes.body?.lendings?.length === 1, 'Teacher has exactly 1 active checkout');
    const teacherLending = teacherBooksRes.body.lendings[0];
    assert(teacherLending.bookCopyId === copy2.id, 'Teacher active lending matches copy2');
    assert(teacherLending.bookCopy?.barcode === copy2.barcode, 'Teacher active lending includes copy2 barcode');

    // Teacher views book details: can see student borrower name & rollNumber for copy lookup
    const teacherDetailRes = await teacherClient.request('GET', `/api/books/${book.id}`);
    assert(teacherDetailRes.status === 200, 'Teacher fetches book details with HTTP 200');
    const teacherCopies = teacherDetailRes.body?.book?.copies || [];
    const teacherViewCopy1 = teacherCopies.find((c) => c.id === copy1.id);
    assert(Boolean(teacherViewCopy1), 'Teacher view contains copy1');
    assert(
      teacherViewCopy1.lendings?.[0]?.user?.rollNumber === student1.rollNumber,
      'Teacher view identifies student borrower rollNumber for classroom copy lookup'
    );
    assert(
      teacherViewCopy1.lendings?.[0]?.user?.name === student1.name,
      'Teacher view identifies student borrower name'
    );
    // Teacher view must NOT leak student phone, email, password, or auth tokens
    const teacherBorrowerUser = teacherViewCopy1.lendings?.[0]?.user || {};
    assert(teacherBorrowerUser.phone === undefined, 'Teacher view does NOT leak student phone');
    assert(teacherBorrowerUser.email === undefined, 'Teacher view does NOT leak student email');
    assert(teacherBorrowerUser.password === undefined, 'Teacher view does NOT leak student password');

    // ---------------------------------------------------------
    // 6. RBAC Integrity: Student Blocked from Admin Inventory Controls
    // ---------------------------------------------------------
    const studentAddCopyRes = await student1Client.request('POST', `/api/books/${book.id}/copies`, {
      body: { count: 1 },
    });
    assert(studentAddCopyRes.status === 403, 'Student is forbidden from adding physical copies (HTTP 403)');

    const studentUpdateCopyRes = await student1Client.request('PUT', `/api/books/copies/${copy1.id}`, {
      body: { condition: 'Fair' },
    });
    assert(studentUpdateCopyRes.status === 403, 'Student is forbidden from updating physical copies (HTTP 403)');

    const studentDeleteCopyRes = await student1Client.request('DELETE', `/api/books/copies/${copy4.id}`);
    assert(studentDeleteCopyRes.status === 403, 'Student is forbidden from deleting physical copies (HTTP 403)');

    const studentReconcileRes = await student1Client.request('POST', `/api/books/${book.id}/reconcile`);
    assert(studentReconcileRes.status === 403, 'Student is forbidden from reconciling inventory (HTTP 403)');

    const studentLookupBarcodeRes = await student1Client.request('GET', `/api/lending/lookup-barcode/${copy1.barcode}`);
    assert(studentLookupBarcodeRes.status === 403, 'Student is forbidden from barcode lookup (HTTP 403)');

    const studentReturnByBarcodeRes = await student1Client.request('POST', '/api/lending/return-by-barcode', {
      body: { barcode: copy1.barcode },
    });
    assert(studentReturnByBarcodeRes.status === 403, 'Student is forbidden from barcode returns (HTTP 403)');

    // ---------------------------------------------------------
    // 7. Data Privacy & Leaked Secrets Scan
    // ---------------------------------------------------------
    assert(
      findLeakedSecrets(student1BooksRes.body).length === 0,
      'Zero sensitive secrets leaked in student /my-books payload'
    );
    assert(
      findLeakedSecrets(studentDetailRes.body).length === 0,
      'Zero sensitive secrets leaked in student /books/:id payload'
    );
    assert(
      findLeakedSecrets(teacherBooksRes.body).length === 0,
      'Zero sensitive secrets leaked in teacher /my-books payload'
    );
    assert(
      findLeakedSecrets(teacherDetailRes.body).length === 0,
      'Zero sensitive secrets leaked in teacher /books/:id payload'
    );
  } finally {
    await dataManager.cleanup();
  }
}
