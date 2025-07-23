export default function Home() {
  return (
    <main className="min-h-screen flex flex-col justify-center items-center p-8">
      <h1 className="text-4xl font-bold mb-6">Velkommen til Padel Rangliste</h1>
      <p className="mb-4 text-center max-w-md">
        Her kan du se ranglisten, tilmelde kampe og meget mere.
      </p>
      <a
        href="/login"
        className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
      >
        Log ind
      </a>
    </main>
  );
}
