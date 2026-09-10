import { z } from "zod";

const normalizedEmail = z.string().trim().toLowerCase().pipe(z.email());

export const loginFormSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(8).max(128),
});

export const emailFormSchema = z.object({
  email: normalizedEmail,
});

export const updatePasswordFormSchema = z
  .object({
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((data) => data.password === data.confirmPassword, {
    // A code, not copy. The action replaces it with a localized message
    // before anything reaches the screen, so a Chinese sentence here was
    // untranslated text that could only ever leak by accident.
    message: "password-confirmation-mismatch",
    path: ["confirmPassword"],
  });
