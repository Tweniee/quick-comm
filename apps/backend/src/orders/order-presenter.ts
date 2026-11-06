import { haversineKm } from '../common/geo';
import { Driver, Order, OrderTimeline, PickupAddress } from '@prisma/client';
import { config } from '../common/config';
import { decrypt, maskPhone } from '../common/crypto';
import { CUSTOMER_LOCATION_VISIBLE, LIVE_WITH_RIDER, STATUS_LABEL } from './order-status';

type FullOrder = Order & { pickupAddress?: PickupAddress | null; driver?: Driver | null; timeline?: OrderTimeline[]; business?: { name: string; phone?: string } | null };

export function trackingUrl(token: string) {
  return `${config.publicWebUrl}/track/${token}`;
}

function riderView(o: FullOrder) {
  if (!o.driver || !LIVE_WITH_RIDER.includes(o.status) && !['DELIVERED', 'RETURNED'].includes(o.status)) return null;
  const live = LIVE_WITH_RIDER.includes(o.status);
  return {
    firstName: o.driver.name.split(' ')[0],
    phoneMasked: maskPhone(o.driver.phone),
    vehicleNumber: o.driver.vehicleNumber,
    location: live && o.driver.lastLat != null ? { lat: o.driver.lastLat, lng: o.driver.lastLng, at: o.driver.lastLocationAt } : null,
  };
}

/**
 * What a business (app or API) and admin see. The delivery OTP value is NEVER included —
 * only whether it was sent (masterplan §6 "Engineer note on OTP fraud").
 */
export function presentForBusiness(o: FullOrder, opts: { includeReturnOtp?: boolean } = {}) {
  return {
    id: o.id,
    code: o.code,
    businessReferenceId: o.businessReferenceId,
    source: o.source,
    isTest: o.isTest,
    status: o.status,
    statusLabel: STATUS_LABEL[o.status],
    customer: { name: o.customerName, phone: o.customerPhone, address: o.dropAddress, landmark: o.dropLandmark, pincode: o.dropPincode, lat: o.dropLat, lng: o.dropLng },
    pickup: o.pickupAddress ? { id: o.pickupAddress.id, label: o.pickupAddress.label, address: o.pickupAddress.address, lat: o.pickupAddress.lat, lng: o.pickupAddress.lng } : { id: o.pickupAddressId },
    parcel: { description: o.parcelDescription, weightGrams: o.weightGrams, lengthCm: o.lengthCm, widthCm: o.widthCm, heightCm: o.heightCm, declaredValue: o.declaredValue, isFragile: o.isFragile },
    specialInstructions: o.specialInstructions,
    fees: { delivery: o.deliveryFee, return: o.returnFee, currency: 'INR', unit: 'paise' },
    otp: { status: o.otpSentAt ? 'SENT' : 'NOT_SENT', failedAttempts: o.otpFailedAttempts, locked: o.otpLocked },
    returnOtp: opts.includeReturnOtp && o.status === 'RETURNING' && o.returnOtpEnc ? decrypt(o.returnOtpEnc) : undefined,
    rider: riderView(o),
    trackingUrl: trackingUrl(o.trackingToken),
    undeliveredReason: o.undeliveredReason,
    cancelReason: o.cancelReason,
    flags: o.flags,
    times: {
      createdAt: o.createdAt, readyAt: o.readyAt, assignedAt: o.assignedAt, pickedUpAt: o.pickedUpAt, arrivedAt: o.arrivedAt,
      deliveredAt: o.deliveredAt, undeliveredAt: o.undeliveredAt, returnedAt: o.returnedAt, cancelledAt: o.cancelledAt,
    },
    waitEndsAt: o.arrivedAt && o.status === 'ARRIVED' ? new Date(o.arrivedAt.getTime() + config.arrivalWaitMinutes * 60_000) : null,
    timeline: o.timeline?.map((t) => ({ status: t.status, label: STATUS_LABEL[t.status], actorType: t.actorType, reason: t.reason, note: t.note, lat: t.lat, lng: t.lng, at: t.occurredAt })),
  };
}

/** Customer tracking page: business name, plain status, rider first name, live location after pickup, OTP. */
export function presentForTracking(o: FullOrder) {
  const showOtp = o.otpEnc && !['DELIVERED', 'RETURNED', 'CANCELLED', 'UNDELIVERED', 'RETURNING'].includes(o.status);
  const plain: Record<string, string> = {
    CREATED: 'Order received', READY: 'Packed', ASSIGNING: 'Packed', NO_RIDER: 'Packed', ASSIGNED: 'Rider assigned',
    PICKED_UP: 'Picked up', OUT_FOR_DELIVERY: 'On the way', ARRIVED: 'Rider has arrived', DELIVERED: 'Delivered',
    UNDELIVERED: 'Could not be delivered', RETURNING: 'Returning to sender', RETURNED: 'Returned to sender', CANCELLED: 'Cancelled',
  };
  const r = o.driver && LIVE_WITH_RIDER.includes(o.status) ? o.driver : null;
  return {
    code: o.code,
    businessName: o.business?.name,
    businessPhone: o.business?.phone,
    status: o.status,
    statusText: plain[o.status],
    rider: r ? { firstName: r.name.split(' ')[0], initial: r.name.trim()[0]?.toUpperCase() ?? 'R', phoneMasked: maskPhone(r.phone), callPhone: ['OUT_FOR_DELIVERY', 'ARRIVED'].includes(o.status) ? r.phone : null } : null,
    riderDistanceKm: r && CUSTOMER_LOCATION_VISIBLE.includes(o.status) && r.lastLat != null && r.lastLng != null ? Math.round(haversineKm(r.lastLat, r.lastLng, o.dropLat, o.dropLng) * 10) / 10 : null,
    times: { assignedAt: o.assignedAt, pickedUpAt: o.pickedUpAt, arrivedAt: o.arrivedAt, deliveredAt: o.deliveredAt, undeliveredAt: o.undeliveredAt },
    deliveredBy: o.status === 'DELIVERED' && o.driver ? o.driver.name.split(' ')[0] : null,
    returnInfo: ['UNDELIVERED', 'RETURNING', 'RETURNED'].includes(o.status) ? { riderFirstName: o.driver?.name.split(' ')[0] ?? null, arrivedAt: o.arrivedAt, waitedMinutes: o.arrivedAt && o.undeliveredAt ? Math.round((o.undeliveredAt.getTime() - o.arrivedAt.getTime()) / 60000) : null, reason: o.undeliveredReason } : null,
    dropArea: o.dropAddress,
    riderLocation: r && CUSTOMER_LOCATION_VISIBLE.includes(o.status) && r.lastLat != null ? { lat: r.lastLat, lng: r.lastLng, at: r.lastLocationAt } : null,
    drop: { lat: o.dropLat, lng: o.dropLng },
    otp: showOtp ? decrypt(o.otpEnc!) : null,
    otpWarning: 'Share this OTP only when you have the parcel in your hand.',
    steps: ['Packed', 'Rider assigned', 'Picked up', 'On the way', 'Arrived', 'Delivered'],
    updatedAt: o.updatedAt,
  };
}

/** What the rider sees for their live job. Customer details only while the order is live (DPDP). */
export function presentForDriver(o: FullOrder) {
  const live = LIVE_WITH_RIDER.includes(o.status);
  return {
    id: o.id,
    code: o.code,
    status: o.status,
    statusLabel: STATUS_LABEL[o.status],
    business: { name: o.business?.name, phone: live ? o.business?.phone : null },
    pickup: o.pickupAddress ? { address: o.pickupAddress.address, landmark: o.pickupAddress.landmark, lat: o.pickupAddress.lat, lng: o.pickupAddress.lng, contactPhone: live ? o.pickupAddress.contactPhone : null } : null,
    drop: live ? { name: o.customerName, phone: o.customerPhone, address: o.dropAddress, landmark: o.dropLandmark, lat: o.dropLat, lng: o.dropLng } : { area: o.dropPincode },
    parcel: { description: o.parcelDescription, weightGrams: o.weightGrams, isFragile: o.isFragile },
    specialInstructions: live ? o.specialInstructions : null,
    earning: { delivery: Math.floor((o.deliveryFee * o.driverSharePct) / 100), return: Math.floor((o.returnFee * o.driverSharePct) / 100) },
    otpLocked: o.otpLocked,
    otpFailedAttempts: o.otpFailedAttempts,
    arrivedAt: o.arrivedAt,
    waitEndsAt: o.arrivedAt ? new Date(o.arrivedAt.getTime() + config.arrivalWaitMinutes * 60_000) : null,
    undeliveredReason: o.undeliveredReason,
  };
}
