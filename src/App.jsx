import LP2DMetodoGrafico from './LP2DMetodoGrafico'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="p-4 border-b dark:border-slate-700 flex items-center justify-between">
        <h1 className="text-lg font-semibold">LP2D Gráfico</h1>
        {/* (toggle removido) */}
      </header>

      {/* Contenido principal */}
      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* Tarjeta principal del graficador */}
        <section className="rounded-2xl border p-4 shadow-sm bg-white border-slate-200
                            dark:bg-slate-800 dark:border-slate-700">
          <LP2DMetodoGrafico />
        </section>
      </main>
    </div>
  )
}
