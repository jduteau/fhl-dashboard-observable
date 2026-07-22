import { seasons, currentSeason } from "../components/loadfiles.js";

process.stdout.write(JSON.stringify({ seasons, currentSeason }));
