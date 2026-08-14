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
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });
