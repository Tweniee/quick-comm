import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Machine-readable error. Every error tells the caller what to do next (masterplan §13 "No dead ends").
 */
export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: number = HttpStatus.BAD_REQUEST,
    public readonly nextAction?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ error: { code, message, nextAction, details } }, status);
  }
}

export const Errors = {
  insufficientWallet: (needed: number, available: number) =>
    new AppError('INSUFFICIENT_WALLET', `Recharge ₹${((needed - available) / 100).toFixed(0)} to create this order`, 402, 'RECHARGE', { needed, available }),
  outsideServiceArea: (which: 'pickup' | 'drop') =>
    new AppError('OUTSIDE_SERVICE_AREA', `The ${which} location is outside the city service area`, 422, 'CHANGE_ADDRESS'),
  overweight: () => new AppError('OVERWEIGHT', 'Exceeds bike limit, 20 kg maximum', 422, 'REDUCE_WEIGHT'),
  oversize: () => new AppError('OVERSIZE', 'Parcel does not fit a standard bike delivery box (45×35×35 cm, L+W+H ≤ 115 cm)', 422, 'REDUCE_SIZE'),
  businessNotVerified: () => new AppError('BUSINESS_NOT_VERIFIED', 'Your business is not verified yet. Orders can be created after approval.', 403, 'COMPLETE_VERIFICATION'),
  invalidPhone: () => new AppError('INVALID_PHONE', 'Customer phone must be a 10 digit Indian mobile number', 422, 'FIX_PHONE'),
  notFound: (what: string) => new AppError('NOT_FOUND', `${what} not found`, 404),
  forbidden: (msg = 'You are not allowed to do this') => new AppError('FORBIDDEN', msg, 403),
  invalidTransition: (from: string, to: string) =>
    new AppError('INVALID_STATE_TRANSITION', `Order cannot move from ${from} to ${to}`, 409),
  cityPaused: (msg?: string | null) => new AppError('CITY_PAUSED', msg || 'Deliveries are paused in your city', 409, 'RETRY_LATER'),
};
