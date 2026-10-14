import { hashPassword } from '../src/user/infrastructure/ScryptPasswords.ts';

// Recibe la contraseña por stdin, nunca como argumento visible en procesos.
let input = '';
for await (const chunk of process.stdin) input += chunk;
const password = input.replace(/\r?\n$/, '');
if (!password || password.length > 1024) throw new Error('Contraseña vacía o demasiado larga.');
console.log(await hashPassword(password));
