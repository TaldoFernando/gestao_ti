import { useEffect, useState, type FormEvent } from 'react';
import { api, login, type AppUser } from '../api';
import { Button, ErrorText, Field, input } from '../ui';

export default function Profile() {
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<AppUser>('/users/me')
      .then((user) => {
        setProfile(user);
        setName(user.name);
        setEmail(user.email);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (password && password !== confirmation) {
      setError('A confirmação da nova senha não corresponde.');
      return;
    }

    setBusy(true);
    try {
      const normalizedEmail = email.trim().toLocaleLowerCase('pt-BR');
      await api<AppUser>('/users/me', {
        method: 'PATCH',
        json: {
          name: name.trim(),
          email: normalizedEmail,
          currentPassword,
          ...(password ? { password } : {}),
        },
      });
      // Renovar a sessão para atualizar nome e demais dados guardados no token.
      await login(normalizedEmail, password || currentPassword);
      setCurrentPassword('');
      setPassword('');
      setConfirmation('');
      setMessage('Seus dados foram atualizados.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="border-b border-ink pb-6">
        <h1 className="text-4xl font-medium tracking-tight">Meu perfil</h1>
        <p className="mt-1 text-muted">Atualize seu nome, e-mail ou senha de acesso.</p>
      </div>
      <form onSubmit={submit} className="mt-8 grid max-w-xl gap-5">
        <Field label="Nome">
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" className={input} />
        </Field>
        <Field label="E-mail">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" className={input} />
        </Field>
        <Field label="Senha atual (obrigatória para salvar)">
          <input value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} type="password" required autoComplete="current-password" className={input} />
        </Field>
        <Field label="Nova senha (opcional, mínimo 8 caracteres)">
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} autoComplete="new-password" className={input} />
        </Field>
        {password && (
          <Field label="Confirme a nova senha">
            <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} type="password" required autoComplete="new-password" className={input} />
          </Field>
        )}
        <ErrorText>{error}</ErrorText>
        {message && <p role="status" className="text-sm text-[#28613b]">{message}</p>}
        <div><Button variant="primary" disabled={!profile || busy}>{busy ? 'Salvando…' : 'Salvar alterações'}</Button></div>
      </form>
    </>
  );
}
