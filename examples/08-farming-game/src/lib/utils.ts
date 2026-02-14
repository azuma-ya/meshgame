import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function msToSec(time: number) {
  const sec = Math.floor(time / 1000) % 60;
  return sec;
}
