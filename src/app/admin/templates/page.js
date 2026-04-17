import { cookies } from 'next/headers';
import { adminToken, ADMIN_COOKIE } from '@/lib/authCookie';
import { listTemplates } from '@/lib/milestoneTemplates';
import LoginForm from '@/components/LoginForm';
import ManageTemplatesForm from '@/components/ManageTemplatesForm';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const adminPass = process.env.ADMIN_PASSWORD;
  if (adminPass) {
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get(ADMIN_COOKIE)?.value;
    const authed = cookieVal === adminToken(adminPass);
    if (!authed) return <LoginForm adminMode />;
  }

  const templates = await listTemplates();
  return <ManageTemplatesForm initialTemplates={templates} />;
}
