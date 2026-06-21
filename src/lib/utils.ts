import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Утилита shadcn: объединяет классы (clsx) и разрешает конфликты Tailwind.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
