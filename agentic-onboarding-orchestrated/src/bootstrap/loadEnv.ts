import fs from "fs";
import path from "path";
import dotenv from "dotenv";

let loaded = false;

export function loadEnvFiles(): void {
  if (loaded) return;
  loaded = true;

  const cwd = process.cwd();
  const files = [".env", ".env.local"];

  for (const file of files) {
    const fullPath = path.join(cwd, file);
    if (!fs.existsSync(fullPath)) continue;

    dotenv.config({
      path: fullPath,
      override: file !== ".env",
      quiet: true,
    });
  }
}

loadEnvFiles();
