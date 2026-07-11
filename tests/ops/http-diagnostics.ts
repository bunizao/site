const diagnosticHeaders = [
  'cf-ray',
  'cf-placement',
  'content-type',
  'server',
] as const;

export async function expectHttpOk(response: Response, label: string): Promise<void> {
  if (response.ok) return;

  const headers = diagnosticHeaders
    .flatMap((name) => {
      const value = response.headers.get(name);
      return value ? [`${name}=${value}`] : [];
    })
    .join(', ');
  const body = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 1_000);
  const details = [
    `${label} -> ${response.status} ${response.statusText}`.trim(),
    headers ? `headers: ${headers}` : '',
    body ? `body: ${body}` : '',
  ].filter(Boolean).join('\n');

  throw new Error(details);
}
