import './style.css';

const status = document.querySelector<HTMLParagraphElement>('#server-status');

async function checkServer(): Promise<void> {
  if (!status) return;

  try {
    const response = await fetch('/health', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Server unavailable');
    const result: unknown = await response.json();
    if (
      typeof result !== 'object' || result === null ||
      !('status' in result) || result.status !== 'ok'
    ) throw new Error('Unexpected response');
    status.textContent = 'Server connected. Ready for the next stage.';
  } catch {
    status.textContent = 'Server unavailable. Please try again shortly.';
  }
}

void checkServer();
