// Helpers for linking a player to their Hockey-Reference, HockeyDB and PuckPedia pages.

// Some 2025-26 ids carry an internal "P-" prefix (added to disambiguate duplicates);
// Hockey-Reference knows the player by the id without it.
export function hockeyRefUrl(id) {
  const ref = id.replace(/^P-/, "");
  return `https://www.hockey-reference.com/players/${ref[0]}/${ref}.html`;
}

export function hockeyDbUrl(id) {
  return `https://www.hockeydb.com/ihdb/stats/pdisplay.php?pid=${id}`;
}

// PuckPedia identifies players by a name slug, e.g. "connor-mcdavid".
export function puckPediaUrl(slug) {
  return `https://puckpedia.com/player/${slug}`;
}

function newWindowLink(text, href) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = text;
  return a;
}

// "HR HDB PP" set of links to the player's reference pages. A link is left out
// when its id is not known.
export function playerLinks({hockeyRef, hockeyDb, puckPedia}) {
  const span = document.createElement("span");
  const links = [
    hockeyRef && newWindowLink("HR", hockeyRefUrl(hockeyRef)),
    hockeyDb && newWindowLink("HDB", hockeyDbUrl(hockeyDb)),
    puckPedia && newWindowLink("PP", puckPediaUrl(puckPedia))
  ].filter(Boolean);
  links.forEach((a, i) => {
    if (i > 0) span.append(" ");
    span.append(a);
  });
  return span;
}

// Inputs.table `format` for a Links column. Point the column at PLAYER_ID (always
// defined, so the cell is rendered) and this builds the links from the whole row.
export const playerLinksFormat = (x, i, data) => playerLinks({
  hockeyRef: data[i].PLAYER_ID,
  hockeyDb: data[i].HockeyDB,
  puckPedia: data[i].PuckPedia
});
