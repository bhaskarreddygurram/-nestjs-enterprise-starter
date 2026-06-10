import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * Idempotent database seed.
 *
 * Run with: `npm run db:seed` (also runs automatically on `prisma migrate reset`).
 *
 * Dev-only credentials — the admin password is meant for local development
 * and must be changed in any real deployment.
 */
const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'Admin123!ChangeMe';

async function main(): Promise<void> {
  const passwordHash = await argon2.hash(ADMIN_PASSWORD);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      isActive: true,
    },
  });

  console.log(`Seed complete — admin user ensured: ${admin.email} (${admin.id})`);
  console.log(`Dev login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
