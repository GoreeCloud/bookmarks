/** Keep confirmation visible after a rejected or failed action. */
export default async function confirmActionBeforeClose(
  action: () => unknown,
  close: () => void
): Promise<boolean> {
  try {
    await action();
  } catch {
    // The calling mutation reports its error. Preserve confirmation for retry.
    return false;
  }

  close();
  return true;
}
