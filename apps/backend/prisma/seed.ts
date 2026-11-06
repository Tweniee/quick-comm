/* Dev seed: one pilot city, ₹35/₹25 pricing, staff users, a verified demo business and an approved demo rider. */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const pw = await bcrypt.hash('ChangeMe@123', 10);
  await prisma.adminUser.upsert({ where: { email: 'admin@quickdelivery.local' }, update: {}, create: { name: 'Super Admin', email: 'admin@quickdelivery.local', passwordHash: pw, role: 'SUPER_ADMIN' } });
  await prisma.adminUser.upsert({ where: { email: 'support@quickdelivery.local' }, update: {}, create: { name: 'Support', email: 'support@quickdelivery.local', passwordHash: pw, role: 'SUPPORT' } });
  await prisma.adminUser.upsert({ where: { email: 'staff@quickdelivery.local' }, update: {}, create: { name: 'Onboarding Staff', email: 'staff@quickdelivery.local', passwordHash: pw, role: 'STAFF' } });

  // City-agnostic: the launch city is a business choice. Sample centre = Indore; change in Admin → Cities.
  const city = await prisma.city.upsert({
    where: { name: 'Pilot City' },
    update: {},
    create: { name: 'Pilot City', centerLat: 22.7196, centerLng: 75.8577, radiusKm: 22.5 },
  });
  if (!(await prisma.pricingConfig.findFirst({ where: { cityId: city.id } }))) {
    await prisma.pricingConfig.create({ data: { cityId: city.id, deliveryFee: 3500, returnFee: 2500, driverSharePct: 80, effectiveFrom: new Date('2026-01-01') } });
  }

  const biz = await prisma.business.upsert({
    where: { phone: '9876500001' },
    update: {},
    create: {
      cityId: city.id, name: 'Demo Bakery', type: 'SOLE_PROPRIETORSHIP', ownerName: 'Demo Owner', phone: '9876500001', email: 'bakery@demo.local',
      category: 'Bakery', instagram: 'https://instagram.com/demobakery', status: 'APPROVED', verifiedAt: new Date(), termsAcceptedAt: new Date(), phoneVerifiedAt: new Date(), emailVerifiedAt: new Date(), submittedAt: new Date(),
      walletBalance: 100000, apiEnabled: true,
      users: { create: { name: 'Demo Owner', phone: '9876500001', email: 'bakery@demo.local', passwordHash: pw, role: 'OWNER' } },
      addresses: { create: { label: 'Main shop', address: '12 MG Road, near Regal Square', pincode: '452001', lat: 22.7185, lng: 75.8571, isDefault: true, contactPhone: '9876500001' } },
      ledger: { create: { type: 'RECHARGE', amount: 100000, balanceAfter: 100000, heldAfter: 0, reason: 'Seed recharge ₹1000', createdByType: 'SYSTEM', idempotencyKey: 'seed:recharge:demo' } },
    },
  });

  const year = new Date().getFullYear();
  await prisma.driver.upsert({
    where: { phone: '9876511111' },
    update: {},
    create: {
      cityId: city.id, name: 'Ravi Kumar', phone: '9876511111', source: 'SWIGGY', dob: new Date('1995-04-12'),
      dlNumber: 'MP0920150012345', dlExpiry: new Date(`${year + 5}-01-01`), rcNumber: 'MP09AB1234', rcExpiry: new Date(`${year + 3}-01-01`),
      vehicleNumber: 'MP09AB1234', vehicleType: 'BIKE', bikeModel: 'Hero Splendor', aadhaarHash: createHash('sha256').update('aadhaar:234567890123').digest('hex'), aadhaarLast4: '0123',
      bankAccountLast4: '6789', ifsc: 'SBIN0001234', accountHolderName: 'Ravi Kumar', status: 'APPROVED', approvedAt: new Date(),
    },
  });

  console.log('Seeded.');
  console.log('  Admin:    admin@quickdelivery.local / ChangeMe@123 (also support@, staff@)');
  console.log('  Business: 9876500001 / ChangeMe@123 (Demo Bakery, ₹1000 wallet, API enabled)');
  console.log('  Rider:    9876511111 (login by OTP; with DEV_ECHO_OTP=true the code is returned in the response)');
  console.log(`  City:     ${city.name} (${city.id})  business: ${biz.id}`);
}

main().finally(() => prisma.$disconnect());
