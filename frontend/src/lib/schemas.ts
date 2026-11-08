import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Username atau email wajib diisi'),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
});
export type LoginForm = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username minimal 3 karakter')
    .max(30, 'Username maksimal 30 karakter')
    .regex(/^[A-Za-z0-9_.]+$/, 'Hanya huruf, angka, titik, dan underscore'),
  email: z.string().trim().min(1, 'Email wajib diisi').email('Format email tidak valid'),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter'),
});
export type RegisterForm = z.infer<typeof registerSchema>;

export const OTP_LENGTH = 6;
