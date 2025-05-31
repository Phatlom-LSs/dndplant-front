'use server';

import { login } from '../../../lib'
import { redirect } from 'next/navigation'

export async function handleLogin(_, formData) {
    const email = formData.get('email');
    const password = formData.get('password');

    const result = await login({email, password})

    if (result?.access_token) {
        redirect('/')
    }
};
