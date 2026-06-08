import { PrismaClient } from '@prisma/client';

/**
 * Idempotent database seed.
 *
 * Run with: `npm run db:seed` (also runs automatically on `prisma migrate reset`).
 *
 * NOTE: The admin password is a placeholder. Real password hashing (argon2)
 * arrives in Phase 3 (Authentication); this seed will be updated then to
 * produce a proper hash and a login-able admin account.
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail = 'admin@example.com';

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: 'PLACEHOLDER_REPLACED_IN_PHASE_3',
      firstName: 'Admin',
      lastName: 'User',
      isActive: true,
    },
  });

  console.log(`Seed complete — admin user ensured: ${admin.email} (${admin.id})`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
