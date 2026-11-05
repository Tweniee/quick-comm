import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { config } from '../common/config';
import { numericCode, sha256 } from '../common/crypto';
import { AppError } from '../common/errors';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Principal } from './auth.types';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private notify: NotificationsService) {}

  sign(p: Principal, expiresIn = '12h') {
    return this.jwt.sign(p, { expiresIn });
  }

  async adminLogin(email: string, password: string) {
    const u = await this.prisma.adminUser.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!u || !u.active || !(await bcrypt.compare(password, u.passwordHash))) {
      throw new AppError('INVALID_CREDENTIALS', 'Wrong email or password', 401);
    }
    return { token: this.sign({ sub: u.id, kind: 'admin', role: u.role }), user: { id: u.id, name: u.name, email: u.email, role: u.role } };
  }

  async businessLogin(login: string, password: string) {
    const phone = normalizePhone(login);
    const u = await this.prisma.businessUser.findFirst({
      where: phone ? { phone } : { email: login.toLowerCase().trim() },
      include: { business: true },
    });
    if (!u || !u.active || !(await bcrypt.compare(password, u.passwordHash))) {
      throw new AppError('INVALID_CREDENTIALS', 'Wrong phone/email or password', 401);
    }
    return {
      token: this.sign({ sub: u.id, kind: 'business', role: u.role, businessId: u.businessId, cityId: u.business.cityId }, '30d'),
      user: { id: u.id, name: u.name, role: u.role },
      business: { id: u.business.id, name: u.business.name, status: u.business.status },
    };
  }

  /** Driver login is phone + SMS OTP. Only APPROVED (or PAUSED, to upload renewals) drivers can log in. */
  async driverRequestOtp(rawPhone: string) {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new AppError('INVALID_PHONE', 'Enter a valid 10 digit mobile number', 422);
    const driver = await this.prisma.driver.findUnique({ where: { phone } });
    if (!driver || !['APPROVED', 'PAUSED'].includes(driver.status)) {
      throw new AppError('DRIVER_NOT_ACTIVE', 'Your account is not active yet. Complete onboarding and wait for approval.', 403, 'CONTACT_SUPPORT');
    }
    const recent = await this.prisma.loginOtp.count({ where: { phone, purpose: 'DRIVER_LOGIN', createdAt: { gt: new Date(Date.now() - 10 * 60_000) } } });
    if (recent >= 5) throw new AppError('TOO_MANY_OTP_REQUESTS', 'Too many OTP requests. Try again in 10 minutes.', 429, 'RETRY_LATER');
    const code = numericCode(6);
    await this.prisma.loginOtp.create({
      data: { phone, purpose: 'DRIVER_LOGIN', codeHash: sha256(`${phone}:${code}`), expiresAt: new Date(Date.now() + 5 * 60_000) },
    });
    await this.notify.send({ channel: 'SMS', to: phone, template: 'DRIVER_LOGIN_OTP', body: `Your Quick Delivery login code is ${code}. Do not share it.`, secret: code });
    return { sent: true, ...(config.devEchoOtp ? { devOtp: code } : {}) };
  }

  async driverVerifyOtp(rawPhone: string, code: string) {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new AppError('INVALID_PHONE', 'Enter a valid 10 digit mobile number', 422);
    const otp = await this.prisma.loginOtp.findFirst({
      where: { phone, purpose: 'DRIVER_LOGIN', usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new AppError('OTP_EXPIRED', 'Code expired. Request a new one.', 401, 'REQUEST_OTP');
    if (otp.attempts >= 5) throw new AppError('OTP_LOCKED', 'Too many wrong attempts. Request a new code.', 429, 'REQUEST_OTP');
    if (otp.codeHash !== sha256(`${phone}:${code}`)) {
      await this.prisma.loginOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new AppError('OTP_INVALID', 'Wrong code', 401);
    }
    await this.prisma.loginOtp.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
    const driver = await this.prisma.driver.findUniqueOrThrow({ where: { phone } });
    return {
      token: this.sign({ sub: driver.id, kind: 'driver', cityId: driver.cityId }, '30d'),
      driver: { id: driver.id, name: driver.name, status: driver.status, preferredLanguage: driver.preferredLanguage },
    };
  }
}
