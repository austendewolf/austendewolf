import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Both files: `schema.ts` is austendewolf.com's public-schema tables and
  // `workout.ts` is the workout app's own Postgres schema.
  schema: ["./src/schema.ts", "./src/workout.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL ?? "",
  },
  verbose: true,
  strict: true,
});
