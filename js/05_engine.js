/**
 * Feral Simulation - File 5: Simulation Engine & Math
 */

// ============================================================================
// INPUT & CONFIGURATION
// ============================================================================

function getInputs() {
    // Collect settings from UI
    var iterations = getVal("simCount");
    var mode = document.getElementById("calcMethod") ? document.getElementById("calcMethod").value : "S"; 
    
    // Convert text inputs to numbers
    var stats = {
        minDmg: 0, 
        maxDmg: 0,
        ap: getVal("stat_ap"),
        crit: getVal("stat_crit"),
        hit: getVal("stat_hit"),
        haste: getVal("stat_haste"),
        weaponDps: getVal("stat_wps"),
        mana: getVal("stat_mana"),
        int: getVal("stat_int"),
        // Raw Stats for Weight Calc
        str: getVal("stat_str"),
        agi: getVal("stat_agi")
    };

    var enemy = {
        armor: getVal("enemy_armor"),
        level: getVal("enemy_level"),
        canBleed: getVal("enemy_can_bleed")
    };

    var tactics = {
        behind: getVal("pos_behind"),
        useRake: getVal("use_rake"),
        useBite: getVal("use_bite"),
        usePowershift: getVal("use_powershift"),
        aggressiveShift: getVal("aggressive_shift"),
        refundEnergy: getVal("energy_refund_chance") // 60
    };

    // Note: Weights inputs are for the Gear Planner Score, 
    // but the engine calculates its own weights via runStatWeights()
    
    return {
        mode: mode,
        iterations: (iterations > 0 ? iterations : 1000),
        maxTime: getVal("maxTime") || 120,
        stats: stats,
        enemy: enemy,
        tactics: tactics
    };
}

// ============================================================================
// SIMULATION RUNNER
// ============================================================================

function runSimulation() {
    showProgress("Simulating...");

    setTimeout(function() {
        try {
            var cfg = getInputs();
            
            // Run Main Sim
            var res = doSimulation(cfg);
            
            // Store Results Global
            SIM_DATA = res;
            
            if(SIM_LIST[ACTIVE_SIM_INDEX]) {
                SIM_LIST[ACTIVE_SIM_INDEX].results = SIM_DATA;
            }

            // Render
            switchView('avg');
            updateProgress(100);
            setTimeout(hideProgress, 200);
            showToast("Simulation Complete");

        } catch(e) {
            console.error(e);
            hideProgress();
            alert("Simulation Error: " + e.message);
        }
    }, 50);
}

// ============================================================================
// STAT WEIGHT CALCULATOR
// ============================================================================

function runStatWeights() {
    showProgress("Calculating Weights...");
    
    setTimeout(function() {
        try {
            var baseCfg = getInputs();
            // Reduce iterations for weight calc speed (optional, but recommended)
            baseCfg.iterations = Math.min(baseCfg.iterations, 2000); 

            // 1. Base Run
            updateProgress(10);
            var baseRes = doSimulation(baseCfg);
            var baseDps = baseRes.avg.dps;

            // Helper to modify config and run sim
            function getDeltaDps(modifierFn) {
                var c = JSON.parse(JSON.stringify(baseCfg));
                modifierFn(c);
                var r = doSimulation(c);
                return r.avg.dps;
            }

            // 2. Calculate Deltas
            
            // AP (+50)
            updateProgress(25);
            var dpsAp = getDeltaDps(c => c.stats.ap += 50);
            var weightAp = (dpsAp - baseDps) / 50;
            if(weightAp <= 0) weightAp = 0.001; // Avoid division by zero

            // Crit (+1%)
            updateProgress(40);
            var dpsCrit = getDeltaDps(c => c.stats.crit += 1.0);
            var weightCrit = (dpsCrit - baseDps) / weightAp; // Normalize to AP

            // Hit (+1%)
            updateProgress(55);
            var dpsHit = getDeltaDps(c => c.stats.hit += 1.0);
            var weightHit = (dpsHit - baseDps) / weightAp;

            // Haste (+1%)
            updateProgress(70);
            var dpsHaste = getDeltaDps(c => c.stats.haste += 1.0);
            var weightHaste = (dpsHaste - baseDps) / weightAp;

            // Strength (+50) -> Usually 2 AP + minor bonus
            updateProgress(80);
            var dpsStr = getDeltaDps(c => { 
                c.stats.str += 50; 
                c.stats.ap += 100; // 1 Str = 2 AP
            });
            var weightStr = ((dpsStr - baseDps) / 50) / weightAp;

            // Agility (+50) -> 1 AP + Crit
            updateProgress(90);
            var dpsAgi = getDeltaDps(c => {
                c.stats.agi += 50;
                c.stats.ap += 50; // 1 Agi = 1 AP (Cat)
                c.stats.crit += (50 / 20); // 20 Agi = 1% Crit
            });
            var weightAgi = ((dpsAgi - baseDps) / 50) / weightAp;

            // 3. Attach Weights to Result
            baseRes.weights = {
                ap: 1.0,
                str: weightStr,
                agi: weightAgi,
                crit: weightCrit,
                hit: weightHit,
                haste: weightHaste
            };

            SIM_DATA = baseRes;
            if(SIM_LIST[ACTIVE_SIM_INDEX]) {
                SIM_LIST[ACTIVE_SIM_INDEX].results = SIM_DATA;
            }

            switchView('avg');
            updateProgress(100);
            setTimeout(hideProgress, 200);
            showToast("Weights Calculated!");

        } catch(e) {
            console.error(e);
            hideProgress();
            alert("Weight Error: " + e.message);
        }
    }, 50);
}

// ============================================================================
// SIMULATION AGGREGATOR
// ============================================================================

function doSimulation(cfg) {
    var minRes = { totalDmg: Infinity, dps: 0, stats: {}, log: [] };
    var maxRes = { totalDmg: -1, dps: 0, stats: {}, log: [] };
    
    var totalDmgSum = 0;
    var accStats = {
        dmg_white: 0, dmg_shred: 0, dmg_claw: 0, dmg_bite: 0, dmg_rip: 0,
        dmg_rake: 0, dmg_rake_init: 0, casts_shift: 0, cp_wasted: 0
    };

    for(var i = 0; i < cfg.iterations; i++) {
        var res = runSingleFight(cfg);
        
        totalDmgSum += res.totalDmg;

        for(var k in res.stats) {
            if(!accStats[k]) accStats[k] = 0;
            accStats[k] += res.stats[k];
        }

        if(res.totalDmg < minRes.totalDmg) minRes = res;
        if(res.totalDmg > maxRes.totalDmg) maxRes = res;
    }

    var avgRes = {
        totalDmg: totalDmgSum / cfg.iterations,
        dps: (totalDmgSum / cfg.iterations) / cfg.maxTime,
        stats: {},
        log: minRes.log 
    };

    for(var k in accStats) {
        avgRes.stats[k] = accStats[k] / cfg.iterations;
    }

    return { avg: avgRes, min: minRes, max: maxRes };
}

// ============================================================================
// CORE ENGINE (Event Loop)
// ============================================================================

function runSingleFight(cfg) {
    var t = 0.0;
    var damageTotal = 0;
    var combatLog = [];
    var stats = { 
        dmg_white: 0, dmg_shred: 0, dmg_claw: 0, dmg_bite: 0, dmg_rip: 0, 
        dmg_rake: 0, dmg_rake_init: 0, casts_shift: 0, cp_wasted: 0 
    };

    // --- PLAYER STATE ---
    var energy = 100;
    var mana = cfg.stats.mana;
    var cp = 0;
    
    // Timers
    var gcdEnd = 0.0;
    var swingTimer = 0.0;
    var nextEnergyTick = 0.0; 
    
    // FIX: Variable to prevent Infinite Loop (Starvation)
    // Forces the loop to wait until energy is returned before trying to act again
    var nextActionAvailable = 0.0; 

    // Debuffs
    var ripEnd = 0.0;
    var rakeEnd = 0.0;
    
    // Constants
    var swingSpeed = 1.0; 
    var tickRate = 2.0;
    var shiftCost = 400; 
    if(cfg.stats.int > 0) shiftCost = 450; 

    // --- ARMOR MATH ---
    // Turtle/Vanilla Lvl 60 Attacker vs Lvl 63 Boss -> Constant 5500
    var armorConst = 5500; 
    var dr = cfg.enemy.armor / (cfg.enemy.armor + armorConst);
    if(dr > 0.75) dr = 0.75; 
    var armorMult = 1.0 - dr;

    // --- LOGGING ---
    function log(source, evt, amount, res, info) {
        if(cfg.iterations === 1 || combatLog.length < 500) {
            combatLog.push({
                t: t, source: source, evt: evt, amount: amount, result: res,
                energy: Math.floor(energy), cp: cp, mana: Math.floor(mana), info: info
            });
        }
    }

    // --- ATTACK TABLE ---
    function resolveAttack(baseDmg, isYellow) {
        var roll = Math.random() * 100;
        var info = "";

        // 1. Miss
        var missChance = Math.max(0, 8.0 - cfg.stats.hit); 
        if(roll < missChance) {
            return { dmg: 0, type: "MISS", info: `Rolled ${roll.toFixed(1)} < ${missChance.toFixed(1)} (Miss)` };
        }
        roll -= missChance;

        // 2. Dodge
        var dodgeChance = 6.5; 
        if(roll < dodgeChance) {
            return { dmg: 0, type: "DODGE", info: `Rolled ${roll.toFixed(1)} < ${dodgeChance.toFixed(1)} (Dodge)` };
        }
        roll -= dodgeChance;

        // 3. Glance (White Only)
        if(!isYellow) {
            var glanceChance = 40.0;
            if(roll < glanceChance) {
                return { dmg: baseDmg * 0.7 * armorMult, type: "GLANCE", info: "Glance (70% Dmg)" }; 
            }
            roll -= glanceChance;
        }

        // 4. Crit
        // Turtle/Vanilla: Crit is suppressed by aura ~3% vs Boss
        var effectiveCrit = Math.max(0, cfg.stats.crit - 3.0); 
        
        if(roll < effectiveCrit) {
            return { dmg: baseDmg * 2.0 * armorMult, type: "CRIT", info: `Crit (${effectiveCrit.toFixed(1)}%)` };
        }

        // 5. Hit
        return { dmg: baseDmg * armorMult, type: "HIT", info: "Normal Hit" };
    }

    // --- MAIN LOOP ---
    while(t < cfg.maxTime) {
        var nextEventTime = cfg.maxTime;
        var eventType = "END";

        // Determine next event
        // 1. Energy Tick
        if(nextEnergyTick < nextEventTime) { nextEventTime = nextEnergyTick; eventType = "TICK"; }
        // 2. Swing
        if(swingTimer < nextEventTime) { nextEventTime = swingTimer; eventType = "SWING"; }
        
        // 3. Action (FIX: Check nextActionAvailable)
        var readyTime = Math.max(t, gcdEnd, nextActionAvailable);
        if(readyTime < nextEventTime) { nextEventTime = readyTime; eventType = "ACTION"; }

        // Advance Time
        t = nextEventTime;
        if(t >= cfg.maxTime) break;

        // Process Event
        if(eventType === "TICK") {
            energy = Math.min(100, energy + 20);
            nextEnergyTick += tickRate;
            // When we get energy, we can try to act again immediately
            nextActionAvailable = t; 
            // log("System", "Tick", 0, "", "+20 Energy");
        }
        else if(eventType === "SWING") {
            var baseDmg = (cfg.stats.weaponDps + (cfg.stats.ap / 14));
            var res = resolveAttack(baseDmg, false);
            damageTotal += res.dmg;
            stats.dmg_white += res.dmg;
            log("Melee", "Damage", res.dmg, res.type, res.info);
            swingTimer += swingSpeed;
        }
        else if(eventType === "ACTION") {
            var actionTaken = false;
            
            // 0. Debuff State
            var isBleeding = (t < ripEnd || t < rakeEnd) && cfg.enemy.canBleed;

            // 1. POWERSHIFT
            var shiftThreshold = 10;
            var canShift = cfg.tactics.usePowershift && (mana >= shiftCost);
            
            if(canShift && energy <= shiftThreshold) {
                var doShift = false;
                if(cfg.tactics.aggressiveShift) {
                    doShift = true;
                } else {
                    var timeToTick = nextEnergyTick - t;
                    if(timeToTick > 0.5) doShift = true;
                }

                if(doShift) {
                    mana -= shiftCost;
                    energy = cfg.tactics.refundEnergy; 
                    gcdEnd = t + 1.0; // GCD
                    stats.casts_shift++;
                    log("Powershift", "Cast", 0, "Shift", `Reset to ${energy} Energy`);
                    actionTaken = true;
                }
            }

            if(!actionTaken) {
                // 2. FINISHERS (5 CP)
                if(cp >= 5) {
                    var ripActive = (t < ripEnd);
                    if(cfg.enemy.canBleed && !ripActive) {
                        if(energy >= 30) {
                            energy -= 30;
                            cp = 0;
                            gcdEnd = t + 1.0;
                            
                            var baseRip = 800; // Approx total base
                            var totalRip = baseRip + (0.24 * cfg.stats.ap);
                            damageTotal += totalRip;
                            stats.dmg_rip += totalRip;
                            ripEnd = t + 12.0;
                            log("Rip", "Cast", totalRip, "DoT", "Applied (12s)");
                            actionTaken = true;
                        }
                    } 
                    else if(cfg.tactics.useBite) {
                        if(energy >= 35) {
                            var extraEnergy = energy - 35;
                            energy = 0; 
                            cp = 0;
                            gcdEnd = t + 1.0;
                            
                            var biteBase = 250 + (cfg.stats.ap * 0.15);
                            var biteBonus = extraEnergy * 2.0;
                            var rawBite = biteBase + biteBonus;
                            
                            var res = resolveAttack(rawBite, true);
                            damageTotal += res.dmg;
                            stats.dmg_bite += res.dmg;
                            log("Ferocious Bite", "Damage", res.dmg, res.type, `Base + ${extraEnergy} extra energy`);
                            actionTaken = true;
                        }
                    }
                    else {
                        // 5CP but nothing to use -> Waste CP and continue to builder
                        stats.cp_wasted++;
                    }
                }
            }

            if(!actionTaken) {
                // 3. GENERATORS
                var rakeActive = (t < rakeEnd);
                if(cfg.tactics.useRake && cfg.enemy.canBleed && !rakeActive) {
                    if(energy >= 35) {
                        energy -= 35;
                        gcdEnd = t + 1.0;
                        cp++;
                        
                        var rakeInit = (cfg.stats.weaponDps * 0.5) + 20;
                        var res = resolveAttack(rakeInit, true);
                        damageTotal += res.dmg;
                        stats.dmg_rake_init += res.dmg;
                        
                        if(res.type !== "MISS" && res.type !== "DODGE") {
                            if(res.type === "CRIT") cp++; 
                            rakeEnd = t + 9.0;
                            var tickDmg = 25 + (0.06 * cfg.stats.ap);
                            var totalDoT = tickDmg * 3;
                            damageTotal += totalDoT;
                            stats.dmg_rake += totalDoT;
                            log("Rake", "Cast", totalDoT, "DoT", "Applied (9s)");
                        } else {
                            log("Rake", "Miss", 0, res.type, res.info);
                        }
                        actionTaken = true;
                    }
                }
            }

            if(!actionTaken) {
                // SHRED / CLAW
                var skillName = cfg.tactics.behind ? "Shred" : "Claw";
                var cost = cfg.tactics.behind ? 48 : 40; 
                
                if(energy >= cost) {
                    energy -= cost;
                    gcdEnd = t + 1.0;
                    cp++;
                    
                    var dmgRaw = 0;
                    if(cfg.tactics.behind) {
                        var base = (cfg.stats.weaponDps + (cfg.stats.ap / 14));
                        dmgRaw = (base * 2.25) + 180;
                    } else {
                        var bleedCount = 0;
                        if(t < ripEnd) bleedCount++;
                        if(t < rakeEnd) bleedCount++;
                        
                        var base = (cfg.stats.weaponDps + (cfg.stats.ap / 14));
                        dmgRaw = base + 115;
                        if(bleedCount > 0) dmgRaw *= (1.0 + (0.10 * bleedCount)); // Open Wounds
                    }
                    
                    var res = resolveAttack(dmgRaw, true);
                    damageTotal += res.dmg;
                    
                    if(skillName === "Shred") stats.dmg_shred += res.dmg;
                    else stats.dmg_claw += res.dmg;
                    
                    if(res.type === "CRIT") cp++; 
                    
                    log(skillName, "Damage", res.dmg, res.type, res.info);
                    actionTaken = true;
                }
            }

            // --- INFINITE LOOP PREVENTER ---
            if(!actionTaken) {
                // If we are here, we wanted to act but lacked energy.
                // We MUST wait for the next energy tick before trying "ACTION" again.
                // Otherwise, the loop restarts at the exact same 't' and freezes the browser.
                nextActionAvailable = nextEnergyTick;
                
                // Safety check: Ensure time moves forward
                if(nextActionAvailable <= t) nextActionAvailable = t + 0.1;
            }
        }
    }

    return { totalDmg: damageTotal, dps: damageTotal / cfg.maxTime, stats: stats, log: combatLog };
}