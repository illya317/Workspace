const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  console.log('Employee:', await prisma.employee.count());
  console.log('Employment:', await prisma.employment.count());
  console.log('Company:', await prisma.company.count());
  console.log('Department:', await prisma.department.count());
  console.log('Position:', await prisma.position.count());
  console.log('PositionDescription:', await prisma.positionDescription.count());
  console.log('EDP:', await prisma.eDP.count());
  await prisma.$disconnect();
}

check().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
