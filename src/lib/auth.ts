import { cookies } from 'next/headers';
import { db, TABLE, GetCommand, PutCommand, DeleteCommand, UpdateCommand } from './dynamodb';
import type { SessionUser } from '@/types';

const SESSION_TTL = 7 * 24 * 60 * 60;
const OTP_TTL = 5 * 60;
const OTP_RESEND_COOLDOWN = 60; // seconds between resends
const OTP_MAX_ATTEMPTS = 5;
const SESSION_COOKIE = 'sbg_session';

function randomToken(): string {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('Cryptographically secure random is unavailable');
  }
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function storeOTP(email: string, otp: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.send(new PutCommand({
    TableName: TABLE.OTPS,
    Item: { email, otp, expiresAt: now + OTP_TTL, sentAt: now, attempts: 0 },
  }));
}

export async function checkOTPResendCooldown(email: string): Promise<boolean> {
  const result = await db.send(new GetCommand({ TableName: TABLE.OTPS, Key: { email } }));
  if (!result.Item) return false;
  const now = Math.floor(Date.now() / 1000);
  return (now - (result.Item.sentAt || 0)) < OTP_RESEND_COOLDOWN;
}

export async function verifyOTP(email: string, otp: string): Promise<'valid' | 'invalid' | 'expired' | 'locked'> {
  const result = await db.send(new GetCommand({ TableName: TABLE.OTPS, Key: { email } }));
  if (!result.Item) return 'invalid';
  const now = Math.floor(Date.now() / 1000);
  if (result.Item.expiresAt < now) return 'expired';
  if ((result.Item.attempts || 0) >= OTP_MAX_ATTEMPTS) return 'locked';
  if (result.Item.otp !== otp) {
    await db.send(new UpdateCommand({
      TableName: TABLE.OTPS,
      Key: { email },
      UpdateExpression: 'SET attempts = if_not_exists(attempts, :zero) + :one',
      ExpressionAttributeValues: { ':zero': 0, ':one': 1 },
    }));
    return 'invalid';
  }
  return 'valid';
}

export async function deleteOTP(email: string): Promise<void> {
  await db.send(new DeleteCommand({ TableName: TABLE.OTPS, Key: { email } }));
}

export async function createSession(user: SessionUser): Promise<string> {
  const token = randomToken();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL;
  await db.send(new PutCommand({
    TableName: TABLE.SESSIONS,
    Item: { sessionToken: token, ...user, expiresAt },
  }));
  return token;
}

export async function getSession(token: string): Promise<SessionUser | null> {
  const result = await db.send(new GetCommand({
    TableName: TABLE.SESSIONS,
    Key: { sessionToken: token },
  }));
  if (!result.Item) return null;
  const now = Math.floor(Date.now() / 1000);
  if (result.Item.expiresAt < now) return null;
  const { sessionToken, expiresAt, ...user } = result.Item;
  return user as SessionUser;
}

export async function deleteSession(token: string): Promise<void> {
  await db.send(new DeleteCommand({ TableName: TABLE.SESSIONS, Key: { sessionToken: token } }));
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSession(token);
}

export function setSessionCookie(token: string): { name: string; value: string; httpOnly: boolean; secure: boolean; sameSite: 'strict'; maxAge: number; path: string } {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_TTL,
    path: '/',
  };
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
