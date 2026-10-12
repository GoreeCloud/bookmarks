/**
 * Only dismiss an editor after its write is confirmed. A failed mutation is
 * reported by the caller's mutation hook, which also restores optimistic data.
 */
export default async function persistBeforeClose<T>(
  value: T,
  persist: (value: T) => Promise<unknown>,
  close: () => void
): Promise<boolean> {
  try {
    await persist(value);
  } catch {
    return false;
  }

  close();
  return true;
}
