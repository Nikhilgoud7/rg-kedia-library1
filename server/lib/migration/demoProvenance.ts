// server/lib/migration/demoProvenance.ts — Multi-Factor Demo Account Provenance & Classification Engine

import { PrismaClient } from '@prisma/client';
import {
  AccountClassification,
  ProvenanceDetails,
  DemoAccountInventory,
} from './types.js';

export interface CanonicalSeedPersona {
  email: string;
  name: string;
  role: 'STUDENT' | 'TEACHER' | 'LIBRARIAN';
  phone: string;
  rollNumber?: string;
  program?: string;
  branch?: string;
}

/**
 * Authoritative registry of the 9 canonical synthetic demo personas established in
 * AUTOPILOT Stage 1d (docs/AUTOPILOT.md line 48) and seeded via prisma/seed.ts.
 */
export const CANONICAL_SEED_PERSONAS: readonly CanonicalSeedPersona[] = [
  {
    email: 'demo.librarian@demo.rgkedia.local',
    name: 'Demo Librarian',
    role: 'LIBRARIAN',
    phone: '0000000000',
  },
  {
    email: 'demo.teacher1@demo.rgkedia.local',
    name: 'Demo Teacher 1',
    role: 'TEACHER',
    phone: '0000000001',
    program: 'BCOM',
    branch: 'General',
  },
  {
    email: 'demo.teacher2@demo.rgkedia.local',
    name: 'Demo Teacher 2',
    role: 'TEACHER',
    phone: '0000000002',
    program: 'BSC',
    branch: 'Computer Science & Data',
  },
  {
    email: 'demo.teacher3@demo.rgkedia.local',
    name: 'Demo Teacher 3',
    role: 'TEACHER',
    phone: '0000000003',
    program: 'BBA',
    branch: 'General Business Administration',
  },
  {
    email: 'demo.student1@demo.rgkedia.local',
    name: 'Demo Student 1',
    role: 'STUDENT',
    phone: '0000000011',
    rollNumber: '1052-24-401-001',
    program: 'BCOM',
    branch: 'Computer Applications',
  },
  {
    email: 'demo.student2@demo.rgkedia.local',
    name: 'Demo Student 2',
    role: 'STUDENT',
    phone: '0000000012',
    rollNumber: '1052-24-401-045',
    program: 'BCOM',
    branch: 'Business Analytics',
  },
  {
    email: 'demo.student3@demo.rgkedia.local',
    name: 'Demo Student 3',
    role: 'STUDENT',
    phone: '0000000013',
    rollNumber: '1052-24-402-012',
    program: 'BBA',
    branch: 'General Business Administration',
  },
  {
    email: 'demo.student4@demo.rgkedia.local',
    name: 'Demo Student 4',
    role: 'STUDENT',
    phone: '0000000014',
    rollNumber: '1052-24-403-008',
    program: 'BSC',
    branch: 'Computer Science & Data',
  },
  {
    email: 'demo.student5@demo.rgkedia.local',
    name: 'Demo Student 5',
    role: 'STUDENT',
    phone: '0000000015',
    rollNumber: '1052-24-401-099',
    program: 'BCOM',
    branch: 'Honors',
  },
];

export interface CandidateUserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  rollNumber?: string | null;
  phone?: string | null;
  program?: string | null;
  branch?: string | null;
}

/**
 * Classifies a user record based on multi-factor provenance.
 *
 * PROVENANCE RULES:
 * 1. An email suffix alone (@demo.rgkedia.local) NEVER constitutes sufficient proof of demo provenance.
 * 2. An account is VERIFIED_DEMO only if it positively satisfies orthogonal attributes:
 *    - Domain matches @demo.rgkedia.local
 *    - Persona name matches synthetic convention (Demo Librarian / Demo Teacher X / Demo Student X)
 *    - Phone matches synthetic dummy sequence (0000000000 - 0000000015)
 *    - Matches the authoritative canonical persona specification identically
 * 3. Any account with partial, conflicting, or suspicious demo markers is classified as AMBIGUOUS.
 * 4. AMBIGUOUS records are NEVER eligible for deletion.
 */
export function classifyAccountProvenance(user: CandidateUserRecord): ProvenanceDetails {
  const email = (user.email || '').toLowerCase().trim();
  const name = (user.name || '').trim();
  const phone = (user.phone || '').trim();
  const rollNumber = (user.rollNumber || '').trim();
  const role = user.role;

  const hasDemoEmailDomain = email.endsWith('@demo.rgkedia.local');
  const hasDemoNamePattern = /^Demo\s+(Librarian|Teacher\s+[1-9]\d*|Student\s+[1-9]\d*)$/i.test(name);
  const hasDemoPhonePattern = /^00000000(0[0-9]|1[0-5])$/.test(phone);
  const hasDemoRollPattern = /^1052-24-40[1-3]-[0-9]{3}$/.test(rollNumber);

  // Match against Canonical Seed Persona Registry (supports canonical exact email or tagged test variations like demo.student1.tag@demo.rgkedia.local)
  const emailPrefix = email.split('@')[0];
  const prefixParts = emailPrefix.split('.');
  const basePrefix = prefixParts.length >= 2 ? `${prefixParts[0]}.${prefixParts[1]}` : emailPrefix;

  const canonicalPersona = CANONICAL_SEED_PERSONAS.find((p) => {
    const pPrefix = p.email.split('@')[0];
    return p.email.toLowerCase() === email || pPrefix === basePrefix;
  });

  let matchesCanonicalSeedPersona = false;
  if (canonicalPersona && hasDemoEmailDomain) {
    const nameMatch = canonicalPersona.name.toLowerCase() === name.toLowerCase();
    const roleMatch = canonicalPersona.role === role;
    const phoneMatch = canonicalPersona.phone === phone;
    const isExactEmail = canonicalPersona.email.toLowerCase() === email;
    const rollMatch = canonicalPersona.role === 'STUDENT'
      ? (isExactEmail
          ? (canonicalPersona.rollNumber || '') === rollNumber
          : hasDemoRollPattern)
      : true;

    matchesCanonicalSeedPersona = nameMatch && roleMatch && phoneMatch && rollMatch;
  }

  const factors = {
    hasDemoEmailDomain,
    hasDemoNamePattern,
    hasDemoPhonePattern,
    hasDemoRollPattern,
    matchesCanonicalSeedPersona,
  };

  const reasons: string[] = [];
  let classification: AccountClassification = 'NON_DEMO';

  if (matchesCanonicalSeedPersona) {
    classification = 'VERIFIED_DEMO';
    reasons.push('Verified canonical synthetic persona matching documented seed registry identically.');
  } else if (hasDemoEmailDomain) {
    // Has demo domain but failed canonical persona verification
    classification = 'AMBIGUOUS';
    if (!canonicalPersona) {
      reasons.push('Email uses @demo.rgkedia.local domain but is not present in canonical seed persona registry.');
    } else {
      reasons.push('Email matches canonical demo persona but other attributes (name, role, phone, or rollNumber) differ.');
    }
  } else if (hasDemoNamePattern) {
    // Name indicates Demo but email domain is non-demo (e.g. @rgkedia.edu.in)
    classification = 'AMBIGUOUS';
    reasons.push('Name conforms to demo persona pattern ("Demo ...") but email domain is not @demo.rgkedia.local.');
  } else if (hasDemoPhonePattern) {
    // Synthetic phone placeholder on non-demo email
    classification = 'AMBIGUOUS';
    reasons.push('Phone number uses synthetic dummy sequence ("00000000xx") but email domain is not @demo.rgkedia.local.');
  } else {
    classification = 'NON_DEMO';
    reasons.push('Standard academic or institutional account with zero demo attributes.');
  }

  return {
    userId: user.id,
    email,
    role,
    classification,
    factors,
    reasons,
  };
}

/**
 * Scans all user records in the target database and generates an exhaustive provenance inventory.
 * PURE READ-ONLY: Never modifies any record in the database.
 */
export async function executeDemoAccountInventory(prisma: PrismaClient): Promise<DemoAccountInventory> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      rollNumber: true,
      phone: true,
      program: true,
      branch: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const verifiedDemoUserIds: string[] = [];
  const ambiguousUserIds: string[] = [];
  const details: ProvenanceDetails[] = [];
  const byRole: Record<string, number> = { STUDENT: 0, TEACHER: 0, LIBRARIAN: 0 };

  let verifiedDemoCount = 0;
  let ambiguousCount = 0;
  let nonDemoCount = 0;

  for (const user of users) {
    const prov = classifyAccountProvenance(user);
    details.push(prov);

    if (prov.classification === 'VERIFIED_DEMO') {
      verifiedDemoCount++;
      verifiedDemoUserIds.push(user.id);
      byRole[user.role] = (byRole[user.role] || 0) + 1;
    } else if (prov.classification === 'AMBIGUOUS') {
      ambiguousCount++;
      ambiguousUserIds.push(user.id);
    } else {
      nonDemoCount++;
    }
  }

  return {
    totalUsersScanned: users.length,
    verifiedDemoCount,
    ambiguousCount,
    nonDemoCount,
    byRole,
    verifiedDemoUserIds,
    ambiguousUserIds,
    details,
    inventoriedAt: new Date().toISOString(),
  };
}
