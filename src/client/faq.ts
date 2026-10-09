export function initializeFaq(): void {
  const faq = document.querySelector<HTMLElement>('#country-faq');
  const button = document.querySelector<HTMLButtonElement>('#faq-toggle');
  if (!faq || !button) return;
  const toggle = () => {
    faq.hidden = !faq.hidden;
    button.setAttribute('aria-expanded', String(!faq.hidden));
  };
  button.addEventListener('click', toggle);
  if (import.meta.hot) import.meta.hot.dispose(() => button.removeEventListener('click', toggle));
}
