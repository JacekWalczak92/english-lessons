export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function sitePath(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}

export function absoluteSiteUrl(path = "/") {
  if (typeof window === "undefined") return sitePath(path);
  return `${window.location.origin}${sitePath(path)}`;
}
