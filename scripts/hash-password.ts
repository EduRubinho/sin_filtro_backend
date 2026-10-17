import { hashPassword } from '../src/user/infrastructure/ScryptPasswords.ts';

// Recibe la contraseña por stdin, nunca como argumento visible en procesos.
let input = '';
for await (const chunk of process.stdin) input += chunk;
const password = input.replace(/\r?\n$/, '');
if (password.length < 8 || password.length > 64) throw new Error('La contraseña debe tener entre 8 y 64 caracteres.');
console.log(await hashPassword(password));
