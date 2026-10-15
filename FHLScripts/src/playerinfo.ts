export interface PlayerInfo {
  ID: string;
  Player: string;
  BirthDate: string;
  Tm: string;
  Pos: string;
}

export interface PlayerStats {
  hockeyRef: string;
  name: string;
  team: string;
  pos: string;
  stats: {
    //Common stats
    gp?: number;
    toi?: number;
    goals?: number;
    assists?: number;
    pim?: number;
    // Skater Stats
    plusMinus?: number;
    ppg?: number;
    shg?: number;
    gwg?: number;
    fow?: number;
    fol?: number;
    shots?: number;
    blocks?: number;
    hits?: number;
    take?: number;
    give?: number;
    // Goalie Stats
    starts?: number;
    wins?: number;
    losses?: number;
    ties?: number;
    so?: number;
    ga?: number;
    sa?: number;
  };
}
