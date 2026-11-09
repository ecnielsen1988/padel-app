import Link from 'next/link';
import { redirect } from 'next/navigation';
import NotificationsCard from '@/app/components/NotificationsCard';
import { messagingAuth } from '@/lib/messagingAuth';

export const metadata = { title: 'Notifikationsindstillinger' };

export default async function NotificationsPage() {
  const { user } = await messagingAuth();
  if (!user) redirect('/login');

  return (
    <main className="min-h-screen bg-[#f4f5f7] px-4 py-6 text-gray-900 dark:bg-[#1a1a2e] dark:text-white">
      <div className="mx-auto max-w-xl">
        <Link href="/startside" className="text-sm font-semibold text-pink-700 dark:text-pink-300">
          ← Tilbage til forsiden
        </Link>
        <h1 className="mb-4 mt-3 text-2xl font-bold">Notifikationsindstillinger</h1>
        <NotificationsCard />
      </div>
    </main>
  );
}
