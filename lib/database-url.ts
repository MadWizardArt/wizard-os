const CURRENT_VERIFY_FULL_MODES = new Set(["prefer", "require", "verify-ca"]);

export function normalizePgSslMode(connectionString: string) {
  return connectionString.replace(
    /([?&]sslmode=)(prefer|require|verify-ca)(?=(&|$))/i,
    (match, prefix: string, mode: string) =>
      CURRENT_VERIFY_FULL_MODES.has(mode.toLowerCase())
        ? `${prefix}verify-full`
        : match,
  );
}
