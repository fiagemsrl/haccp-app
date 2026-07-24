export default function PublicHeader({
  restaurant,
}: {
  restaurant: any;
}) {
  return (
    <header className="rounded-3xl bg-slate-900 p-8 text-white shadow-lg">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">
            Registro HACCP Digitale
          </h1>

          <p className="mt-2 text-slate-300">
            {restaurant.name}
          </p>

          <p className="text-sm text-slate-400">
            {restaurant.address}
          </p>
        </div>

        <div className="rounded-full bg-emerald-500 px-5 py-2 font-semibold">
          Conforme
        </div>
      </div>
    </header>
  );
}