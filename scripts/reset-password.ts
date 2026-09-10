import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const EMAIL = "admin@cruzblanca.local";
const NEW_PASSWORD = "Admin2024!";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hash(NEW_PASSWORD, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const user = await prisma.user.update({
    where: { email: EMAIL },
    data: {
      passwordHash,
      mustChangePwd: true,
      failedAttempts: 0,
    },
    select: { id: true, email: true, name: true },
  });

  console.log("✅ Contraseña restablecida para:", user.email);
  console.log("   Contraseña temporal:", NEW_PASSWORD);
  console.log("   Se pedirá cambio en el próximo login.");
}

main()
  .catch((e) => { console.error("❌ Error:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
