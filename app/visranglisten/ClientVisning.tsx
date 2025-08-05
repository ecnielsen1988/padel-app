export default function FemKolonnerTest() {
  return (
    <main className="min-h-screen bg-white text-black px-2 pt-4">
      <h1 className="text-center text-lg font-bold mb-4">Test: 5 Kolonner</h1>

      <div className="grid grid-cols-5 gap-2">
        <div className="bg-pink-100 p-4 rounded">Kolonne 1</div>
        <div className="bg-pink-200 p-4 rounded">Kolonne 2</div>
        <div className="bg-pink-300 p-4 rounded">Kolonne 3</div>
        <div className="bg-pink-400 p-4 rounded">Kolonne 4</div>
        <div className="bg-pink-500 text-white p-4 rounded">Kolonne 5</div>
      </div>
    </main>
  )
}
