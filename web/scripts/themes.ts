// Writes src/app/themes.css from src/lib/themes.ts. Run with `pnpm themes` after changing a theme.
import { writeFileSync } from "node:fs";
import { themeCss } from "../src/lib/themes.ts";

writeFileSync(new URL("../src/app/themes.css", import.meta.url), themeCss());
