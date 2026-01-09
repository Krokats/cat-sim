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
    
    var stats = {
        minDmg: 0, 
        maxDmg: 0,
        ap: getVal("stat_ap"),
        crit: getVal("stat_crit"),
        hit: getVal("stat_hit"),
        haste: getVal("stat_haste"),
        weaponDps: getVal("stat_wps"),
        mana: getVal("stat_mana"),
        int: getVal("stat_int")
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

    var weights = {
        ap: getVal("weight_ap"),
        crit: getVal("weight_crit"),
        hit: getVal("weight_hit")
    };

    return {
        mode: mode,
        iterations: (iterations > 0 ? iterations : 1000),
        maxTime: getVal("maxTime") || 120,
        stats: stats,
        enemy: enemy,
        tactics: tactics,
        weights: weights
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
                
                if(i % Math.ceil(cfg.iterations/10) === 0) {
                    updateProgress((i / cfg.iterations) * 100);
                }
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

            SIM_DATA = { avg: avgRes, min: minRes, max: maxRes };
            
            if(SIM_LIST[ACTIVE_SIM_INDEX]) {
                SIM_LIST[ACTIVE_SIM_INDEX].results = SIM_DATA;
            }

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
    var armorConst = 5500; 
    var dr = cfg.enemy.armor / (cfg.enemy.armor + armorConst);
    if(dr > 0.75) dr = 0.75; 
    var armorMult = 1.0 - dr;

    // --- LOGGING ---
    function log(source, evt, amount, res, info) {
        if(cfg.iterations === 1 || combatLog.length < 400) {
            combatLog.push({
                t: t, source: source, evt: evt, amount: amount, result: res,
                energy: Math.floor(energy), cp: cp, mana: Math.floor(mana), info: info
            });
        }
    }

    // --- ATTACK TABLE ---
    function resolveAttack(baseDmg, isYellow) {
        var roll = Math.random() * 100;
        
        var missChance = Math.max(0, 8.0 - cfg.stats.hit); 
        if(roll < missChance) return { dmg: 0, type: "MISS" };
        roll -= missChance;

        var dodgeChance = 6.5; 
        if(roll < dodgeChance) return { dmg: 0, type: "DODGE" };
        roll -= dodgeChance;

        if(!isYellow) {
            var glanceChance = 40.0;
            if(roll < glanceChance) {
                return { dmg: baseDmg * 0.7 * armorMult, type: "GLANCE" }; // Avg penalty
            }
            roll -= glanceChance;
        }

        var effectiveCrit = Math.max(0, cfg.stats.crit - 3.0); 
        if(roll < effectiveCrit) {
            return { dmg: baseDmg * 2.0 * armorMult, type: "CRIT" };
        }

        return { dmg: baseDmg * armorMult, type: "HIT" };
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
        }
        else if(eventType === "SWING") {
            var baseDmg = (cfg.stats.weaponDps + (cfg.stats.ap / 14));
            var res = resolveAttack(baseDmg, false);
            damageTotal += res.dmg;
            stats.dmg_white += res.dmg;
            log("Melee", "Damage", res.dmg, res.type, "");
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
                    log("Powershift", "Cast", 0, "Shift", "Reset");
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
                            log("Rip", "Cast", totalRip, "DoT", "Applied");
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
                            log("Ferocious Bite", "Damage", res.dmg, res.type, "");
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
                            log("Rake", "Cast", totalDoT, "DoT", "Applied");
                        } else {
                            log("Rake", "Miss", 0, res.type, "");
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
                        if(bleedCount > 0) dmgRaw *= (1.0 + (0.10 * bleedCount));
                    }
                    
                    var res = resolveAttack(dmgRaw, true);
                    damageTotal += res.dmg;
                    
                    if(skillName === "Shred") stats.dmg_shred += res.dmg;
                    else stats.dmg_claw += res.dmg;
                    
                    if(res.type === "CRIT") cp++; 
                    
                    log(skillName, "Damage", res.dmg, res.type, "");
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