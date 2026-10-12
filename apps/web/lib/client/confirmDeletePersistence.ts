/** Keep a destructive confirmation open until the server acknowledges the deletion. */
export default async function confirmDeletePersistence(
  persist: () => Promise<unknown>,
  afterDelete: () => void
): Promise<boolean> {
  try {
    await persist();
  } catch {
    // The deletion mutation reports its error and restores optimistic state.
    return false;
  }

  afterDelete();
  return true;
}
