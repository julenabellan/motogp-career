// ============================================================
// DATA.JS — Países y equipos
// ============================================================

const COUNTRIES = [
  ["España","ES"],["Italia","IT"],["Francia","FR"],["Reino Unido","GB"],
  ["Portugal","PT"],["Alemania","DE"],["Austria","AT"],["Países Bajos","NL"],
  ["Bélgica","BE"],["Suiza","CH"],["Irlanda","IE"],["Polonia","PL"],
  ["República Checa","CZ"],["Eslovaquia","SK"],["Hungría","HU"],["Croacia","HR"],
  ["Eslovenia","SI"],["Serbia","RS"],["Bosnia","BA"],["Montenegro","ME"],
  ["Grecia","GR"],["Turquía","TR"],["Finlandia","FI"],["Suecia","SE"],
  ["Noruega","NO"],["Dinamarca","DK"],["Ucrania","UA"],["Rumanía","RO"],
  ["Bulgaria","BG"],["Japón","JP"],["China","CN"],["Corea del Sur","KR"],
  ["Tailandia","TH"],["Indonesia","ID"],["Malasia","MY"],["Filipinas","PH"],
  ["Vietnam","VN"],["India","IN"],["Pakistán","PK"],["Australia","AU"],
  ["Nueva Zelanda","NZ"],["Estados Unidos","US"],["Canadá","CA"],["México","MX"],
  ["Argentina","AR"],["Brasil","BR"],["Chile","CL"],["Colombia","CO"],
  ["Perú","PE"],["Uruguay","UY"],["Paraguay","PY"],["Venezuela","VE"],
  ["Ecuador","EC"],["Sudáfrica","ZA"],["Marruecos","MA"],["Egipto","EG"],
  ["Arabia Saudí","SA"],["Qatar","QA"],["Emiratos Árabes Unidos","AE"]
].map(([name, code]) => ({ name, code }));

function flagImg(code, className = "flag-img") {
  const c = code.toLowerCase();
  return `<img class="${className}" src="https://flagcdn.com/w40/${c}.png" srcset="https://flagcdn.com/w80/${c}.png 2x" alt="${code}" loading="lazy">`;
}

const TEAMS = {
  MotoGP: [
    { name: "Ducati Lenovo Team",                  strength: 96, color: "#CC0000",  logo: "Ducati"     },
    { name: "Aprilia Racing",                       strength: 93, color: "#888888",  logo: "Aprilia"    },
    { name: "Red Bull KTM Factory Racing",          strength: 91, color: "#FF6600",  logo: "Ktm"        },
    { name: "Pertamina Enduro VR46 Racing Team",    strength: 90, color: "#1E3F20",  logo: "VR46"       },
    { name: "Gresini Racing MotoGP",               strength: 89, color: "#87CEFA",  logo: "Gresini"    },
    { name: "Red Bull KTM Tech3",                  strength: 87, color: "#002D62",  logo: "Tech3"      },
    { name: "Trackhouse MotoGP Team",              strength: 86, color: "#002B49",  logo: "Trackhouse" },
    { name: "Monster Energy Yamaha MotoGP",        strength: 85, color: "#001970",  logo: "Yamaha"     },
    { name: "Prima Pramac Racing",                 strength: 84, color: "#7B1FA2",  logo: "Pramac"     },
    { name: "LCR Honda",                           strength: 84, color: "#E60012",  logo: "Lcr"        },
    { name: "Repsol Honda Team",                   strength: 83, color: "#FF6600",  logo: "Honda"      },
  ],
  WorldSBK: [
    { name: "Aruba.it Racing - Ducati",               strength: 81, color: "#CC0000", logo: "Aruba"        },
    { name: "ROKiT BMW Motorrad WorldSBK Team",       strength: 80, color: "#0066B2", logo: "BMW"          },
    { name: "Bimota by Kawasaki Racing Team",         strength: 79, color: "#00A352", logo: "Bimota"       },
    { name: "Pata Maxus Yamaha",                      strength: 78, color: "#002D62", logo: "PatoYamaha"   },
    { name: "Barni Spark Racing Team",                strength: 77, color: "#FF0000", logo: "Barni"        },
    { name: "Team HRC (Honda)",                       strength: 76, color: "#CC0000", logo: "HRC"          },
    { name: "GYTR GRT Yamaha WorldSBK Team",          strength: 75, color: "#1A237E", logo: "GYTR"         },
    { name: "ELF Marc VDS Racing Team (SBK)",         strength: 74, color: "#004080", logo: "MarcVDS"      },
    { name: "Kawasaki WorldSBK Team",                 strength: 73, color: "#00A352", logo: "Kawasaki"     },
    { name: "Team Goeleven",                          strength: 72, color: "#555555", logo: "GoEleven"     },
    { name: "Motocorsa Racing",                       strength: 71, color: "#E53935", logo: "Motocorsa"     },
    { name: "Motoxracing WorldSBK Team",              strength: 70, color: "#FFB300", logo: "MotoX"        },
    { name: "MGM Optical Express",                    strength: 70, color: "#333333", logo: "MGM"          },
  ],
  Moto2: [
    { name: "ELF Marc VDS Racing Team",              strength: 80, color: "#004080", logo: "MarcVDS"        },
    { name: "MT Helmets – MSi",                      strength: 79, color: "#000000", logo: "MSI"            },
    { name: "Gresini Racing Moto2",                  strength: 78, color: "#D32F2F", logo: "GresiniMoto2"   },
    { name: "SpeedUp Racing",                        strength: 77, color: "#E53935", logo: "SpeedUp"        },
    { name: "Liqui Moly Dynavolt Intact GP",         strength: 76, color: "#1976D2", logo: "IntactGp"       },
    { name: "CFMOTO Aspar Team",                     strength: 75, color: "#00838F", logo: "ASPAR"          },
    { name: "Fantic Racing",                         strength: 74, color: "#E53935", logo: "Fantic"         },
    { name: "OnlyFans American Racing Team",         strength: 73, color: "#00A3E0", logo: "AmericanRacing" },
    { name: "Momoven Racing",                        strength: 72, color: "#FF6F00", logo: "Momoven"        },
    { name: "IDEMITSU Honda Team Asia",              strength: 71, color: "#D50000", logo: "HondaAsia"      },
    { name: "Italtrans Racing Team",                 strength: 70, color: "#1565C0", logo: "Italtrans"      },
    { name: "BLU CRU Pramac Yamaha Moto2",           strength: 69, color: "#1E88E5", logo: "BluCruPramac"   },
    { name: "KLINT Forward Factory Team",            strength: 68, color: "#37474F", logo: "Klint"          },
  ],
  Moto3: [
    { name: "Leopard Racing",                        strength: 58, color: "#00A651", logo: "Leopard"        },
    { name: "Red Bull KTM Ajo",                      strength: 57, color: "#002D62", logo: "Ajo"            },
    { name: "CFMOTO Aspar Team",                     strength: 56, color: "#00838F", logo: "ASPAR"          },
    { name: "MT Helmets – MSi",                      strength: 55, color: "#000000", logo: "MSI"            },
    { name: "Liqui Moly Dynavolt Intact GP",         strength: 54, color: "#1976D2", logo: "IntactGp"       },
    { name: "Red Bull KTM Tech3",                    strength: 53, color: "#FF6600", logo: "Tech3"          },
    { name: "Honda Team Asia",                       strength: 53, color: "#D50000", logo: "HondaAsia"      },
    { name: "Angeluss MTA Team / LEVELUP - MTA",     strength: 52, color: "#5E35B1", logo: "MTA"            },
    { name: "SIC58 Squadra Corse",                   strength: 52, color: "#FFD700", logo: "Sic58"          },
    { name: "Snipers Team",                          strength: 51, color: "#212121", logo: "SNIPERS"        },
    { name: "CIP Green Power",                       strength: 51, color: "#388E3C", logo: "CIP"            },
    { name: "Boé Motorsports",                       strength: 50, color: "#0D47A1", logo: "BOE"            },
    { name: "MLav Racing",                           strength: 50, color: "#B71C1C", logo: "MLAV"           },
  ],
  Supersport: [
    { name: "ZXMoto Factory Evan Bros Racing",       strength: 68, color: "#111111", logo: "ZXmoto"         },
    { name: "Pata Yamaha Ten Kate Racing",            strength: 76, color: "#002D62", logo: "TenKate"        },
    { name: "GMT94 Yamaha",                           strength: 73, color: "#002D62", logo: "GMT94"          },
    { name: "AS bLU cRU Racing Team",                 strength: 71, color: "#1E88E5", logo: "ASracing"       },
    { name: "PTR Triumph Factory Racing",             strength: 74, color: "#000000", logo: "Triumph"        },
    { name: "QJMOTOR Factory Racing",                 strength: 72, color: "#D32F2F", logo: "QJ"             },
    { name: "Kawasaki WorldSSP Team",                 strength: 73, color: "#00A352", logo: "Kawasaki"       },
    { name: "Honda Racing WorldSSP Team",             strength: 75, color: "#CC0000", logo: "HRC"            },
    { name: "Orelac Racing Verdnatura",               strength: 69, color: "#2E7D32", logo: "Orelac"         },
    { name: "Feel Racing WorldSSP Team",              strength: 70, color: "#D32F2F", logo: "Feel"           },
    { name: "Cerba Yamaha Racing Team",               strength: 69, color: "#1976D2", logo: "Cerba"          },
    { name: "WRP Racing",                             strength: 71, color: "#003366", logo: "WRP"            },
  ],
};

const POINTS_TABLE = [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const STAT_ICONS = {
  cg:  `<svg class="stat-icon icon-cg"  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4"/></svg>`,
  pod: `<svg class="stat-icon icon-pod" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.2 15 2.7 7.1a2 2 0 0 1 .1-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.1a2 2 0 0 1 .1 2.2L16.8 15"/><circle cx="12" cy="17" r="5"/></svg>`,
  pol: `<svg class="stat-icon icon-pol" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 3 14h7l-1 8 11-14h-7l1-6Z"/></svg>`,
  dnf: `<svg class="stat-icon icon-dnf" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 14 9 21 8 16 13 20 19 13 16 12 22 11 16 4 19 8 13 3 8 10 9Z"/></svg>`,
};

function teamColor(name, championship) {
  if (championship && TEAMS[championship]) {
    const found = TEAMS[championship].find((t) => t.name === name);
    if (found && found.color) return found.color;
  }
  for (const champ in TEAMS) {
    const found = TEAMS[champ].find((t) => t.name === name);
    if (found && found.color) return found.color;
  }
  return "#3B82F6";
}

function teamLogo(name, championship) {
  if (championship && TEAMS[championship]) {
    const found = TEAMS[championship].find((t) => t.name === name);
    if (found && found.logo) return `logos/${found.logo}.png`;
  }
  for (const champ in TEAMS) {
    const found = TEAMS[champ].find((t) => t.name === name);
    if (found && found.logo) return `logos/${found.logo}.png`;
  }
  return null;
}
