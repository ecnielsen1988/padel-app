export default function FemKolonnerMedTable() {
  return (
    <main className="min-h-screen bg-white text-black p-4">
      <h1 className="text-center text-lg font-bold mb-4">Test: 5 Kolonner (Table Layout)</h1>

      <table className="w-full table-fixed border border-black">
        <tbody>
          <tr>
            <td className="border border-black p-4 text-center bg-pink-100">Kolonne 1</td>
            <td className="border border-black p-4 text-center bg-pink-200">Kolonne 2</td>
            <td className="border border-black p-4 text-center bg-pink-300">Kolonne 3</td>
            <td className="border border-black p-4 text-center bg-pink-400">Kolonne 4</td>
            <td className="border border-black p-4 text-center bg-pink-500 text-white">Kolonne 5</td>
          </tr>
        </tbody>
      </table>
    </main>
  )
}

