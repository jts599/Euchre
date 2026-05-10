/**
 * Waits for a specified number of milliseconds.
 * @param ms Number of ms to sleep
 * @returns Promise that resolves after the specified time
 */
export async function sleep (ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}