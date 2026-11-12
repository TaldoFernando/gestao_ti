import { randomBytes } from 'node:crypto';

// Sem 0/O/1/I para o cidadão não errar ao digitar.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newProtocol() {
  const chars = [...randomBytes(8)].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `JAC-${chars.slice(0, 4)}-${chars.slice(4)}`;
}
