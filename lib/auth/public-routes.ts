/** Routes that must not force the encrypted DB unlock gate. */
export function isPublicRoute(path: string): boolean {
  if (
    path === "/" ||
    path === "/lock" ||
    path === "/login" ||
    path === "/verify-otp" ||
    path.endsWith("/login") ||
    path.endsWith("/register") ||
    path.endsWith("/set-app-pin")
  ) {
    return true;
  }
  return path.includes("(auth)");
}
