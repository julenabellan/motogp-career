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

// Nombres legibles para los campeonatos cuyo identificador interno no
// coincide con el nombre que debe verse en pantalla (insignias de oferta,
// etiqueta de campeonato del piloto, desglose de títulos, tarjetas de
// equipo de la retirada, etc.). El resto de campeonatos (Moto3, Moto2,
// MotoGP, SportBike, Supersport, WorldSBK, ESBK, BSB, CIV) usan su propio
// identificador tal cual como nombre visible, así que no hace falta
// listarlos aquí.
const CHAMP_LABELS = {
  MotoJunior: "FIM JuniorGP",
  RedBullRookies: "Red Bull Rookies Cup",
  YamahaR3Cup: "Yamaha R3 Cup",
  Moto2Euro: "Europeo de Moto2",
  Stock600: "Stock 600",
};
function champLabel(key) {
  return CHAMP_LABELS[key] || key;
}

const TEAMS = {
  // ----------------------------------------------------------------
  // FASE DE FORMACIÓN (16 años, punto de partida de la carrera) — tres
  // campeonatos júnior, previos a Moto3 y SportBike:
  //   · FIM JuniorGP (varios equipos)      → vía hacia Moto3
  //   · Red Bull Rookies Cup (monomarca)   → vía hacia Moto3
  //   · Yamaha R3 Cup (monomarca)          → vía hacia SportBike
  // Los campeonatos monomarca solo tienen un equipo: toda la parrilla
  // corre con la misma moto, así que el "strength" de equipo apenas debe
  // influir en el resultado (ver CATEGORY_WEIGHTS en script.js).
  // ----------------------------------------------------------------
  MotoJunior: [
    { name: "Estrella Galicia 0,0 Monlau",              strength: 46, color: "#1DB954", logo: "EstrellaGalicia" },
    { name: "Aspar Junior Team",                  strength: 45, color: "#0199b1", logo: "ASPAR"           },
    { name: "KTM Junior Team",                    strength: 44, color: "#ea5d24", logo: "Ktm"             },
    { name: "Honda Asia Junior Team",            strength: 43, color: "#cc1517", logo: "HondaAsia"      },
    { name: "MTA Junior Team",                     strength: 42, color: "#ca2c23", logo: "MTA"            },
    { name: "Team Laglisse",                   strength: 42, color: "#cc1517", logo: "Laglisse"            },
    { name: "Momoven Racing Junior Team",                strength: 44, color: "#ff6500", logo: "Momoven"        },
  ],
  RedBullRookies: [
    { name: "Red Bull Rookies Cup",               strength: 42, color: "#0b1f6e", logo: "RedBullRookies" },
  ],
  YamahaR3Cup: [
    { name: "Yamaha R3 bLU cRU Cup",              strength: 36, color: "#21409a", logo: "R3Cup"    },
  ],
  MotoGP: [
    { name: "Ducati Lenovo Team",                  strength: 96, color: "#CC0000",  logo: "Ducati"     },
    { name: "Aprilia Racing",                       strength: 93, color: "#810098",  logo: "Aprilia"    },
    { name: "Red Bull KTM Factory Racing",          strength: 91, color: "#ea5d24",  logo: "Ktm"        },
    { name: "Pertamina Enduro VR46 Racing Team",    strength: 90, color: "#ebfb50",  logo: "VR46"       },
    { name: "Gresini Racing MotoGP",               strength: 89, color: "#99b9e2",  logo: "Gresini"    },
    { name: "Red Bull KTM Tech3",                  strength: 87, color: "#ea5d24",  logo: "Tech3"      },
    { name: "Trackhouse MotoGP Team",              strength: 86, color: "#ffff00",  logo: "Trackhouse" },
    { name: "Monster Energy Yamaha MotoGP",        strength: 85, color: "#001970",  logo: "Yamaha"     },
    { name: "Prima Pramac Racing",                 strength: 84, color: "#9832c9",  logo: "Pramac"     },
    { name: "LCR Honda",                           strength: 84, color: "#e40521",  logo: "Lcr"        },
    { name: "Repsol Honda Team",                   strength: 83, color: "#cc1517",  logo: "Honda"      },
  ],
  WorldSBK: [
    { name: "Aruba.it Racing - Ducati",               strength: 81, color: "#CC0000", logo: "Aruba"        },
    { name: "ROKiT BMW Motorrad WorldSBK Team",       strength: 80, color: "#141431", logo: "BMW"          },
    { name: "Bimota by Kawasaki Racing Team",         strength: 79, color: "#e61e28", logo: "Bimota"       },
    { name: "Pata Maxus Yamaha",                      strength: 78, color: "#21409a", logo: "PataYamaha"   },
    { name: "Barni Spark Racing Team",                strength: 77, color: "#d50005", logo: "Barni"        },
    { name: "Team HRC (Honda)",                       strength: 76, color: "#cc1517", logo: "HRC"          },
    { name: "GYTR GRT Yamaha WorldSBK Team",          strength: 75, color: "#21409a", logo: "GYTR"         },
    { name: "ELF Marc VDS Racing Team (SBK)",         strength: 74, color: "#722c41", logo: "MarcVDS"      },
    { name: "Kawasaki WorldSBK Team",                 strength: 73, color: "#59c84a", logo: "Kawasaki"     },
    { name: "Team Goeleven",                          strength: 72, color: "#ffff00", logo: "GoEleven"     },
    { name: "Motocorsa Racing",                       strength: 71, color: "#e56042", logo: "Motocorsa"    },
    { name: "Motoxracing WorldSBK Team",              strength: 70, color: "#FFB300", logo: "MotoX"        },
    { name: "MGM Optical Express",                    strength: 70, color: "#008bdb", logo: "MGM"          },
    { name: "Superbike Advocates Racing",             strength: 69, color: "#d50005", logo: "Advocates"    },
  ],
  Moto2: [
    { name: "ELF Marc VDS Racing Team",              strength: 80, color: "#722c41", logo: "MarcVDS"        },
    { name: "MT Helmets – MSi",                      strength: 79, color: "#241f4f", logo: "MSI"            },
    { name: "Gresini Racing Moto2",                  strength: 78, color: "#99b9e2", logo: "GresiniMoto2"   },
    { name: "SpeedUp Racing",                        strength: 77, color: "#ee332e", logo: "SpeedUp"        },
    { name: "Liqui Moly Dynavolt Intact GP",         strength: 76, color: "#443e40", logo: "IntactGp"       },
    { name: "CFMOTO Aspar Team",                     strength: 75, color: "#0199b1", logo: "ASPAR"          },
    { name: "Fantic Racing",                         strength: 74, color: "#ee332e", logo: "Fantic"         },
    { name: "OnlyFans American Racing Team",         strength: 73, color: "#0504b7", logo: "AmericanRacing" },
    { name: "Momoven Racing",                        strength: 72, color: "#ff6500", logo: "Momoven"        },
    { name: "IDEMITSU Honda Team Asia",              strength: 71, color: "#cc1517", logo: "HondaAsia"      },
    { name: "Italtrans Racing Team",                 strength: 70, color: "#0602ae", logo: "Italtrans"      },
    { name: "BLU CRU Pramac Yamaha Moto2",           strength: 69, color: "#0c1c8c", logo: "BluCruPramac"   },
    { name: "KLINT Forward Factory Team",            strength: 68, color: "#79ebd1", logo: "Klint"          },
  ],
  // Europeo de Moto2 (FIM Moto2 European Championship) — de momento,
  // solo una vía de escape para pilotos de Moto2 a los que no les acaba
  // de ir bien allí, NO un peldaño hacia ninguna otra categoría todavía.
  // La lógica de acceso/salida (quién recibe estas ofertas y hacia dónde
  // se puede ir después) se definirá más adelante; por ahora solo están
  // los equipos, colores y logos.
  Moto2Euro: [
    { name: "Top Surface Aspar Team",                strength: 64, color: "#0199b1", logo: "TopSurface"     },
    { name: "Team Ciatti-Boscoscuro",                strength: 62, color: "#cef300", logo: "Ciatti"         },
    { name: "AGR Team",                              strength: 60, color: "#0b1f43", logo: "AGR"            },
    { name: "Team Stylobike Yamaha Philippines",     strength: 58, color: "#21409a", logo: "StyloBike"      },
    { name: "Cardoso Racing",                        strength: 59, color: "#21409a", logo: "Cardoso"        },
    { name: "GV Racing",                             strength: 55, color: "#29304c", logo: "GV"             },
    { name: "MMR",                                   strength: 61, color: "#5981bc", logo: "MMR"            },
    { name: "Fau55 Tey Racing",                      strength: 60, color: "#cef300", logo: "Fau55"          },
  ],
  Moto3: [
    { name: "Leopard Racing",                        strength: 58, color: "#82cad1", logo: "Leopard"        },
    { name: "Red Bull KTM Ajo",                      strength: 57, color: "#ea5d24", logo: "Ajo"            },
    { name: "CFMOTO Aspar Team",                     strength: 56, color: "#0199b1", logo: "ASPAR"          },
    { name: "MT Helmets – MSi",                      strength: 55, color: "#241f4f", logo: "MSI"            },
    { name: "Liqui Moly Dynavolt Intact GP",         strength: 54, color: "#443e40", logo: "IntactGp"       },
    { name: "Red Bull KTM Tech3",                    strength: 53, color: "#ea5d24", logo: "Tech3"          },
    { name: "Honda Team Asia",                       strength: 53, color: "#cc1517", logo: "HondaAsia"      },
    { name: "Angeluss MTA Team / LEVELUP - MTA",     strength: 52, color: "#ca2c23", logo: "MTA"            },
    { name: "SIC58 Squadra Corse",                   strength: 52, color: "#ca2c23", logo: "Sic58"          },
    { name: "Snipers Team",                          strength: 51, color: "#f9eb1d", logo: "SNIPERS"        },
    { name: "CIP Green Power",                       strength: 51, color: "#12a236", logo: "CIP"            },
    { name: "Boé Motorsports",                       strength: 50, color: "#ee332e", logo: "BOE"            },
    { name: "MLav Racing",                           strength: 50, color: "#0b1f43", logo: "MLAV"           },
  ],
  Supersport: [
    { name: "ZXMoto Factory Evan Bros Racing",       strength: 68, color: "#5981bc", logo: "ZXmoto"         },
    { name: "Pata Yamaha Ten Kate Racing",            strength: 76, color: "#21409a", logo: "TenKate"        },
    { name: "GMT94 Yamaha",                           strength: 73, color: "#21409a", logo: "GMT94"          },
    { name: "AS bLU cRU Racing Team",                 strength: 71, color: "#1E88E5", logo: "ASracing"       },
    { name: "PTR Triumph Factory Racing",             strength: 74, color: "#efff00", logo: "Triumph"        },
    { name: "QJMOTOR Factory Racing",                 strength: 72, color: "#792024", logo: "QJ"             },
    { name: "Kawasaki WorldSSP Team",                 strength: 73, color: "#59c84a", logo: "Kawasaki"       },
    { name: "Honda Racing WorldSSP Team",             strength: 75, color: "#cc1517", logo: "HRC"            },
    { name: "Orelac Racing Verdnatura",               strength: 69, color: "#e56042", logo: "Orelac"         },
    { name: "Feel Racing WorldSSP Team",              strength: 70, color: "#ff2f00", logo: "Feel"           },
    { name: "Cerba Yamaha Racing Team",               strength: 69, color: "#21409a", logo: "Cerba"          },
    { name: "WRP Racing",                             strength: 71, color: "#efff00", logo: "WRP"            },
  ],
  // Campeonatos NACIONALES de Superbike — por debajo de WorldSBK. No son
  // un escalón que se ascienda dentro de la escalera principal, sino una
  // vía alternativa para pilotos que no consiguen llegar (o mantenerse) en
  // los campeonatos superiores. De momento, 3 equipos fijos por campeonato
  // (Yamaha / Honda / Kawasaki + nombre del campeonato); las vías de acceso
  // y salida hacia el resto de categorías se definirán más adelante.
  ESBK: [
    { name: "BMW EasyRace Team",   strength: 60, color: "#171536", logo: "EasyRace"   },
    { name: "Team Honda Laglisse",    strength: 63, color: "#cc1517", logo: "Laglisse"    },
    { name: "Kawasaki JDO Racing Team", strength: 61, color: "#59c84a", logo: "JDO" },
  ],
  BSB: [
    { name: "McAMS Yamaha",   strength: 66, color: "#21409a", logo: "McAms"   },
    { name: "Nitrous Competitions Racing Ducati",    strength: 64, color: "#ee332e", logo: "Nitrous"    },
    { name: "Hager PBM Racing Team", strength: 62, color: "#ff2f00", logo: "PBM" },
  ],
  CIV: [
    { name: "Broncos Racing Team",   strength: 64, color: "#ff2f00", logo: "Broncos"   },
    { name: "Barni Racing Team",    strength: 62, color: "#d50005", logo: "Barni"        },
    { name: "DMR Racing Yamaha", strength: 60, color: "#21409a", logo: "DMR" },
  ],
  // Escalón de entrada a la escalera de Superbikes, por debajo de
  // Supersport — el equivalente, en esa escalera, a lo que Moto3 es para
  // Moto2/MotoGP.
  SportBike: [
    { name: "CM Triumph Factory Racing", strength: 54, color: "#efff00", logo: "CMTriumph"  },
    { name: "MTM Kawasaki",              strength: 53, color: "#59c84a", logo: "MTM"        },
    { name: "ARCO Yamaha",               strength: 52, color: "#21409a", logo: "ArcoYamaha" },
    { name: "Prodina Kawasaki",          strength: 51, color: "#59c84a", logo: "Prodina"    },
    { name: "VLR Racing Suzuki",         strength: 50, color: "#10529d", logo: "VLRsuzuki"  },
    { name: "Revo M2 Aprilia",           strength: 49, color: "#810098", logo: "RevoM2"     },
    { name: "MMR Aprilia",               strength: 48, color: "#810098", logo: "MMR"        },
    { name: "Kove Racing Team 109",      strength: 46, color: "#01beb7", logo: "Kove"       },
    { name: "Wixx Racing Suzuki",        strength: 22, color: "#ce0012", logo: "WixxSuzuki" },
  ],
  // Stock 600 — vía alternativa de nivel intermedio, por debajo del
  // Europeo de Moto2 y aproximadamente al nivel de SportBike. No es un
  // escalón "obligatorio" de ninguna escalera: es más bien una salida de
  // emergencia (o una segunda vía de acceso) para pilotos de la fase
  // júnior, de Yamaha R3 Cup o de SportBike a los que el camino normal no
  // les está saliendo bien. Monomarca a efectos prácticos — los 4 equipos
  // corren con Yamaha — así que el equipo pesa poco (ver CATEGORY_WEIGHTS
  // en script.js), aunque sí hay 4 escuadras distintas entre las que
  // elegir, a diferencia de Red Bull Rookies o Yamaha R3 Cup.
  Stock600: [
    { name: "Yamaha MS Racing",           strength: 54, color: "#21409a", logo: "YamahaMS"      },
    { name: "GRT Yamaha Racing",          strength: 51, color: "#21409a", logo: "GRTYamaha"      },
    { name: "Yamaha PJ Motorsport",       strength: 49, color: "#21409a", logo: "YamahaPJ"       },
    { name: "Yamaha Finance Racing Team", strength: 46, color: "#21409a", logo: "YamahaFinance"  },
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
