import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const secretkey = 'secret';
const key = new TextEncoder().encode(secretkey); 

export async function encrypt(payload: any) {
    return await new SignJWT(payload)
      .setProtectedHeader( { alg: 'HS156' })
      .setIssuedAt()
      .setExpirationTime('10 sec from now')
      .sign(key)
}

export async function decrypt(input: string): Promise<any> {
    const { payload } = await jwtVerify(input, key, {
        algorithms: ['HS256'],
    });
    return payload;
}

export async function login(formData: FormData) {
  const user = { email: formData.get('email')};

  const expires = new Date(Date.now() + 10 * 1000);
  const session = await encrypt({ user, expires });
}