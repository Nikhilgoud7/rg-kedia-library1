import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET;

export async function runAuthTests(baseUrl, assert) {
  const dataManager = new TestDataManager();
  const api = createApiClient(baseUrl);

  try {
    // Setup synthetic test users
    const student = await dataManager.createStudent({ tag: 'auth_active' });
    const inactiveUser = await dataManager.createStudent({ active: false, tag: 'auth_inactive' });

    // 1. Valid login
    const loginRes = await api.login(student.email, student.plainPassword);
    assert(loginRes.status === 200, 'Valid login returns HTTP 200', `Got status ${loginRes.status}`);
    assert(Boolean(loginRes.cookie), 'Valid login sets rg_kedia_token auth cookie');
    assert(loginRes.data?.user?.email === student.email, 'Valid login returns user profile data');

    // Secret leak check on login payload
    const loginLeaks = findLeakedSecrets(loginRes.data);
    assert(loginLeaks.length === 0, 'Login response does not leak credentials or security counters', `Leaked: ${loginLeaks.join(', ')}`);

    // 2. Invalid password rejection
    const badPassRes = await api.login(student.email, 'WrongPassword123!');
    assert(badPassRes.status === 401, 'Invalid password returns HTTP 401', `Got status ${badPassRes.status}`);
    assert(badPassRes.data?.error === 'Invalid credentials.', 'Invalid password returns generic error message');

    // 3. Inactive account rejection
    const inactiveRes = await api.login(inactiveUser.email, inactiveUser.plainPassword);
    assert(inactiveRes.status === 403, 'Inactive account login returns HTTP 403', `Got status ${inactiveRes.status}`);
    assert(inactiveRes.data?.error?.includes('deactivated'), 'Inactive account returns deactivated message');

    // 4. Protected endpoint without authentication
    const unauthApi = createApiClient(baseUrl);
    const unauthRes = await unauthApi.request('GET', '/api/auth/me');
    assert(unauthRes.status === 401, 'Protected endpoint without auth returns HTTP 401', `Got status ${unauthRes.status}`);

    // 5. Invalid JWT rejection
    const invalidTokenRes = await unauthApi.request('GET', '/api/auth/me', {
      cookie: 'rg_kedia_token=invalid.malformed.token',
    });
    assert(invalidTokenRes.status === 401, 'Invalid malformed JWT returns HTTP 401', `Got status ${invalidTokenRes.status}`);

    // Forged JWT with wrong secret
    const forgedToken = jwt.sign({ id: student.id, v: student.tokenVersion }, 'wrong-secret-key-12345678901234567890');
    const forgedRes = await unauthApi.request('GET', '/api/auth/me', {
      cookie: `rg_kedia_token=${forgedToken}`,
    });
    assert(forgedRes.status === 401, 'Forged JWT with wrong secret returns HTTP 401', `Got status ${forgedRes.status}`);

    // 6. Token-version validation: token missing `v` claim
    const legacyToken = jwt.sign({ id: student.id }, JWT_SECRET, { expiresIn: '1h' });
    const legacyRes = await unauthApi.request('GET', '/api/auth/me', {
      cookie: `rg_kedia_token=${legacyToken}`,
    });
    assert(legacyRes.status === 401, 'Token missing tokenVersion (v) claim is rejected with HTTP 401', `Got status ${legacyRes.status}`);

    // Token with outdated `v` claim
    const outdatedToken = jwt.sign({ id: student.id, v: student.tokenVersion + 99 }, JWT_SECRET, { expiresIn: '1h' });
    const outdatedRes = await unauthApi.request('GET', '/api/auth/me', {
      cookie: `rg_kedia_token=${outdatedToken}`,
    });
    assert(outdatedRes.status === 401, 'Token with mismatched tokenVersion is rejected with HTTP 401', `Got status ${outdatedRes.status}`);

    // 7. Session revocation after logout
    const logoutClient = createApiClient(baseUrl);
    const sessionToLogout = await logoutClient.login(student.email, student.plainPassword);
    const activeCookieBeforeLogout = sessionToLogout.cookie;

    // Verify token works before logout
    const checkBeforeLogout = await logoutClient.request('GET', '/api/auth/me');
    assert(checkBeforeLogout.status === 200, 'Authenticated session works prior to logout');

    // Perform logout
    const logoutRes = await logoutClient.request('POST', '/api/auth/logout');
    assert(logoutRes.status === 200, 'Logout endpoint returns HTTP 200', `Got status ${logoutRes.status}`);

    // Verify that the cookie used prior to logout is now rejected (due to tokenVersion bump)
    const checkAfterLogout = await unauthApi.request('GET', '/api/auth/me', {
      cookie: activeCookieBeforeLogout,
    });
    assert(checkAfterLogout.status === 401, 'Previous session token is revoked after logout (HTTP 401)', `Got status ${checkAfterLogout.status}`);

    // 8. Session revocation after password change
    const pwdChangeUser = await dataManager.createStudent({ tag: 'pwd_change' });
    const pwdChangeClient = createApiClient(baseUrl);
    const pwdLogin = await pwdChangeClient.login(pwdChangeUser.email, pwdChangeUser.plainPassword);
    const activeCookieBeforePwdChange = pwdLogin.cookie;

    const newPassword = 'NewSecretPassword456!';
    const changePwdRes = await pwdChangeClient.request('PUT', '/api/auth/change-password', {
      body: {
        currentPassword: pwdChangeUser.plainPassword,
        newPassword,
      },
    });
    assert(changePwdRes.status === 200, 'Password change returns HTTP 200', `Got status ${changePwdRes.status}`);

    // Verify previous session is invalidated
    const verifyOldSession = await unauthApi.request('GET', '/api/auth/me', {
      cookie: activeCookieBeforePwdChange,
    });
    assert(verifyOldSession.status === 401, 'Old session token is revoked after password change (HTTP 401)', `Got status ${verifyOldSession.status}`);

    // Verify login with new password succeeds
    const newLoginRes = await unauthApi.login(pwdChangeUser.email, newPassword);
    assert(newLoginRes.status === 200, 'Login with new password succeeds with HTTP 200');

    // Secret leak check on /api/auth/me
    const meRes = await newLoginRes && await unauthApi.request('GET', '/api/auth/me');
    const meLeaks = findLeakedSecrets(meRes?.data);
    assert(meLeaks.length === 0, 'Profile response does not leak credentials or security counters', `Leaked: ${meLeaks.join(', ')}`);

  } finally {
    await dataManager.cleanup();
  }
}
