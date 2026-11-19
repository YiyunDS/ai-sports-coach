// =====================================================================
//  positions.js  --  WHERE SHOULD EACH PLAYER STAND?
//
//  This file is a little playbook. Each "situation" says where the puck
//  is and where our five skaters should go.
//
//  HOW WE MEASURE THE RINK (in feet, like a real rink: 85 wide, 200 long)
//     a = how far ACROSS the ice, starting from the player's left boards
//         (0 = left boards, 42.5 = middle, 85 = right boards)
//     d = how far UP the ice, starting from the boards behind OUR net
//         (11 = our goal line, 75 = our blue line, 100 = center ice,
//          125 = their blue line, 189 = their goal line)
//
//  THE FIVE POSITIONS
//     LW = left wing    C = center    RW = right wing
//     LD = left defense               RD = right defense
//
//  Every situation is written with the puck on the LEFT side. The page
//  can flip it to the right side by itself (see "mirror" below).
//
//  COACHES: these spots follow common youth-hockey coverage. Every team
//  is a little different, so change the numbers to match your system.
// =====================================================================
(function (root) {
  "use strict";

  var RINK = { width: 85, length: 200 };
  var ROLES = ["LW", "C", "RW", "LD", "RD"];
  var ROLE_NAMES = { LW: "Left wing", C: "Center", RW: "Right wing", LD: "Left defense", RD: "Right defense" };

  // How close (in feet) you must be to the ideal spot.
  var GOOD_FEET = 8;    // inside this = on target
  var CLOSE_FEET = 16;  // inside this = close

  var SITUATIONS = [
    {
      id: "dz-corner",
      name: "Defending: puck in our corner",
      zone: "def",
      puck: { a: 8, d: 9 },
      opponentHasPuck: true,
      summary: "The other team has the puck in our corner. One player pressures, one helps, one guards the net, and the wingers cover the top.",
      spots: {
        LD: { a: 13, d: 13 }, C: { a: 27, d: 18 }, RD: { a: 44, d: 19 },
        LW: { a: 17, d: 52 }, RW: { a: 46, d: 43 }
      },
      jobs: {
        LD: "You are the puck-side defender. Go to the puck carrier in the corner and take away time and space, staying between the puck and our net.",
        C: "Support low. Stay between the corner and the net, close enough to help win the puck or pick up a pass to the slot.",
        RD: "You are the far-side defender. Own the front of our net and tie up any attacker standing there.",
        LW: "You are the puck-side winger. Stay up near the top of the circle by the boards and cover their defender at the point.",
        RW: "You are the far-side winger. Slide to the high slot. Watch their other defender and block the pass through the middle."
      }
    },
    {
      id: "dz-point",
      name: "Defending: puck at the point",
      zone: "def",
      puck: { a: 14, d: 71 },
      opponentHasPuck: true,
      summary: "Their defender has the puck up high by our blue line. The puck-side winger goes out; everyone else protects the middle.",
      spots: {
        LW: { a: 17, d: 62 }, RW: { a: 48, d: 48 }, C: { a: 40, d: 30 },
        LD: { a: 35, d: 20 }, RD: { a: 51, d: 20 }
      },
      jobs: {
        LW: "You are the puck-side winger. Skate out to the point with your stick in the shooting lane and make them rush the shot or pass.",
        RW: "You are the far-side winger. Stay in the high slot, ready to block a pass across to the other point.",
        C: "Hold the low slot. Cover their center and be ready to get the rebound out.",
        LD: "You are the puck-side defender. Stay by the near post and box out the attacker in front.",
        RD: "You are the far-side defender. Stay by the far post and watch for a back-door pass."
      }
    },
    {
      id: "dz-behind",
      name: "Defending: puck behind our net",
      zone: "def",
      puck: { a: 42.5, d: 5 },
      opponentHasPuck: true,
      summary: "The other team has the puck behind our net. Stay tight around the net and do not chase behind it two at a time.",
      spots: {
        LD: { a: 35, d: 13 }, RD: { a: 50, d: 13 }, C: { a: 42.5, d: 25 },
        LW: { a: 26, d: 39 }, RW: { a: 59, d: 39 }
      },
      jobs: {
        LD: "Guard your post. If the puck carrier comes out on your side, step out and meet them.",
        RD: "Guard your post. If the puck carrier comes out on your side, step out and meet them.",
        C: "Stay in the low slot in front of the goalie and cover the most dangerous attacker.",
        LW: "Collapse to the inside of your circle. Watch your point, but protect the slot first.",
        RW: "Collapse to the inside of your circle. Watch your point, but protect the slot first."
      }
    },
    {
      id: "breakout",
      name: "Breakout: we have the puck",
      zone: "def",
      puck: { a: 33, d: 6 },
      opponentHasPuck: false,
      summary: "Our defender has the puck behind our net. Everyone gets to a spot where the puck carrier can find them.",
      spots: {
        LD: { a: 34, d: 7 }, RD: { a: 53, d: 15 }, LW: { a: 5, d: 37 },
        C: { a: 36, d: 29 }, RW: { a: 80, d: 41 }
      },
      jobs: {
        LD: "You have the puck. Look up ice first: the winger on the boards, then the center, then your partner.",
        RD: "Stay in front of the net on the far side. You are the safe pass if the first options are covered.",
        LW: "You are the puck-side winger. Get your back to the boards at the hash marks with your stick on the ice. You are the first pass.",
        C: "Swing low through the middle, underneath the wingers, so you can take a short pass with speed.",
        RW: "You are the far-side winger. Stay wide on your boards near the top of the circle, ready to go once we have control."
      }
    },
    {
      id: "oz-attack",
      name: "Attacking: puck in their corner",
      zone: "off",
      puck: { a: 10, d: 191 },
      opponentHasPuck: false,
      summary: "We have the puck in their corner. Forwards make a triangle: one on the puck, one at the net, one high. Defenders hold the blue line.",
      spots: {
        LW: { a: 11, d: 190 }, RW: { a: 48, d: 181 }, C: { a: 38, d: 162 },
        LD: { a: 12, d: 129 }, RD: { a: 49, d: 129 }
      },
      jobs: {
        LW: "You have the puck in the corner. Protect it, keep your feet moving and look for the net-front or the high forward.",
        RW: "You are the far-side winger. Drive to the front of the net at the far post, stick on the ice, ready for a pass or rebound.",
        C: "Be the high forward in the slot. You are a shooting option, and the first one back if we lose the puck.",
        LD: "You are the puck-side defender. Hold the blue line by the boards to keep the puck in the zone.",
        RD: "You are the far-side defender. Slide to the middle of the blue line, ready for a shot or to get back."
      }
    }
  ];

  // Flip left and right: the puck goes to the other side of the ice,
  // LW swaps with RW, and LD swaps with RD.
  var SWAP = { LW: "RW", RW: "LW", LD: "RD", RD: "LD", C: "C" };
  function flipPoint(p) { return { a: RINK.width - p.a, d: p.d }; }
  function mirror(situation) {
    var out = {
      id: situation.id, name: situation.name, zone: situation.zone,
      puck: flipPoint(situation.puck), opponentHasPuck: situation.opponentHasPuck,
      summary: situation.summary, spots: {}, jobs: {}
    };
    ROLES.forEach(function (role) {
      out.spots[SWAP[role]] = flipPoint(situation.spots[role]);
      out.jobs[SWAP[role]] = situation.jobs[role];
    });
    return out;
  }

  // Get a situation by id, with the puck on the "left" or "right".
  function getSituation(id, side) {
    var found = SITUATIONS.filter(function (s) { return s.id === id; })[0] || SITUATIONS[0];
    return side === "right" ? mirror(found) : found;
  }

  // How far apart are two spots, in feet? (Pythagoras: a² + b² = c²)
  function feetBetween(p, q) {
    var da = p.a - q.a, dd = p.d - q.d;
    return Math.sqrt(da * da + dd * dd);
  }

  // Check a guess. Returns how far off it is and a grade:
  //   "good" = on target, "close" = nearly, "far" = needs work
  function checkSpot(situation, role, guess) {
    var feet = feetBetween(guess, situation.spots[role]);
    var grade = feet <= GOOD_FEET ? "good" : feet <= CLOSE_FEET ? "close" : "far";
    return { feet: feet, grade: grade, ideal: situation.spots[role], job: situation.jobs[role] };
  }

  // Which part of the ice does this situation show? (feet up the ice)
  function viewRange(zone) {
    return zone === "off" ? { from: 100, to: 200 } : { from: 0, to: 100 };
  }

  var api = {
    RINK: RINK, ROLES: ROLES, ROLE_NAMES: ROLE_NAMES, SITUATIONS: SITUATIONS,
    GOOD_FEET: GOOD_FEET, CLOSE_FEET: CLOSE_FEET,
    mirror: mirror, getSituation: getSituation, feetBetween: feetBetween,
    checkSpot: checkSpot, viewRange: viewRange
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CoachPositions = api;
})(typeof window !== "undefined" ? window : globalThis);
