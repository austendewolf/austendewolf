import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // `schema.ts` is austendewolf.com's public-schema tables; `workout.ts` and
  // `daybook.ts` are each their own Postgres schema.
  schema: ["./src/schema.ts", "./src/workout.ts", "./src/daybook.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL ?? "",
  },
  verbose: true,
  strict: true,
});
