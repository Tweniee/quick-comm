-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LoginOtp" ADD COLUMN     "lockedUntil" TIMESTAMP(3);
