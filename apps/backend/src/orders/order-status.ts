import { OrderStatus } from '@prisma/client';

/** The order state machine (masterplan §6). Anything not listed here is rejected. */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ['READY', 'CANCELLED'],
  READY: ['ASSIGNING', 'CANCELLED'],
  ASSIGNING: ['ASSIGNED', 'NO_RIDER', 'CANCELLED'],
  NO_RIDER: ['ASSIGNING', 'CANCELLED'],
  ASSIGNED: ['PICKED_UP', 'ASSIGNING', 'CANCELLED'],
  PICKED_UP: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['ARRIVED', 'UNDELIVERED'],
  ARRIVED: ['DELIVERED', 'UNDELIVERED'],
  UNDELIVERED: ['RETURNING'],
  RETURNING: ['RETURNED'],
  DELIVERED: [],
  RETURNED: [],
  CANCELLED: [],
};

export const TERMINAL: OrderStatus[] = ['DELIVERED', 'RETURNED', 'CANCELLED'];
export const LIVE_WITH_RIDER: OrderStatus[] = ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED', 'UNDELIVERED', 'RETURNING'];
export const CUSTOMER_LOCATION_VISIBLE: OrderStatus[] = ['PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED'];
export const BUSINESS_CANCELLABLE: OrderStatus[] = ['CREATED', 'READY', 'ASSIGNING', 'NO_RIDER'];
export const SUPPORT_CANCELLABLE: OrderStatus[] = ['CREATED', 'READY', 'ASSIGNING', 'NO_RIDER', 'ASSIGNED'];
export const EDITABLE: OrderStatus[] = ['CREATED', 'READY', 'NO_RIDER'];

export function canTransition(from: OrderStatus, to: OrderStatus) {
  return TRANSITIONS[from].includes(to);
}

/** Exact words from Appendix A — the same everywhere: app, API, webhook, tracking, support. */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  CREATED: 'Created',
  READY: 'Ready',
  ASSIGNING: 'Assigning',
  NO_RIDER: 'No Rider',
  ASSIGNED: 'Assigned',
  PICKED_UP: 'Picked Up',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  ARRIVED: 'Arrived',
  DELIVERED: 'Delivered',
  UNDELIVERED: 'Undelivered',
  RETURNING: 'Returning',
  RETURNED: 'Returned',
  CANCELLED: 'Cancelled',
};

export const UNDELIVERED_REASONS = {
  CUSTOMER_NOT_REACHABLE: { label: 'Customer not reachable', needsWaitAndCalls: true },
  CUSTOMER_REFUSED: { label: 'Customer refused', needsWaitAndCalls: false },
  WRONG_ADDRESS: { label: 'Wrong address', needsWaitAndCalls: true },
  OTP_NOT_PROVIDED: { label: 'OTP not provided', needsWaitAndCalls: false },
  CUSTOMER_ASKED_TO_RETURN: { label: 'Customer asked to return', needsWaitAndCalls: false },
  RIDER_COULD_NOT_FIND_LOCATION: { label: 'Rider could not find location', needsWaitAndCalls: true },
} as const;
export type UndeliveredReason = keyof typeof UNDELIVERED_REASONS;

export const CANCEL_REASONS = {
  BUSINESS_CANCELLED: 'Business cancelled before assignment',
  NO_RIDER_AVAILABLE: 'No rider available',
  DUPLICATE_ORDER: 'Duplicate order',
  WRONG_DETAILS: 'Wrong details',
  SUPPORT_CANCELLED: 'Support cancelled',
  RIDER_REFUSED_PICKUP: 'Rider refused pickup',
} as const;
export type CancelReason = keyof typeof CANCEL_REASONS;
