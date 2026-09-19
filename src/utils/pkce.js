function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomSecret() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

export async function createChallenge(verifier) {
  return base64url(await sha256(verifier));
}

export async function keyDigest(key) {
  return Array.from(await sha256(key), byte => byte.toString(16).padStart(2, '0')).join('');
}
