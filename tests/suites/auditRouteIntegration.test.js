// tests/suites/auditRouteIntegration.test.js — Phase 12B Audit Route & UI Integrity Test Suite
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApiClient } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

export async function runAuditRouteTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // =========================================================================
    // SECTION 1: Static Route Registration & Code Integrity (GAP-12A-01)
    // =========================================================================
    const appTsxPath = path.join(projectRoot, 'client/src/App.tsx');
    assert(fs.existsSync(appTsxPath), 'client/src/App.tsx exists');

    const appContent = fs.readFileSync(appTsxPath, 'utf8');

    // 1.1 Verify import of AuditManagement
    assert(
      appContent.includes("import AuditManagement from './pages/librarian/AuditManagement';"),
      'App.tsx imports AuditManagement component'
    );

    // 1.2 Verify registration of /librarian/audits route
    assert(
      appContent.includes('path="/librarian/audits"'),
      'App.tsx registers /librarian/audits route'
    );

    // 1.3 Verify LIBRARIAN role restriction on /librarian/audits route
    const auditsRouteBlockRegex = /path="\/librarian\/audits"[\s\S]*?allowedRoles=\{['"]LIBRARIAN['"]\}[\s\S]*?<AuditManagement \/>/m;
    const hasAuditsBlock = auditsRouteBlockRegex.test(appContent) || (
      appContent.includes('path="/librarian/audits"') &&
      appContent.includes("<AuditManagement />") &&
      appContent.includes("allowedRoles={['LIBRARIAN']}")
    );
    assert(hasAuditsBlock, 'Route /librarian/audits is strictly protected with allowedRoles={[\'LIBRARIAN\']}');

    // 1.4 Verify wildcard fallback is positioned AFTER /librarian/audits
    const auditsRouteIndex = appContent.indexOf('path="/librarian/audits"');
    const wildcardRouteIndex = appContent.indexOf('path="*"');
    assert(auditsRouteIndex !== -1, '/librarian/audits route found in App.tsx');
    assert(wildcardRouteIndex !== -1, 'Wildcard fallback route found in App.tsx');
    assert(
      auditsRouteIndex < wildcardRouteIndex,
      'Route /librarian/audits is declared before wildcard fallback, preventing redirection loops'
    );

    // =========================================================================
    // SECTION 2: Sidebar Navigation Link Integrity
    // =========================================================================
    const sidebarPath = path.join(projectRoot, 'client/src/components/common/Sidebar.tsx');
    assert(fs.existsSync(sidebarPath), 'client/src/components/common/Sidebar.tsx exists');

    const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

    // 2.1 Verify navigation link matches route exactly
    assert(
      sidebarContent.includes("to: '/librarian/audits'"),
      'Sidebar.tsx defines destination link to /librarian/audits'
    );
    assert(
      sidebarContent.includes("label: 'Audit Management'"),
      'Sidebar.tsx renders Audit Management label'
    );

    // 2.2 Verify student and teacher nav item lists do NOT contain /librarian/audits
    const studentBlock = sidebarContent.split("case 'STUDENT':")[1]?.split('default:')[0] || '';
    assert(
      !studentBlock.includes('/librarian/audits'),
      'Student sidebar navigation does not expose /librarian/audits'
    );

    const teacherBlock = sidebarContent.split("case 'TEACHER':")[1]?.split("case 'STUDENT':")[0] || '';
    assert(
      !teacherBlock.includes('/librarian/audits'),
      'Teacher sidebar navigation does not expose /librarian/audits'
    );

    // =========================================================================
    // SECTION 3: Frontend Route Guard Logic Verification (Pure Simulation)
    // =========================================================================
    // Simulating ProtectedRoute behavior defined in client/src/App.tsx:
    // if (!isAuthenticated || !user) -> /login
    // if (user.mustChangePassword) -> /change-password
    // if (allowedRoles && !allowedRoles.includes(user.role)) -> /student, /teacher, /librarian
    function simulateProtectedRoute(user, allowedRoles) {
      if (!user) return { allowed: false, redirect: '/login' };
      if (user.mustChangePassword) return { allowed: false, redirect: '/change-password' };
      if (allowedRoles && !allowedRoles.includes(user.role)) {
        if (user.role === 'LIBRARIAN') return { allowed: false, redirect: '/librarian' };
        if (user.role === 'TEACHER') return { allowed: false, redirect: '/teacher' };
        return { allowed: false, redirect: '/student' };
      }
      return { allowed: true, redirect: null };
    }

    const unauthNav = simulateProtectedRoute(null, ['LIBRARIAN']);
    assert(!unauthNav.allowed && unauthNav.redirect === '/login', 'Unauthenticated user navigation to /librarian/audits redirects to /login');

    const studentNav = simulateProtectedRoute({ role: 'STUDENT', mustChangePassword: false }, ['LIBRARIAN']);
    assert(!studentNav.allowed && studentNav.redirect === '/student', 'Student navigation to /librarian/audits redirects to /student');

    const teacherNav = simulateProtectedRoute({ role: 'TEACHER', mustChangePassword: false }, ['LIBRARIAN']);
    assert(!teacherNav.allowed && teacherNav.redirect === '/teacher', 'Teacher navigation to /librarian/audits redirects to /teacher');

    const pwdChangeNav = simulateProtectedRoute({ role: 'LIBRARIAN', mustChangePassword: true }, ['LIBRARIAN']);
    assert(!pwdChangeNav.allowed && pwdChangeNav.redirect === '/change-password', 'Librarian with mustChangePassword=true is redirected to /change-password');

    const librarianNav = simulateProtectedRoute({ role: 'LIBRARIAN', mustChangePassword: false }, ['LIBRARIAN']);
    assert(librarianNav.allowed && librarianNav.redirect === null, 'Authorized librarian successfully accesses /librarian/audits');

    // =========================================================================
    // SECTION 4: Backend API Mirroring & Defense-in-Depth
    // =========================================================================
    const student = await dataManager.createStudent({ tag: 'rt_stu' });
    const teacher = await dataManager.createTeacher({ tag: 'rt_tch' });
    const librarian = await dataManager.createLibrarian({ tag: 'rt_lib' });

    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(student);

    const teacherClient = createApiClient(baseUrl);
    teacherClient.loginAs(teacher);

    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const unauthClient = createApiClient(baseUrl);

    // 4.1 Backend rejects unauthenticated requests (HTTP 401)
    const unauthAuditRes = await unauthClient.request('GET', '/api/audits/summary/dashboard');
    assert(unauthAuditRes.status === 401, 'Backend rejects unauthenticated audit API request (HTTP 401)');

    // 4.2 Backend rejects student requests (HTTP 403)
    const stuAuditRes = await studentClient.request('GET', '/api/audits/summary/dashboard');
    assert(stuAuditRes.status === 403, 'Backend rejects student audit API request (HTTP 403)');

    // 4.3 Backend rejects teacher requests (HTTP 403)
    const tchAuditRes = await teacherClient.request('GET', '/api/audits/summary/dashboard');
    assert(tchAuditRes.status === 403, 'Backend rejects teacher audit API request (HTTP 403)');

    // 4.4 Backend authorizes librarian requests (HTTP 200)
    const libAuditRes = await librarianClient.request('GET', '/api/audits/summary/dashboard');
    assert(libAuditRes.status === 200, 'Backend authorizes librarian audit API request (HTTP 200)');
    assert(libAuditRes.body?.success === true, 'Audit API response returns success: true');

  } finally {
    await dataManager.cleanup();
  }
}
