import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding R.G. Kedia College Library database...');

  // Clean existing data
  await prisma.notification.deleteMany();
  await prisma.examPaper.deleteMany();
  await prisma.bookRequest.deleteMany();
  await prisma.lending.deleteMany();
  await prisma.bookCopy.deleteMany();
  await prisma.bookProgram.deleteMany();
  await prisma.book.deleteMany();
  await prisma.user.deleteMany();

  const isProduction = process.env.NODE_ENV === 'production';
  const forceSeed = process.env.FORCE_SEED === 'true';

  if (isProduction && !forceSeed) {
    console.error('FATAL: Database seeding is blocked in production unless FORCE_SEED=true is explicitly set.');
    process.exit(1);
  }

  const rawSeedPassword = process.env.SEED_PASSWORD;
  if (isProduction && (!rawSeedPassword || rawSeedPassword.length < 12)) {
    console.error('FATAL: SEED_PASSWORD environment variable must be at least 12 characters in production.');
    process.exit(1);
  }

  const seedPassword = rawSeedPassword || 'DemoPass@1234';
  const adminPassword = process.env.ADMIN_PASSWORD || seedPassword;

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(seedPassword, salt);
  const adminPasswordHash = await bcrypt.hash(adminPassword, salt);

  // 1. Create Synthetic Demo Personas
  // Librarian
  const librarian = await prisma.user.create({
    data: {
      name: 'Demo Librarian',
      email: 'demo.librarian@demo.rgkedia.local',
      password: adminPasswordHash,
      role: 'LIBRARIAN',
      phone: '0000000000',
    },
  });

  // Teachers
  const teacher1 = await prisma.user.create({
    data: {
      name: 'Demo Teacher 1',
      email: 'demo.teacher1@demo.rgkedia.local',
      password: passwordHash,
      role: 'TEACHER',
      program: 'BCOM',
      branch: 'General',
      phone: '0000000001',
    },
  });

  const teacher2 = await prisma.user.create({
    data: {
      name: 'Demo Teacher 2',
      email: 'demo.teacher2@demo.rgkedia.local',
      password: passwordHash,
      role: 'TEACHER',
      program: 'BSC',
      branch: 'Computer Science & Data',
      phone: '0000000002',
    },
  });

  const teacher3 = await prisma.user.create({
    data: {
      name: 'Demo Teacher 3',
      email: 'demo.teacher3@demo.rgkedia.local',
      password: passwordHash,
      role: 'TEACHER',
      program: 'BBA',
      branch: 'General Business Administration',
      phone: '0000000003',
    },
  });

  // Students
  const student1 = await prisma.user.create({
    data: {
      name: 'Demo Student 1',
      email: 'demo.student1@demo.rgkedia.local',
      rollNumber: '1052-24-401-001',
      password: passwordHash,
      role: 'STUDENT',
      program: 'BCOM',
      branch: 'Computer Applications',
      year: 2,
      semester: 3,
      secondLanguage: 'HINDI',
      phone: '0000000011',
    },
  });

  const student2 = await prisma.user.create({
    data: {
      name: 'Demo Student 2',
      email: 'demo.student2@demo.rgkedia.local',
      rollNumber: '1052-24-401-045',
      password: passwordHash,
      role: 'STUDENT',
      program: 'BCOM',
      branch: 'Business Analytics',
      year: 3,
      semester: 5,
      secondLanguage: 'TELUGU',
      phone: '0000000012',
    },
  });

  const student3 = await prisma.user.create({
    data: {
      name: 'Demo Student 3',
      email: 'demo.student3@demo.rgkedia.local',
      rollNumber: '1052-24-402-012',
      password: passwordHash,
      role: 'STUDENT',
      program: 'BBA',
      branch: 'General Business Administration',
      year: 1,
      semester: 1,
      secondLanguage: 'ARABIC',
      phone: '0000000013',
    },
  });

  const student4 = await prisma.user.create({
    data: {
      name: 'Demo Student 4',
      email: 'demo.student4@demo.rgkedia.local',
      rollNumber: '1052-24-403-008',
      password: passwordHash,
      role: 'STUDENT',
      program: 'BSC',
      branch: 'Computer Science & Data',
      year: 2,
      semester: 4,
      secondLanguage: 'SANSKRIT',
      phone: '0000000014',
    },
  });

  const student5 = await prisma.user.create({
    data: {
      name: 'Demo Student 5',
      email: 'demo.student5@demo.rgkedia.local',
      rollNumber: '1052-24-401-099',
      password: passwordHash,
      role: 'STUDENT',
      program: 'BCOM',
      branch: 'Honors',
      year: 3,
      semester: 6,
      secondLanguage: 'TELUGU',
      phone: '0000000015',
    },
  });

  // 2. Create Books Catalog with Copies & Program Mapping
  const booksData = [
    {
      title: 'Financial Accounting - Volume I & II',
      author: 'S.P. Jain & K.L. Narang',
      isbn: '978-9352994786',
      publisher: 'Kalyani Publishers',
      edition: '14th Edition',
      publicationYear: 2023,
      category: 'TEXTBOOK',
      segment: 'Accounting & Finance',
      description: 'Comprehensive textbook covering Osmania University syllabus for B.Com (General, Computer Applications, Honors). Covers Journal, Ledger, Trial Balance, Final Accounts, Bank Reconciliation, and Consignment accounts.',
      shelfLocation: 'Rack A-1 (Commerce)',
      copies: 8,
      programs: [
        { program: 'BCOM', branch: 'General' },
        { program: 'BCOM', branch: 'Computer Applications' },
        { program: 'BCOM', branch: 'Honors' },
        { program: 'BCOM', branch: 'Business Analytics' },
        { program: 'BBA', branch: 'General Business Administration' },
      ],
    },
    {
      title: 'Corporate Accounting & Auditing Standards',
      author: 'Dr. S.N. Maheshwari & Dr. S.K. Maheshwari',
      isbn: '978-9352606559',
      publisher: 'Vikas Publishing House',
      edition: '6th Edition',
      publicationYear: 2022,
      category: 'TEXTBOOK',
      segment: 'Accounting & Finance',
      description: 'Issue of shares, Debentures, Valuation of Goodwill and Shares, Amalgamation, Internal Reconstruction and Liquidation of Companies.',
      shelfLocation: 'Rack A-2 (Commerce)',
      copies: 6,
      programs: [
        { program: 'BCOM', branch: 'General' },
        { program: 'BCOM', branch: 'Honors' },
        { program: 'BCOM', branch: 'Business Analytics' },
      ],
    },
    {
      title: 'Business Statistics & Quantitative Techniques',
      author: 'S.P. Gupta & Archana Gupta',
      isbn: '978-8180548628',
      publisher: 'Sultan Chand & Sons',
      edition: '43rd Edition',
      publicationYear: 2023,
      category: 'TEXTBOOK',
      segment: 'Statistics & Analytics',
      description: 'Measures of Central Tendency, Dispersion, Correlation, Regression, Time Series Analysis, Index Numbers and Probability Distributions.',
      shelfLocation: 'Rack B-1 (Statistics)',
      copies: 7,
      programs: [
        { program: 'BCOM', branch: 'General' },
        { program: 'BCOM', branch: 'Business Analytics' },
        { program: 'BBA', branch: 'General Business Administration' },
        { program: 'BSC', branch: 'Statistics' },
        { program: 'BSC', branch: 'Mathematics' },
      ],
    },
    {
      title: 'Python for Data Analytics & Business Intelligence',
      author: 'Wes McKinney',
      isbn: '978-1098104030',
      publisher: "O'Reilly Media",
      edition: '3rd Edition',
      publicationYear: 2022,
      category: 'REFERENCE',
      segment: 'Computer Science & Data',
      description: 'Data analysis with Python, NumPy, Pandas, Matplotlib, Seaborn, and practical case studies in business forecasting and predictive modeling.',
      shelfLocation: 'Rack C-3 (Computers)',
      copies: 5,
      programs: [
        { program: 'BCOM', branch: 'Business Analytics' },
        { program: 'BCOM', branch: 'Computer Applications' },
        { program: 'BSC', branch: 'Computer Science & Data' },
      ],
    },
    {
      title: 'Database Management Systems (DBMS)',
      author: 'Raghu Ramakrishnan & Johannes Gehrke',
      isbn: '978-0072465631',
      publisher: 'McGraw-Hill Education',
      edition: '3rd Edition',
      publicationYear: 2021,
      category: 'TEXTBOOK',
      segment: 'Computer Science & Data',
      description: 'Relational model, SQL queries, normalization, ER diagrams, transaction management, indexing, and NoSQL fundamentals.',
      shelfLocation: 'Rack C-1 (Computers)',
      copies: 6,
      programs: [
        { program: 'BCOM', branch: 'Computer Applications' },
        { program: 'BSC', branch: 'Computer Science & Data' },
      ],
    },
    {
      title: 'Principles and Practice of Management',
      author: 'L.M. Prasad',
      isbn: '978-8180549281',
      publisher: 'Sultan Chand & Sons',
      edition: '10th Edition',
      publicationYear: 2022,
      category: 'TEXTBOOK',
      segment: 'Business & Management',
      description: 'Planning, organizing, staffing, directing, controlling, organizational behavior, decision making, and leadership theories.',
      shelfLocation: 'Rack D-1 (Management)',
      copies: 5,
      programs: [
        { program: 'BBA', branch: 'General Business Administration' },
        { program: 'BCOM', branch: 'General' },
        { program: 'BCOM', branch: 'Honors' },
      ],
    },
    {
      title: 'Differential Calculus & Real Analysis',
      author: 'Shanti Narayan & Dr. P.K. Mittal',
      isbn: '978-8121904711',
      publisher: 'S. Chand Publishing',
      edition: '15th Edition',
      publicationYear: 2020,
      category: 'TEXTBOOK',
      segment: 'Mathematics',
      description: 'Successive differentiation, Mean Value Theorems, Partial Differentiation, Maxima and Minima, Curvature and Asymptotes.',
      shelfLocation: 'Rack E-1 (Maths)',
      copies: 4,
      programs: [
        { program: 'BSC', branch: 'Mathematics' },
        { program: 'BSC', branch: 'Statistics' },
      ],
    },
    {
      title: 'Effective Business English & Communication Skills',
      author: 'R.K. Madhukar',
      isbn: '978-9325983151',
      publisher: 'Vikas Publishing House',
      edition: '5th Edition',
      publicationYear: 2021,
      category: 'LANGUAGE',
      segment: 'Languages & Humanities',
      description: 'First language English textbook: Grammar, report writing, business correspondence, presentation skills, and reading comprehension.',
      shelfLocation: 'Rack L-1 (Languages)',
      copies: 10,
      programs: [
        { program: 'BCOM', branch: null },
        { program: 'BBA', branch: null },
        { program: 'BSC', branch: null },
      ],
    },
    {
      title: 'Telugu Sahitya Sourabham (Second Language Telugu)',
      author: 'Telugu Academy Hyderabad',
      isbn: '978-8178161234',
      publisher: 'Telugu Academy',
      edition: 'Revised 2023',
      publicationYear: 2023,
      category: 'LANGUAGE',
      segment: 'Languages & Humanities',
      description: 'Degree Second Language Telugu textbook containing classical poetry, modern prose, vyakarana, and essay writing.',
      shelfLocation: 'Rack L-2 (Languages)',
      copies: 6,
      programs: [
        { program: 'BCOM', branch: null },
        { program: 'BBA', branch: null },
        { program: 'BSC', branch: null },
      ],
    },
    {
      title: 'Sanskrit Bhasha Praveshika (Second Language Sanskrit)',
      author: 'Dr. K. Varalakshmi',
      isbn: '978-8185012345',
      publisher: 'Samskrita Bharati',
      edition: '4th Edition',
      publicationYear: 2022,
      category: 'LANGUAGE',
      segment: 'Languages & Humanities',
      description: 'Second Language Sanskrit for degree students: Subhashitas, drama excerpts from Kalidasa, sandhi, samasa, and vibhakti rules.',
      shelfLocation: 'Rack L-3 (Languages)',
      copies: 5,
      programs: [
        { program: 'BCOM', branch: null },
        { program: 'BBA', branch: null },
        { program: 'BSC', branch: null },
      ],
    },
    {
      title: 'Hindi Sahitya Darpan (Second Language Hindi)',
      author: 'Dr. Ramkumar Verma',
      isbn: '978-8170281234',
      publisher: 'Rajpal and Sons',
      edition: '6th Edition',
      publicationYear: 2023,
      category: 'LANGUAGE',
      segment: 'Languages & Humanities',
      description: 'Prescribed second language Hindi text: Kabir Ke Dohe, Premchand stories, Hindi Nibandh and Vyakaran.',
      shelfLocation: 'Rack L-4 (Languages)',
      copies: 5,
      programs: [
        { program: 'BCOM', branch: null },
        { program: 'BBA', branch: null },
        { program: 'BSC', branch: null },
      ],
    },
    {
      title: 'Modern Arabic Reader & Grammar (Second Language Arabic)',
      author: 'Dr. Syed Ali',
      isbn: '978-8185123456',
      publisher: 'Markazi Maktaba',
      edition: '3rd Edition',
      publicationYear: 2021,
      category: 'LANGUAGE',
      segment: 'Languages & Humanities',
      description: 'Beginners to intermediate second language Arabic reader covering vocabulary, conversation, and Nahw-Sarf fundamentals.',
      shelfLocation: 'Rack L-5 (Languages)',
      copies: 4,
      programs: [
        { program: 'BCOM', branch: null },
        { program: 'BBA', branch: null },
        { program: 'BSC', branch: null },
      ],
    },
  ];

  const createdBooks = [];
  for (let bookIdx = 0; bookIdx < booksData.length; bookIdx++) {
    const b = booksData[bookIdx];
    const book = await prisma.book.create({
      data: {
        title: b.title,
        author: b.author,
        isbn: b.isbn,
        publisher: b.publisher,
        edition: b.edition,
        publicationYear: b.publicationYear,
        category: b.category,
        segment: b.segment,
        description: b.description,
        totalCopies: b.copies,
        availableCopies: b.copies, // updated when lendings are created below
        shelfLocation: b.shelfLocation,
        copies: {
          create: Array.from({ length: b.copies }, (_, i) => ({
            copyNumber: i + 1,
            condition: i === 0 ? 'Good' : i % 3 === 0 ? 'Fair' : 'Good',
            status: 'AVAILABLE',
            barcode: `RGK-B${bookIdx + 101}-C${i + 1}`,
          })),
        },
        bookPrograms: {
          create: b.programs.map(p => ({
            program: p.program,
            branch: p.branch,
          })),
        },
      },
      include: { copies: true },
    });
    createdBooks.push(book);
  }

  // 3. Create Sample Active Lendings & Adjust Available Copies
  // Lending 1: Rahul has Financial Accounting (copy 1)
  const finAccBook = createdBooks[0];
  const finCopy1 = finAccBook.copies[0];
  const issuedDate1 = new Date();
  issuedDate1.setDate(issuedDate1.getDate() - 5);
  const dueDate1 = new Date();
  dueDate1.setDate(dueDate1.getDate() + 9);

  await prisma.lending.create({
    data: {
      userId: student1.id,
      bookCopyId: finCopy1.id,
      issuedDate: issuedDate1,
      dueDate: dueDate1,
      status: 'ISSUED',
      issuedById: librarian.id,
      notes: 'Semester 3 main study book',
    },
  });
  await prisma.bookCopy.update({ where: { id: finCopy1.id }, data: { status: 'ISSUED' } });
  await prisma.book.update({ where: { id: finAccBook.id }, data: { availableCopies: { decrement: 1 } } });

  // Lending 2: Sai Krishna has Python for Data Analytics (OVERDUE to test overdue notifications!)
  const pythonBook = createdBooks[3];
  const pythonCopy1 = pythonBook.copies[0];
  const issuedDate2 = new Date();
  issuedDate2.setDate(issuedDate2.getDate() - 20);
  const dueDate2 = new Date();
  dueDate2.setDate(dueDate2.getDate() - 6); // 6 days overdue

  await prisma.lending.create({
    data: {
      userId: student2.id,
      bookCopyId: pythonCopy1.id,
      issuedDate: issuedDate2,
      dueDate: dueDate2,
      status: 'ISSUED',
      issuedById: librarian.id,
      notes: 'Capstone analytics project reference',
    },
  });
  await prisma.bookCopy.update({ where: { id: pythonCopy1.id }, data: { status: 'ISSUED' } });
  await prisma.book.update({ where: { id: pythonBook.id }, data: { availableCopies: { decrement: 1 } } });

  // Lending 3: Teacher (Prof. Sunitha) has Corporate Accounting (copy 1)
  const corpAccBook = createdBooks[1];
  const corpCopy1 = corpAccBook.copies[0];
  const issuedDate3 = new Date();
  issuedDate3.setDate(issuedDate3.getDate() - 3);
  const dueDate3 = new Date();
  dueDate3.setDate(dueDate3.getDate() + 25);

  await prisma.lending.create({
    data: {
      userId: teacher1.id,
      bookCopyId: corpCopy1.id,
      issuedDate: issuedDate3,
      dueDate: dueDate3,
      status: 'ISSUED',
      issuedById: librarian.id,
      notes: 'Faculty reference for lecture preparation',
    },
  });
  await prisma.bookCopy.update({ where: { id: corpCopy1.id }, data: { status: 'ISSUED' } });
  await prisma.book.update({ where: { id: corpAccBook.id }, data: { availableCopies: { decrement: 1 } } });

  // 4. Create Sample Book Requests
  // Request 1: Faisal wants Business Statistics
  await prisma.bookRequest.create({
    data: {
      userId: student3.id,
      bookId: createdBooks[2].id,
      type: 'BORROW',
      status: 'PENDING',
      message: 'Need this book for mid-term exam prep in quantitative methods.',
    },
  });

  // Request 2: Ananya wants Database Management Systems
  await prisma.bookRequest.create({
    data: {
      userId: student4.id,
      bookId: createdBooks[4].id,
      type: 'BORROW',
      status: 'PENDING',
      message: 'Required for SQL lab assignments and upcoming project.',
    },
  });

  // Request 3: Teacher Quadri requested Return on Python book from Sai Krishna
  await prisma.bookRequest.create({
    data: {
      userId: student2.id,
      bookId: pythonBook.id,
      type: 'RETURN_REQUEST',
      status: 'PENDING',
      message: 'Dr. M. A. Quadri requested early return: urgently needed for B.Sc Data Science seminar presentation.',
    },
  });

  // 5. Create Exam Guide Papers & Question Banks
  const examPapersData = [
    // B.Com General & Computer Applications
    {
      title: 'Financial Accounting - II (OU Degree Nov 2023)',
      subject: 'Financial Accounting',
      program: 'BCOM',
      branch: 'General',
      year: 2023,
      semester: 2,
      type: 'PREVIOUS_YEAR',
      fileUrl: '/uploads/sample_financial_accounting_2023.pdf',
      description: 'Official Osmania University Semester 2 Regular & Backlog Question Paper with full solution hints.',
      uploadedById: teacher1.id,
    },
    {
      title: 'Business Statistics - I (Important 10 Marks & 5 Marks Qs)',
      subject: 'Business Statistics',
      program: 'BCOM',
      branch: 'Computer Applications',
      year: 2024,
      semester: 3,
      type: 'IMPORTANT_QUESTIONS',
      fileUrl: '/uploads/sample_stats_imp_questions.pdf',
      description: 'Curated list of repeated questions from last 5 years: Mean, Median, Mode, Karl Pearson Correlation, Spearman Rank, and Regression equations.',
      uploadedById: teacher1.id,
    },
    {
      title: 'Corporate Accounting (May 2023 OU Degree Exam)',
      subject: 'Corporate Accounting',
      program: 'BCOM',
      branch: 'Honors',
      year: 2023,
      semester: 4,
      type: 'PREVIOUS_YEAR',
      fileUrl: '/uploads/sample_corp_accounting.pdf',
      description: 'Valuation of Goodwill, Amalgamation in the nature of purchase vs merger, and liquidation liquidator final statement.',
      uploadedById: teacher1.id,
    },
    // BBA
    {
      title: 'Principles of Management (Nov 2023 Question Paper)',
      subject: 'Principles of Management',
      program: 'BBA',
      branch: 'General Business Administration',
      year: 2023,
      semester: 1,
      type: 'PREVIOUS_YEAR',
      fileUrl: '/uploads/sample_mgmt_2023.pdf',
      description: "Classical and Behavioral theories of Management (Taylor, Fayol, Mayo) and Mintzberg's 10 Managerial Roles.",
      uploadedById: teacher3.id,
    },
    {
      title: 'Business Economics & Financial Analysis - Study Guide',
      subject: 'Business Economics',
      program: 'BBA',
      branch: 'General Business Administration',
      year: 2024,
      semester: 2,
      type: 'STUDY_GUIDE',
      fileUrl: '/uploads/sample_bba_econ_guide.pdf',
      description: 'Comprehensive formula sheets for Elasticity of Demand, Break-Even Analysis, Production Functions (Cobb-Douglas), and Cost Curves.',
      uploadedById: teacher3.id,
    },
    // B.Sc Computer Science & Data
    {
      title: 'Database Management Systems (May 2024 Degree Exam)',
      subject: 'DBMS',
      program: 'BSC',
      branch: 'Computer Science & Data',
      year: 2024,
      semester: 4,
      type: 'PREVIOUS_YEAR',
      fileUrl: '/uploads/sample_dbms_2024.pdf',
      description: 'SQL queries on Joins, Nested Subqueries, Boyce-Codd Normal Form (BCNF), ACID properties, and Concurrency 2PL protocols.',
      uploadedById: teacher2.id,
    },
    {
      title: 'Python for Data Science - High Frequency Questions',
      subject: 'Python & Data Science',
      program: 'BSC',
      branch: 'Computer Science & Data',
      year: 2024,
      semester: 5,
      type: 'IMPORTANT_QUESTIONS',
      fileUrl: '/uploads/sample_python_imp_q.pdf',
      description: 'Pandas dataframes slicing, groupby operations, Matplotlib subplots, Scikit-learn Linear Regression and KNN classification code snippets.',
      uploadedById: teacher2.id,
    },
    {
      title: 'Real Analysis & Differential Equations (2023 OU Paper)',
      subject: 'Mathematics',
      program: 'BSC',
      branch: 'Mathematics',
      year: 2023,
      semester: 3,
      type: 'PREVIOUS_YEAR',
      fileUrl: '/uploads/sample_maths_2023.pdf',
      description: 'Rolle’s Theorem, Lagrange Mean Value Theorem, Exact differential equations and Cauchy-Euler homogeneous equations.',
      uploadedById: teacher2.id,
    },
    // Second Languages
    {
      title: 'Second Language Telugu (General Degree Nov 2023)',
      subject: 'Telugu Sahityam',
      program: 'BCOM',
      branch: 'General',
      year: 2023,
      semester: 1,
      type: 'PREVIOUS_YEAR',
      fileUrl: '/uploads/sample_telugu_2023.pdf',
      description: 'Shakuntalopakhyaanam, modern poetry analysis, sandhi-samasalu, and letter writing questions.',
      uploadedById: librarian.id,
    },
    {
      title: 'Second Language Sanskrit (Important Sandhi & Shlokas)',
      subject: 'Sanskrit',
      program: 'BCOM',
      branch: 'Computer Applications',
      year: 2024,
      semester: 2,
      type: 'IMPORTANT_QUESTIONS',
      fileUrl: '/uploads/sample_sanskrit_imp.pdf',
      description: 'Key Subhashitas, Raghuvamsham sloka translations, Shabda-roopas, and Dhatu-roopas for full marks.',
      uploadedById: librarian.id,
    },
  ];

  for (const ep of examPapersData) {
    await prisma.examPaper.create({ data: ep });
  }

  // 6. Notifications
  await prisma.notification.create({
    data: {
      userId: student2.id,
      title: 'Overdue Notice',
      message: 'Your borrowed book "Python for Data Analytics" was due on ' + dueDate2.toLocaleDateString() + '. Please return it to the library as soon as possible.',
      type: 'OVERDUE',
    },
  });

  await prisma.notification.create({
    data: {
      userId: student1.id,
      title: 'Exam Question Papers Available',
      message: 'New B.Com Semester 2 & 3 Question papers and Important Questions have been uploaded to the Exam Guide!',
      type: 'INFO',
    },
  });

  console.log('Database seeding finished successfully! 🎉');
  console.log(`
  Synthetic Demo Personas:
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  👤 LIBRARIAN:
     Email: demo.librarian@demo.rgkedia.local

  👨‍🏫 TEACHERS:
     Email: demo.teacher1@demo.rgkedia.local (Commerce)
     Email: demo.teacher2@demo.rgkedia.local (CS & Data)
     Email: demo.teacher3@demo.rgkedia.local (BBA)

  🎓 STUDENTS:
     Roll No: 1052-24-401-001 (demo.student1@demo.rgkedia.local)
     Roll No: 1052-24-401-045 (demo.student2@demo.rgkedia.local)
     Roll No: 1052-24-402-012 (demo.student3@demo.rgkedia.local)
     Roll No: 1052-24-403-008 (demo.student4@demo.rgkedia.local)
     Roll No: 1052-24-401-099 (demo.student5@demo.rgkedia.local)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
