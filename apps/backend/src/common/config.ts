function num(name: string, def: number): number {
  const v = process.env[name];
  return v === undefined || v === '' ? def : Number(v);
}

export const config = {
  get port() { return num('PORT', 4000); },
  get jwtSecret() { return process.env.JWT_SECRET || 'dev-jwt-secret'; },
  get encryptionKey() { return process.env.DATA_ENCRYPTION_KEY || 'dev-encryption-key-dev-encryption-key'; },
  get publicWebUrl() { return (process.env.PUBLIC_WEB_URL || 'http://localhost:3000').replace(/\/$/, ''); },
  get corsOrigins() { return (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim()); },
  get uploadDir() { return process.env.UPLOAD_DIR || './uploads'; },
  get offerTimeoutSeconds() { return num('OFFER_TIMEOUT_SECONDS', 30); },
  get assignmentMaxRiders() { return num('ASSIGNMENT_MAX_RIDERS', 5); },
  get assignmentMaxSeconds() { return num('ASSIGNMENT_MAX_SECONDS', 180); },
  get arrivalWaitMinutes() { return num('ARRIVAL_WAIT_MINUTES', 15); },
  get onboardingLinkHours() { return num('ONBOARDING_LINK_HOURS', 48); },
  get devEchoOtp() { return process.env.DEV_ECHO_OTP === 'true' && process.env.NODE_ENV !== 'production'; },
  get schedulersDisabled() { return process.env.DISABLE_SCHEDULERS === 'true'; },
  get paymentProvider() { return process.env.PAYMENT_PROVIDER || 'mock'; },
  /** Parcel limits (masterplan §9) */
  maxWeightGrams: 20_000,
  maxDims: { l: 45, w: 35, h: 35, sum: 115 },
  liabilityCapPaise: 500_000,
  minCallsBeforeUndelivered: 2,
  maxOtpAttempts: 3,
  maxManualAssignmentRetries: 1,
};
