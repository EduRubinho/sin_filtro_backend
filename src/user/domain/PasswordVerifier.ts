export interface PasswordVerifier {
  verify(password: string, hash: string | null): Promise<boolean>;
}
