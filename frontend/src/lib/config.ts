/** Verifikasi email lewat OTP (/auth/verify/*); false = register langsung disusul login. */
export const OTP_ENABLED = true;

/** Pengaturan notifikasi belum punya endpoint backend; true = `api/settings.ts` memakai tiruan lokal. */
export const USE_MOCK_API = true;

/** Masuk dengan Google belum didukung backend; false = tombol dan pemisah "atau" disembunyikan. */
export const GOOGLE_AUTH_ENABLED = false;
