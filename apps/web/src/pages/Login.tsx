import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { login } from '../api';
import { Button, ErrorText, Field, input } from '../ui';

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await login(String(form.get('email')), String(form.get('password')));
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-white font-sans text-ink md:grid-cols-[1fr_1.1fr]">
      <section className="flex flex-col justify-between bg-ink p-8 text-white md:p-12">
        <b className="text-lg font-semibold">TI Prefeitura</b>
        <h1 className="my-12 text-5xl font-medium leading-[1.02] tracking-tight md:text-6xl">
          Patrimônio e chamados de TI. <span className="text-[#8a8a8a]">Em um só lugar.</span>
        </h1>
        <p className="text-sm text-[#9a9a9a]">Prefeitura Municipal de Jacaraú · Setor de Tecnologia da Informação</p>
      </section>
      <section className="flex items-center p-8 md:p-12">
        <form onSubmit={submit} className="grid w-full max-w-sm gap-5">
          <h2 className="text-3xl font-medium tracking-tight">Entrar</h2>
          <Field label="E-mail">
            <input name="email" type="email" required autoComplete="username" className={input} />
          </Field>
          <Field label="Senha">
            <input name="password" type="password" required autoComplete="current-password" className={input} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button variant="primary" disabled={busy} className="w-full">{busy ? 'Entrando…' : 'Entrar'}</Button>
        </form>
      </section>
    </div>
  );
}
