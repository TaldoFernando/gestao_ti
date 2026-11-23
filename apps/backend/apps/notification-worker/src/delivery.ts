export async function deliver(completed: string[], email: () => Promise<unknown>, whatsapp?: () => Promise<unknown>) {
  const failures: string[] = [];
  if (!completed.includes('email')) {
    try { await email(); completed.push('email'); }
    catch { failures.push('E-mail: envio SMTP falhou.'); }
  }
  if (whatsapp && !completed.includes('whatsapp')) {
    try { await whatsapp(); completed.push('whatsapp'); }
    catch (error) { failures.push((error as Error).message); }
  }
  if (failures.length) throw new Error(failures.join(' '));
}
