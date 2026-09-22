import postgres from 'postgres';

// One connection pool per process (survives HMR in dev via globalThis).
const g = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };

export const sql =
  g.__sql ??
  (g.__sql = postgres(process.env.DATABASE_URL!, {
    max: 10,
    // numeric/bigint come back as JS numbers; gold values are small enough.
    types: {
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: Number },
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: Number },
    },
  }));
