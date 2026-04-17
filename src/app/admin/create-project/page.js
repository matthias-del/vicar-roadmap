import { cookies } from 'next/headers';
import { adminToken, ADMIN_COOKIE } from '@/lib/authCookie';
import LoginForm from '@/components/LoginForm';
import CreateProjectForm from '@/components/CreateProjectForm';

export const dynamic = 'force-dynamic';

export default async function CreateProjectPage() {
  const adminPass = process.env.ADMIN_PASSWORD;
  if (adminPass) {
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get(ADMIN_COOKIE)?.value;
    const authed = cookieVal === adminToken(adminPass);
    if (!authed) return <LoginForm adminMode />;
  }

  return <CreateProjectForm />;
}
