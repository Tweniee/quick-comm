import { Injectable } from '@nestjs/common';
import { BusinessType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../common/audit.service';
import { randomToken, sha256 } from '../common/crypto';
import { AppError, Errors } from '../common/errors';
import { insideCircle } from '../common/geo';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../common/prisma.service';
import { AuthService } from '../auth/auth.service';
import { DocumentsService, UploadedFileLike } from '../documents/documents.service';

export interface SignupInput {
  cityId: string;
  name: string;
  type: BusinessType;
  ownerName: string;
  phone: string;
  email: string;
  password: string;
  category?: string;
  gstin?: string;
  pan?: string;
  website?: string;
  instagram?: string;
  googleProfile?: string;
  acceptTerms: boolean;
  pickup: { label?: string; address: string; landmark?: string; pincode: string; lat: number; lng: number };
}

export interface AddressInput { label: string; address: string; landmark?: string; pincode: string; lat: number; lng: number; contactPhone?: string; isDefault?: boolean }

const BUSINESS_DOC_KINDS = ['PAN', 'GST_CERT', 'SHOP_LICENCE', 'UDYAM', 'INCORPORATION_CERT', 'AADHAAR', 'SELFIE', 'SHOP_PHOTO', 'ADDRESS_PROOF', 'OTHER'];

@Injectable()
export class BusinessesService {
  constructor(private prisma: PrismaService, private audit: AuditService, private auth: AuthService, private docs: DocumentsService) {}

  async signup(input: SignupInput) {
    if (!input.acceptTerms) throw new AppError('TERMS_REQUIRED', 'Please accept the business terms to continue', 422);
    const phone = normalizePhone(input.phone);
    if (!phone) throw Errors.invalidPhone();
    if (!input.password || input.password.length < 8) throw new AppError('WEAK_PASSWORD', 'Password must be at least 8 characters', 422);
    const email = input.email.toLowerCase().trim();
    const city = await this.prisma.city.findUnique({ where: { id: input.cityId } });
    if (!city) throw Errors.notFound('City');
    if (!insideCircle(input.pickup.lat, input.pickup.lng, city)) throw Errors.outsideServiceArea('pickup');

    const dupUser = await this.prisma.businessUser.findFirst({ where: { OR: [{ phone }, { email }] } });
    const dupBiz = await this.prisma.business.findFirst({ where: { OR: [{ phone }, { email }] } });
    if (dupUser || dupBiz) throw new AppError('ALREADY_REGISTERED', 'This phone or email is already registered. Please log in.', 409, 'LOGIN');

    // Duplicate check against previously rejected/suspended identities (masterplan §5).
    const flags: string[] = [];
    const idOr = [input.gstin && { gstin: input.gstin.toUpperCase() }, input.pan && { pan: input.pan.toUpperCase() }].filter(Boolean) as object[];
    if (idOr.length) {
      const prior = await this.prisma.business.findFirst({ where: { OR: idOr } });
      if (prior) flags.push(`DUPLICATE_ID_WITH_${prior.id}_${prior.status}`);
    }
    const hasPresence = !!(input.website || input.instagram || input.googleProfile);

    const business = await this.prisma.business.create({
      data: {
        cityId: city.id,
        name: input.name.trim(),
        type: input.type,
        ownerName: input.ownerName.trim(),
        phone,
        email,
        category: input.category,
        gstin: input.gstin?.toUpperCase(),
        pan: input.pan?.toUpperCase(),
        website: input.website,
        instagram: input.instagram,
        googleProfile: input.googleProfile,
        termsAcceptedAt: new Date(),
        flaggedForReview: !hasPresence || flags.length > 0,
        statusReason: flags.length ? flags.join(', ') : !hasPresence ? 'No public presence given; needs shop photo and manual review' : null,
        users: { create: { name: input.ownerName.trim(), phone, email, passwordHash: await bcrypt.hash(input.password, 10), role: 'OWNER' } },
        addresses: { create: { label: input.pickup.label || 'Main', address: input.pickup.address, landmark: input.pickup.landmark, pincode: input.pickup.pincode, lat: input.pickup.lat, lng: input.pickup.lng, isDefault: true } },
      },
    });
    await this.audit.log({ actorType: 'BUSINESS', actorId: business.id, action: 'BUSINESS_SIGNUP', entity: 'Business', entityId: business.id });
    return this.auth.businessLogin(phone, input.password);
  }

  async me(businessId: string) {
    const b = await this.prisma.business.findUnique({
      where: { id: businessId },
      include: { addresses: { where: { active: true } }, documents: { select: { id: true, kind: true, status: true, note: true, createdAt: true } }, city: true },
    });
    if (!b) throw Errors.notFound('Business');
    const { webhookSecret, ...rest } = b;
    return { ...rest, webhookSecretSet: !!webhookSecret };
  }

  async updateProfile(businessId: string, data: Partial<Pick<SignupInput, 'website' | 'instagram' | 'googleProfile' | 'category' | 'gstin' | 'pan'>> & { billingAddress?: string }) {
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    // Identity fields can only be changed before approval.
    if (b.status === 'APPROVED' && (data.gstin || data.pan)) throw new AppError('LOCKED_AFTER_APPROVAL', 'GSTIN/PAN can be changed only through support after approval', 409, 'CONTACT_SUPPORT');
    return this.prisma.business.update({ where: { id: businessId }, data });
  }

  async uploadDocument(businessId: string, kind: string, file: UploadedFileLike) {
    if (!BUSINESS_DOC_KINDS.includes(kind)) throw new AppError('INVALID_DOC_KIND', `Document kind must be one of ${BUSINESS_DOC_KINDS.join(', ')}`, 422);
    const doc = await this.docs.store(file, { ownerType: 'BUSINESS', kind, businessId });
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    // Re-application after rejection: one more try, then a manual call (masterplan §5).
    if (b.status === 'REJECTED' && b.rejectionCount < 2) {
      await this.prisma.business.update({ where: { id: businessId }, data: { status: 'PENDING', statusReason: 'Re-applied with new documents' } });
    }
    return { id: doc.id, kind: doc.kind, status: doc.status };
  }

  // ── Pickup addresses (branches) ──
  async addAddress(businessId: string, a: AddressInput) {
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId }, include: { city: true } });
    if (!insideCircle(a.lat, a.lng, b.city)) throw Errors.outsideServiceArea('pickup');
    return this.prisma.$transaction(async (tx) => {
      if (a.isDefault) await tx.pickupAddress.updateMany({ where: { businessId }, data: { isDefault: false } });
      return tx.pickupAddress.create({ data: { ...a, businessId } });
    });
  }

  async updateAddress(businessId: string, id: string, a: Partial<AddressInput>) {
    const addr = await this.prisma.pickupAddress.findFirst({ where: { id, businessId } });
    if (!addr) throw Errors.notFound('Pickup address');
    if (a.lat !== undefined && a.lng !== undefined) {
      const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId }, include: { city: true } });
      if (!insideCircle(a.lat, a.lng, b.city)) throw Errors.outsideServiceArea('pickup');
    }
    return this.prisma.$transaction(async (tx) => {
      if (a.isDefault) await tx.pickupAddress.updateMany({ where: { businessId }, data: { isDefault: false } });
      return tx.pickupAddress.update({ where: { id }, data: a });
    });
  }

  async removeAddress(businessId: string, id: string) {
    const addr = await this.prisma.pickupAddress.findFirst({ where: { id, businessId } });
    if (!addr) throw Errors.notFound('Pickup address');
    const count = await this.prisma.pickupAddress.count({ where: { businessId, active: true } });
    if (count <= 1) throw new AppError('LAST_ADDRESS', 'You need at least one pickup address', 409);
    return this.prisma.pickupAddress.update({ where: { id }, data: { active: false, isDefault: false } });
  }

  // ── API keys & webhooks (only after Super Admin whitelists) ──
  async createApiKey(businessId: string, mode: 'TEST' | 'LIVE') {
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    if (b.status !== 'APPROVED') throw Errors.businessNotVerified();
    if (!b.apiEnabled) throw new AppError('API_NOT_WHITELISTED', 'API access is not enabled for your business yet. Request it from support.', 403, 'REQUEST_API_ACCESS');
    const keyId = `qd_${mode.toLowerCase()}_${randomToken(9)}`;
    const secret = `qds_${randomToken(24)}`;
    await this.prisma.apiKey.create({ data: { businessId, keyId, secretHash: sha256(secret), mode } });
    await this.audit.log({ actorType: 'BUSINESS', actorId: businessId, action: 'API_KEY_CREATE', entity: 'ApiKey', entityId: keyId });
    // The secret is shown exactly once.
    return { keyId, secret, mode, note: 'Store the secret now. It will not be shown again.' };
  }

  listApiKeys(businessId: string) {
    return this.prisma.apiKey.findMany({ where: { businessId }, select: { id: true, keyId: true, mode: true, active: true, createdAt: true, lastUsedAt: true, revokedAt: true }, orderBy: { createdAt: 'desc' } });
  }

  async revokeApiKey(businessId: string, id: string, actor: { type: 'BUSINESS' | 'ADMIN'; id: string }) {
    const k = await this.prisma.apiKey.findFirst({ where: { id, ...(actor.type === 'BUSINESS' ? { businessId } : {}) } });
    if (!k) throw Errors.notFound('API key');
    await this.audit.log({ actorType: actor.type, actorId: actor.id, action: 'API_KEY_REVOKE', entity: 'ApiKey', entityId: k.keyId });
    return this.prisma.apiKey.update({ where: { id }, data: { active: false, revokedAt: new Date() }, select: { id: true, keyId: true, active: true } });
  }

  async setWebhook(businessId: string, url: string | null) {
    if (url && !/^https:\/\//i.test(url)) throw new AppError('WEBHOOK_HTTPS_REQUIRED', 'Webhook URL must use HTTPS', 422);
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const secret = url && !b.webhookSecret ? `whsec_${randomToken(24)}` : b.webhookSecret;
    await this.prisma.business.update({ where: { id: businessId }, data: { webhookUrl: url, webhookSecret: url ? secret : b.webhookSecret } });
    return { webhookUrl: url, ...(url && !b.webhookSecret ? { webhookSecret: secret, note: 'Store the signing secret now. It will not be shown again.' } : {}) };
  }

  async rotateWebhookSecret(businessId: string) {
    const secret = `whsec_${randomToken(24)}`;
    await this.prisma.business.update({ where: { id: businessId }, data: { webhookSecret: secret } });
    return { webhookSecret: secret };
  }
}
