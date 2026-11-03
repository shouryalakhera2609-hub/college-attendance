export function validateLogin(id, pw) {
  const e = {};
  if (!id || id.trim().length < 3) e.identifier = 'Enter your email address';
  if (!pw) e.password = 'Enter your password';
  return e;
}
