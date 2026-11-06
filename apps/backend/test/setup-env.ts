process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://qd:qd@localhost:5432/quickdelivery_test';
process.env.JWT_SECRET = 'test-jwt';
process.env.DATA_ENCRYPTION_KEY = 'test-encryption-key-test-encryption-key';
process.env.NODE_ENV = 'test';
process.env.DEV_ECHO_OTP = 'true';
process.env.UPLOAD_DIR = '/tmp/qd-test-uploads';
process.env.DISABLE_SCHEDULERS = 'true';
