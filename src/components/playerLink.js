// Helpers for linking a player's name to their Hockey-Reference page.

export function hockeyRefUrl(id) {
  return `https://www.hockey-reference.com/players/${id[0]}/${id}.html`;
}

// Anchor that opens the player's Hockey-Reference page in a new window.
// Falls back to plain text when there is no id to link to.
export function playerLink(name, id) {
  if (!id) return name;
  const a = document.createElement("a");
  a.href = hockeyRefUrl(id);
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = name;
  return a;
}

// Inputs.table `format` for a Name column whose rows carry a PLAYER_ID.
export const playerNameFormat = (x, i, data) => playerLink(x, data[i].PLAYER_ID);
