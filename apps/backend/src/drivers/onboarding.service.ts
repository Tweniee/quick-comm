import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { config } from '../common/config';
import { encrypt, maskPhone, randomToken, sha256 } from '../common/crypto';
import { AppError, Errors } from '../common/errors';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../common/prisma.service';
import { DocumentsService, UploadedFileLike } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';

export const REQUIRED_DRIVER_DOCS = ['DL_FRONT', 'DL_BACK', 'RC_FRONT', 'RC_BACK', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'BANK_PROOF', 'SELFIE', 'BIKE_PHOTO'] as const;

export interface OnboardingForm {
  name: string;
  dob: string; // YYYY-MM-DD
  address: string;
  emergencyContact: string;
  dlNumber: string;
  dlExpiry: string;
  rcNumber: string;
  rcExpiry: string;
  vehicleNumber: string;
  vehicleType: string;
  bikeModel: string;
  aadhaarNumber: string;
  bankAccountNumber: string;
  ifsc: string;
  accountHolderName: string;
  preferredLanguage?: string;
}

const DAY = 86_400_000;

/**
 * Driver onboarding (masterplan §8): staff invites → one-time link (48 h, single use, tied to the phone)
 * → driver submits web form + documents → automatic checks → human approval. No auto-approval.
 */
@Injectable()
export class OnboardingService {
  constructor(private prisma: PrismaService, private docs: DocumentsService, private notify: NotificationsService, private audit: AuditService) {}

  async invite(input: { name: string; phone: string; cityId: string; source?: string }, adminId: string) {
    const phone = normalizePhone(input.phone);
    if (!phone) throw new AppError('INVALID_PHONE', 'Enter a valid 10 digit mobile number', 422);
    const existing = await this.prisma.driver.findUnique({ where: { phone } });
    if (existing && !['INVITED', 'REJECTED'].includes(existing.status)) {
      throw new AppError('DRIVER_EXISTS', `This phone is already onboarded (status ${existing.status})`, 409);
    }
    const driver = existing
      ? await this.prisma.driver.update({ where: { id: existing.id }, data: { name: input.name, cityId: input.cityId, source: input.source, status: 'INVITED' } })
      : await this.prisma.driver.create({ data: { name: input.name, phone, cityId: input.cityId, source: input.source } });
    await this.audit.log({ actorType: 'ADMIN', actorId: adminId, action: 'DRIVER_INVITE', entity: 'Driver', entityId: driver.id });
    return { driver, ...(await this.sendLink(driver.id, adminId)) };
  }

  /** Issue a fresh link. Any older link stops working immediately. */
  async sendLink(driverId: string, adminId: string) {
    const d = await this.prisma.driver.findUniqueOrThrow({ where: { id: driverId } });
    if (!['INVITED', 'REJECTED', 'SUBMITTED'].includes(d.status)) throw new AppError('LINK_NOT_ALLOWED', `Cannot send an onboarding link to a ${d.status} driver`, 409);
    const token = randomToken(24);
    const expiresAt = new Date(Date.now() + config.onboardingLinkHours * 3_600_000);
    await this.prisma.$transaction([
      this.prisma.onboardingLink.updateMany({ where: { driverId, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.onboardingLink.create({ data: { driverId, tokenHash: sha256(token), phone: d.phone, expiresAt, createdByAdminId: adminId } }),
      this.prisma.driver.update({ where: { id: driverId }, data: { status: 'INVITED' } }),
    ]);
    const url = `${config.publicWebUrl}/onboard/${token}`;
    await this.notify.sendSmsAndWhatsapp({
      to: d.phone, template: 'DRIVER_ONBOARDING_LINK', secret: token,
      body: `Hi ${d.name}, complete your Quick Delivery partner signup here: ${url} . Link valid for ${config.onboardingLinkHours} hours. Do not share it.`,
    });
    // URL returned to staff so they can also share it in person; it is per-driver and single-use.
    return { onboardingUrl: url, expiresAt };
  }

  private async validLink(token: string) {
    const link = await this.prisma.onboardingLink.findUnique({ where: { tokenHash: sha256(token) }, include: { driver: true } });
    if (!link) throw new AppError('LINK_INVALID', 'This link is not valid. Ask our staff for a new link.', 404, 'REQUEST_NEW_LINK');
    if (link.usedAt) throw new AppError('LINK_USED', 'This link was already used. Ask our staff for a new link if you need to resubmit.', 410, 'REQUEST_NEW_LINK');
    if (link.revokedAt) throw new AppError('LINK_REPLACED', 'A newer link was sent to your phone. Use the latest link.', 410, 'USE_LATEST_LINK');
    if (link.expiresAt < new Date()) throw new AppError('LINK_EXPIRED', 'This link has expired. Ask our staff for a new link.', 410, 'REQUEST_NEW_LINK');
    if (link.phone !== link.driver.phone) throw new AppError('LINK_INVALID', 'This link is not valid for this phone.', 403);
    return link;
  }

  async describe(token: string) {
    const link = await this.validLink(token);
    return {
      name: link.driver.name,
      phoneMasked: maskPhone(link.driver.phone),
      expiresAt: link.expiresAt,
      requiredDocuments: REQUIRED_DRIVER_DOCS,
      rules: { minAge: 18, dlValidDaysMin: 30 },
    };
  }

  async submit(token: string, form: OnboardingForm, files: Record<string, UploadedFileLike | undefined>) {
    const link = await this.validLink(token);
    const d = link.driver;
    const problems: string[] = [];

    // ── automatic checks (masterplan §8 step 3) ──
    const dob = new Date(form.dob);
    const age = (Date.now() - dob.getTime()) / (365.25 * DAY);
    if (isNaN(age) || age < 18) problems.push('You must be 18 years or older');
    const dlExpiry = new Date(form.dlExpiry);
    if (isNaN(dlExpiry.getTime()) || dlExpiry.getTime() < Date.now() + 30 * DAY) problems.push('Driving Licence must be valid for at least 30 more days. Please renew it first.');
    const rcExpiry = new Date(form.rcExpiry);
    if (isNaN(rcExpiry.getTime()) || rcExpiry.getTime() < Date.now()) problems.push('Vehicle RC has expired');
    const dl = (form.dlNumber || '').replace(/[\s-]/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}\d{4}\d{7}$/.test(dl) && !/^[A-Z]{2}\d{13}$/.test(dl)) problems.push('Driving Licence number format looks wrong (e.g. MH1420110012345)');
    const aadhaar = (form.aadhaarNumber || '').replace(/\D/g, '');
    if (!/^[2-9]\d{11}$/.test(aadhaar)) problems.push('Aadhaar must be 12 digits');
    const ifsc = (form.ifsc || '').toUpperCase().trim();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) problems.push('IFSC format looks wrong (e.g. SBIN0001234)');
    const acct = (form.bankAccountNumber || '').replace(/\s/g, '');
    if (!/^\d{9,18}$/.test(acct)) problems.push('Bank account number must be 9 to 18 digits');
    const vehicle = (form.vehicleNumber || '').replace(/[\s-]/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(vehicle)) problems.push('Vehicle number format looks wrong (e.g. MH12AB1234)');
    if (!form.accountHolderName?.trim()) problems.push('Enter the bank account holder name');
    for (const k of REQUIRED_DRIVER_DOCS) if (!files[k]) problems.push(`Upload ${k.replace('_', ' ').toLowerCase()}`);

    // ── duplicate checks are blocking ──
    const aadhaarHash = sha256(`aadhaar:${aadhaar}`);
    const dup = await this.prisma.driver.findFirst({ where: { id: { not: d.id }, OR: [{ dlNumber: dl }, { aadhaarHash }] } });
    if (dup) problems.push('This Driving Licence or Aadhaar is already registered with another partner account');

    if (problems.length) throw new AppError('ONBOARDING_INVALID', problems[0], 422, 'FIX_AND_RESUBMIT', { problems });

    for (const kind of REQUIRED_DRIVER_DOCS) {
      await this.docs.store(files[kind]!, { ownerType: 'DRIVER', kind, driverId: d.id });
    }
    const nameMismatch = form.accountHolderName.trim().toLowerCase() !== form.name.trim().toLowerCase();
    await this.prisma.$transaction([
      this.prisma.driver.update({
        where: { id: d.id },
        data: {
          name: form.name.trim(),
          dob,
          address: form.address,
          emergencyContact: form.emergencyContact,
          dlNumber: dl,
          dlExpiry,
          rcNumber: form.rcNumber.toUpperCase(),
          rcExpiry,
          vehicleNumber: vehicle,
          vehicleType: form.vehicleType || 'BIKE',
          bikeModel: form.bikeModel,
          aadhaarHash,
          aadhaarLast4: aadhaar.slice(-4),
          bankAccountEnc: encrypt(acct),
          bankAccountLast4: acct.slice(-4),
          ifsc,
          accountHolderName: form.accountHolderName.trim(),
          preferredLanguage: form.preferredLanguage === 'hi' ? 'hi' : 'en',
          status: 'SUBMITTED',
          statusReason: nameMismatch ? 'Bank account holder name differs from driver name, check manually' : null,
        },
      }),
      this.prisma.onboardingLink.update({ where: { id: link.id }, data: { usedAt: new Date() } }),
    ]);
    return { submitted: true, message: 'Thank you. Our team will verify your documents and message you once approved.' };
  }
}
