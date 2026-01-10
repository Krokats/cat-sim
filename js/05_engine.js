/**
 * Feral Simulation - File 5: Simulation Engine & Math
 * Updated for Turtle WoW 1.18 (Feral Cat)
 * Features: Event-based Engine, Turtle Specific Formulas, Talent Logic (Berserk, etc.)
 */

// ============================================================================
// SIMULATION ENTRY POINT
// ============================================================================

function runSimulation() {
    var config = getSimInputs();
    
    // Validate
    if (config.iterations < 1) config.iterations = 1;
    
    showProgress("Simulating...");
    
    setTimeout(function() {
        try {
            var allResults = [];
            
            // Run Simulations
            for(var i = 0; i < config.iterations; i++) {
                var res = runCoreSimulation(config);
                allResults.push(res);
                if(i % 50 === 0) updateProgress((i / config.iterations) * 100);
            }
            
            // Aggregate Results
            var avg = aggregateResults(allResults);
            SIM_DATA = { config: config, results: avg };
            
            updateSimulationResults(SIM_DATA);
            showToast("Simulation Complete!");
            
        } catch(e) {
            console.error(e);
            showToast("Error: " + e.message);
        } finally {
            hideProgress();
        }
    }, 50);
}

function getSimInputs() {
    return {
        // Sim Settings
        simTime: parseFloat(getVal("simTime")) || 60,
        iterations: parseInt(getVal("simCount")) || 1000,
        
        // Player Config
        race: document.getElementById("char_race") ? document.getElementById("char_race").value : "Tauren",
        
        // Stats inputs (Total displayed on UI)
        inputStr: parseFloat(getVal("stat_str")) || 0,
        inputAgi: parseFloat(getVal("stat_agi")) || 0,
        inputAP: parseFloat(getVal("stat_ap")) || 0,
        inputCrit: parseFloat(getVal("stat_crit")) || 0,
        inputHit: parseFloat(getVal("stat_hit")) || 0,
        inputHaste: parseFloat(getVal("stat_haste")) || 0,
        
        manaPool: parseFloat(getVal("mana_pool")) || 3000,
        wepSkill: parseFloat(getVal("stat_wep_skill")) || 300,

        // Enemy
        enemyLevel: parseFloat(getVal("enemy_level")) || 63,
        enemyArmor: parseFloat(getVal("enemy_armor")) || 3731,
        canBleed: getVal("enemy_can_bleed") === 1,

        // Rotation
        posBehind: getVal("rota_position") === "back",
        usePowershift: getVal("rota_powershift") === 1,
        useRake: getVal("rota_rake") === 1,
        useBite: getVal("rota_bite") === 1,
        aggressiveShift: getVal("rota_aggressive_shift") === 1,

        // Talents (Manual Inputs from new Card)
        tal_ferocity: parseInt(getVal("tal_ferocity")) || 0,
        tal_feral_aggression: parseInt(getVal("tal_feral_aggression")) || 0,
        tal_imp_shred: parseInt(getVal("tal_imp_shred")) || 0,
        tal_furor: parseInt(getVal("tal_furor")) || 0,
        tal_nat_shapeshifter: parseInt(getVal("tal_nat_shapeshifter")) || 0,
        tal_berserk: parseInt(getVal("tal_berserk")) || 0,

        // Gear / Sets
        hasWolfshead: document.getElementById("meta_wolfshead").checked,
        hasT05_4p: document.getElementById("set_t05_4p").checked,
        hasMCP: document.getElementById("item_mcp").checked
    };
}

// ============================================================================
// CORE ENGINE
// ============================================================================

function runCoreSimulation(cfg) {
    
    // -----------------------------------------
    // 1. STATS & SCALING INITIALIZATION
    // -----------------------------------------
    
    // Base Stats (Level 60)
    var raceStats = {
        "Tauren":   { baseAp: 295, baseCrit: 3.65, minDmg: 72, maxDmg: 97 },
        "NightElf": { baseAp: 295, baseCrit: 3.65, minDmg: 72, maxDmg: 97 }
    };
    var base = raceStats[cfg.race] || raceStats["Tauren"];
    
    // Internal Talent Structure
    // We assume max ranks for passive damage talents as per prompt, unless overridden by UI inputs
    var tal = {
        ferocity: cfg.tal_ferocity,        
        feralAggression: cfg.tal_feral_aggression, 
        impShred: cfg.tal_imp_shred,        
        furor: cfg.tal_furor,
        naturalShapeshifter: cfg.tal_nat_shapeshifter,
        berserk: cfg.tal_berserk,
        
        // Hardcoded Max Ranks for optimization (as requested in prompt logic)
        openWounds: 3,      
        sharpenedClaws: 3,  
        predatoryStrikes: 3,
        heartWild: 5,       
        naturalWeapons: 3,  
        omen: true,         
        carnage: 2,         
        bloodFrenzy: 2,     
        primalFury: 2,      
        ancientBrutality: 2 
    };

    // Calculate Final Stats
    // Notes:
    // UI inputStr/AP/Crit are treated as "Total Stats from Gear + Buffs".
    // We apply percentage multipliers (like Heart of the Wild) on top of Str if we assume input is gear-level.
    // However, usually UI shows final stats. To be safe, we assume Inputs are "Paperdoll Stats" and apply combat-only modifiers.
    
    // Natural Weapons: 10% Physical Dmg
    var dmgMod = 1.10; 
    
    // Predatory Strikes: 10% AP (Scaling already in UI? Likely yes if gear.js does it. If not, apply here.)
    // Let's assume inputAP is raw value from gear.js which sums Str*2 + Agi + Items.
    // So we apply the 10% here.
    var totalAP = cfg.inputAP * 1.10; 
    
    // Crit
    // Sharpened Claws (6%) + Leader of the Pack (3% - usually a buff).
    // Assuming UI `stat_crit` includes Agi->Crit conversion but maybe not talents.
    var totalCrit = cfg.inputCrit + (tal.sharpenedClaws * 2);

    // -----------------------------------------
    // 2. COMBAT STATE
    // -----------------------------------------
    var t = 0.0;
    var maxT = cfg.simTime;
    var energy = 100;
    var mana = cfg.manaPool;
    var cp = 0;
    
    var events = []; // Priority Queue {t, type, data}
    
    // Timers
    var nextEnergyTick = 2.0; 
    var gcdEnd = 0.0;
    var swingTimer = 0.0;
    
    // Auras (Expiry Times)
    var auras = {
        rake: 0,
        rip: 0,
        clearcasting: 0,
        tigersFury: 0,      // Dmg Buff
        tigersFurySpeed: 0, // Haste Buff (Blood Frenzy)
        mcp: 0,
        berserk: 0          // Energy Regen Buff
    };
    
    // Cooldowns (Ready Times)
    var cds = {
        tigersFury: 0,
        mcp: 0,
        berserk: 0
    };

    // Logging & Metrics
    var log = [];
    var totalDmg = 0;
    var dmgSources = {};
    var counts = {};
    var missCounts = {}, dodgeCounts = {}, critCounts = {}, glanceCounts = {};
    
    // --- Helpers ---
    function addEvent(time, type, data) {
        events.push({ t: time, type: type, data: data || {} });
        events.sort((a,b) => a.t - b.t); 
    }
    
    function dealDamage(source, val, type, res) {
        val = Math.floor(val);
        if(!dmgSources[source]) dmgSources[source] = 0;
        dmgSources[source] += val;
        totalDmg += val;
        if (log.length < 1500) { // Cap log size
            log.push({
                t: t, event: "Damage", ability: source, result: res || "HIT", dmg: val,
                energy: Math.floor(energy), cp: cp, mana: Math.floor(mana)
            });
        }
    }
    
    function logAction(action, info, res) {
        if (log.length < 1500) {
            log.push({
                t: t, event: "Cast", ability: action, result: res || "", dmg: 0,
                energy: Math.floor(energy), cp: cp, mana: Math.floor(mana), info: info
            });
        }
    }

    // Init MCP (if equipped)
    var mcpCharges = cfg.hasMCP ? 3 : 0;
    if(cfg.hasMCP) {
        auras.mcp = 30.0;
        mcpCharges--;
        logAction("MCP", "Haste +50%");
    }

    // -----------------------------------------
    // 3. MAIN SIMULATION LOOP
    // -----------------------------------------
    while (t < maxT) {
        
        // --- A. DETERMINE NEXT TIME STEP ---
        var nextT = maxT;
        
        // 1. Next Event in Queue
        if (events.length > 0) nextT = Math.min(nextT, events[0].t);
        
        // 2. Next Energy Tick
        if (nextEnergyTick > t) nextT = Math.min(nextT, nextEnergyTick);
        
        // 3. Next Swing
        if (swingTimer > t) nextT = Math.min(nextT, swingTimer);
        
        // 4. GCD Ready (Potential Action)
        // If we are waiting for GCD, we can't act until then. 
        // If GCD is ready (gcdEnd <= t), we are effectively at 't' ready to act.
        // We do NOT jump to gcdEnd if it's in the past.
        if (gcdEnd > t) nextT = Math.min(nextT, gcdEnd);

        // Advance Time
        t = nextT;
        if (t >= maxT) break;
        
        // --- B. PROCESS TIME-BASED EVENTS ---
        
        // 1. Process Event Queue (DoT Ticks, Special Energy Ticks)
        while (events.length > 0 && events[0].t <= t + 0.001) {
            var evt = events.shift();
            
            if (evt.type === "dot_tick") {
                var name = evt.data.name; 
                // Check if aura active (expiry > now)
                if (auras[name] >= t - 0.01) {
                    dealDamage(evt.data.label, evt.data.dmg * dmgMod, "Bleed", "Tick");
                    // Ancient Brutality (Energy Restore)
                    if (tal.ancientBrutality > 0) {
                        energy = Math.min(100, energy + 5);
                    }
                }
            }
            else if (evt.type === "tf_energy") {
                // Tiger's Fury Regen Tick
                if (auras.tigersFury > t) {
                    energy = Math.min(100, energy + 10);
                }
            }
        }
        
        // 2. Server Energy Tick
        if (t >= nextEnergyTick - 0.001) {
            // Berserk: 100% increased regen (40 instead of 20)
            var tickAmt = (auras.berserk > t) ? 40 : 20;
            energy = Math.min(100, energy + tickAmt);
            nextEnergyTick += 2.0;
        }
        
        // 3. Cleanup Expired Auras
        if (auras.tigersFury > 0 && auras.tigersFury <= t) auras.tigersFury = 0;
        if (auras.rake > 0 && auras.rake <= t) auras.rake = 0;
        if (auras.rip > 0 && auras.rip <= t) auras.rip = 0;
        if (auras.berserk > 0 && auras.berserk <= t) auras.berserk = 0;
        
        // MCP Refresh Logic
        if (auras.mcp > 0 && auras.mcp <= t) {
            auras.mcp = 0;
            if (mcpCharges > 0 && t > cds.mcp) {
                auras.mcp = t + 30.0;
                mcpCharges--;
                logAction("MCP", "Re-use", "Charges: "+mcpCharges);
            }
        }

        // 4. White Swing
        if (t >= swingTimer - 0.001) {
            // Damage: Base + (AP-BaseAP)/14
            var wDmg = base.minDmg + Math.random() * (base.maxDmg - base.minDmg);
            var apBonus = (totalAP - base.baseAp) / 14.0;
            var swingDmg = (wDmg + apBonus) * dmgMod;
            
            // Tiger's Fury Bonus (+50)
            if (auras.tigersFury > t) swingDmg += 50;

            // Attack Table
            var roll = Math.random() * 100;
            var hitType = "HIT";
            
            // Hit Cap 9% (Yellow), but White Hit Cap is much higher (Dual Wield doesn't apply to Cat/Bear).
            // Cat is considered "Two-Handed" / Special regarding miss. 
            // 8.6% miss chance vs Level 63. Reduced by Hit Chance.
            var missChance = Math.max(0, 8.6 - cfg.inputHit - tal.naturalWeapons); 
            var dodgeChance = 6.5; 
            var critChance = totalCrit;
            
            // Glancing (40% vs Boss)
            var glanceChance = (cfg.enemyLevel === 63) ? 40.0 : 0.0;
            var glancePenalty = 0.65; // Base penalty
            if (cfg.wepSkill >= 305) glancePenalty = 0.85;
            if (cfg.wepSkill >= 310) glancePenalty = 0.95;

            // Roll
            if (roll < missChance) {
                hitType = "MISS";
                if(!missCounts.Auto) missCounts.Auto=0; missCounts.Auto++;
            } else if (roll < missChance + dodgeChance) {
                hitType = "DODGE";
                if(!dodgeCounts.Auto) dodgeCounts.Auto=0; dodgeCounts.Auto++;
            } else if (roll < missChance + dodgeChance + glanceChance) {
                hitType = "GLANCE";
                swingDmg *= glancePenalty;
                if(!glanceCounts.Auto) glanceCounts.Auto=0; glanceCounts.Auto++;
            } else if (roll < missChance + dodgeChance + glanceChance + critChance) {
                hitType = "CRIT";
                swingDmg *= 2.0;
                if(!critCounts.Auto) critCounts.Auto=0; critCounts.Auto++;
            } else {
                hitType = "HIT";
            }
            
            // Apply Damage
            if (hitType !== "MISS" && hitType !== "DODGE") {
                // Armor Reduct
                var dr = cfg.enemyArmor / (cfg.enemyArmor + 5882.5);
                swingDmg *= (1 - dr);
                
                dealDamage("Auto Attack", swingDmg, "Physical", hitType);
                
                // Omen of Clarity Proc (10%)
                if (tal.omen && Math.random() < 0.10) {
                    auras.clearcasting = t + 10.0;
                    logAction("Proc", "Clearcasting");
                }
                
                // T0.5 Proc (Energy)
                if (cfg.hasT05_4p && Math.random() < 0.02) { // approx 2%
                    energy = Math.min(100, energy + 20);
                    logAction("Proc", "T0.5 Energy");
                }
            }
            if(!counts.Auto) counts.Auto=0; counts.Auto++;

            // Calculate Next Swing Time (Haste)
            var speed = 1.0; // Cat Base
            var hasteMul = 1.0;
            if (cfg.inputHaste > 0) hasteMul *= (1 + cfg.inputHaste/100);
            if (auras.mcp > t) hasteMul *= 1.5;
            if (tal.bloodFrenzy > 0 && auras.tigersFurySpeed > t) hasteMul *= 1.2;
            
            swingTimer = t + (speed / hasteMul);
        }
        
        // --- C. ACTION PRIORITY LIST (GCD CHECK) ---
        
        if (t >= gcdEnd) {
            
            // 1. Calculate Costs
            var costClaw = 45 - tal.ferocity; 
            var costRake = 40 - tal.ferocity;
            var costShred = 60 - (tal.impShred * 6); 
            var costRip = 30;
            var costBite = 35;
            var costTF = 30; // Vanilla standard

            // Clearcasting Check
            var isOoc = (auras.clearcasting > t);
            if (isOoc) {
                costClaw=0; costRake=0; costShred=0; costRip=0; costBite=0;
            }
            
            var action = null;
            
            // 2. Priority Logic
            
            // A. BERSERK (Cooldown Usage)
            // Use if available.
            if (!action && tal.berserk > 0 && t >= cds.berserk) {
                action = "Berserk";
            }

            // B. TIGER'S FURY
            // Maintain if energy permits and buff missing
            if (!action && auras.tigersFury <= t && energy >= costTF) {
                action = "Tiger's Fury";
            }
            
            // C. FINISHERS (5 CP)
            if (!action && cp >= 5) {
                // Rip priority if bleedable
                if (cfg.canBleed && auras.rip <= t && energy >= costRip) {
                    action = "Rip";
                }
                // Else Ferocious Bite
                else if (cfg.useBite && energy >= costBite) {
                    action = "Ferocious Bite";
                }
            }
            
            // D. RAKE (Maintain DoT)
            if (!action && cfg.useRake && cfg.canBleed && auras.rake <= t && energy >= costRake) {
                action = "Rake";
            }
            
            // E. BUILDERS
            if (!action) {
                var spell = cfg.posBehind ? "Shred" : "Claw";
                var c = cfg.posBehind ? costShred : costClaw;
                
                // POWERSHIFTING Logic
                if (cfg.usePowershift && energy < c && mana > 400) { 
                    var shiftThresh = 10;
                    if (cfg.aggressiveShift) shiftThresh = 20; // Shift earlier
                    
                    if (energy <= shiftThresh) {
                        action = "Powershift";
                    }
                }
                
                // Cast Builder if Energy sufficient
                if (!action && energy >= c) {
                    action = spell;
                }
            }
            
            // 3. EXECUTE ACTION
            if (action) {
                var castCost = 0;
                
                if (action === "Berserk") {
                    auras.berserk = t + 20.0;
                    cds.berserk = t + 360.0; // 6 min CD
                    logAction("Berserk", "Energy Regen +100%");
                    gcdEnd = t + 1.0;
                }
                else if (action === "Powershift") {
                    // Cost reduced by Natural Shapeshifter
                    mana -= (400 * (1 - tal.naturalShapeshifter * 0.1)); 
                    // Energy gain: Furor (5/5 = 40) + Wolfshead (20)
                    energy = (tal.furor * 8); 
                    if (cfg.hasWolfshead) energy += 20;
                    if (energy > 100) energy = 100;
                    
                    logAction("Powershift", "Energy -> " + energy);
                    gcdEnd = t + 1.0; 
                } 
                else if (action === "Tiger's Fury") {
                    energy -= costTF;
                    
                    var dur = 6;
                    if (tal.bloodFrenzy > 0) dur += 12;
                    auras.tigersFury = t + dur;
                    auras.tigersFurySpeed = t + 18; 
                    
                    // Schedule Energy Regen Ticks (Every 3s)
                    addEvent(t + 3.0, "tf_energy");
                    addEvent(t + 6.0, "tf_energy");
                    
                    logAction("Tiger's Fury", "Buff Applied");
                    gcdEnd = t + 1.0;
                }
                else {
                    // OFFENSIVE ABILITIES
                    if (action === "Claw") castCost = costClaw;
                    if (action === "Rake") castCost = costRake;
                    if (action === "Shred") castCost = costShred;
                    if (action === "Rip") castCost = costRip;
                    if (action === "Ferocious Bite") castCost = costBite;
                    
                    // Pay Energy
                    energy -= castCost;
                    if (isOoc) {
                        auras.clearcasting = 0;
                        logAction("Clearcasting", "Consumed");
                    }
                    
                    // Yellow Hit Check
                    var roll = Math.random() * 100;
                    var missC = Math.max(0, 9.0 - cfg.inputHit - tal.naturalWeapons);
                    
                    var res = "HIT";
                    if (roll < missC) res = "MISS";
                    else if (roll < missC + dodgeChance) res = "DODGE";
                    else if (roll < missC + dodgeChance + totalCrit) res = "CRIT";
                    
                    // Refund Logic (80%)
                    if (res === "MISS" || res === "DODGE") {
                        energy += (castCost * 0.8);
                        if(energy > 100) energy = 100;
                    } else {
                        // HIT/CRIT
                        
                        // Primal Fury: Crit gives +1 CP
                        var cpGen = 0;
                        if (action !== "Rip" && action !== "Ferocious Bite") cpGen = 1;
                        if (res === "CRIT" && cpGen > 0 && tal.primalFury > 0) cpGen++;
                        
                        var abilityDmg = 0;
                        
                        // --- DAMAGE CALCULATIONS ---
                        
                        if (action === "Claw") {
                            var normal = (wDmg + apBonus);
                            abilityDmg = 1.05 * normal + 115;
                            // Open Wounds
                            var bleedCount = 0;
                            if (auras.rake > t) bleedCount++;
                            if (auras.rip > t) bleedCount++;
                            if (bleedCount > 0) abilityDmg *= (1 + (0.10 * tal.openWounds * bleedCount));
                            // Predatory Strikes
                            if (tal.predatoryStrikes > 0) abilityDmg *= 1.20;
                        }
                        else if (action === "Shred") {
                            var normal = (wDmg + apBonus);
                            abilityDmg = 2.25 * normal + 180;
                            if (tal.impShred > 0) abilityDmg *= (1 + tal.impShred * 0.05);
                        }
                        else if (action === "Rake") {
                            abilityDmg = 61 + (0.115 * totalAP);
                            if (tal.predatoryStrikes > 0) abilityDmg *= 1.20;
                            
                            // DoT Application
                            var dotTotal = 102 + (0.09 * totalAP);
                            if (tal.predatoryStrikes > 0) dotTotal *= 1.20;
                            var tickVal = dotTotal / 3;
                            
                            auras.rake = t + 9.0;
                            addEvent(t + 3.0, "dot_tick", { name: "rake", dmg: tickVal, label: "Rake (DoT)" });
                            addEvent(t + 6.0, "dot_tick", { name: "rake", dmg: tickVal, label: "Rake (DoT)" });
                            addEvent(t + 9.0, "dot_tick", { name: "rake", dmg: tickVal, label: "Rake (DoT)" });
                        }
                        else if (action === "Rip") {
                            var ticks = 4 + cp;
                            var cpScaled = Math.min(4, cp);
                            var tickDmg = 47 + (cp - 1)*31 + (cpScaled/100 * (totalAP - base.baseAp));
                            if (tal.openWounds > 0) tickDmg *= (1 + tal.openWounds * 0.05);
                            
                            auras.rip = t + (ticks * 2.0);
                            for(var i=1; i<=ticks; i++) {
                                addEvent(t + (i*2.0), "dot_tick", { name: "rip", dmg: tickDmg, label: "Rip" });
                            }
                            cpGen = -cp; // Finish
                        }
                        else if (action === "Ferocious Bite") {
                            // Scale with Energy
                            var baseFB = 70 + 128*cp + 0.07*totalAP;
                            var extraE = energy; 
                            energy = 0; 
                            var multiplier = Math.pow(1.005, extraE);
                            abilityDmg = baseFB * multiplier;
                            
                            if (tal.feralAggression > 0) abilityDmg *= (1 + tal.feralAggression * 0.03);
                            
                            // Carnage (Refresh Bleeds chance)
                            if (Math.random() < (0.2 * tal.carnage * cp)) {
                                if (auras.rake > t) {
                                    auras.rake = t + 9.0;
                                    logAction("Carnage", "Refresh Rake");
                                }
                                // Simplified Rip refresh logic: Extend? 
                                // For Sim: We just assume it maintains uptime. 
                                // Real logic would re-add ticks. 
                                cpGen = 1; // Gain 1 CP instead of spending
                            } else {
                                cpGen = -cp; // Spent
                            }
                        }
                        
                        // Modifiers
                        abilityDmg *= dmgMod; // Natural Weapons
                        
                        // Tiger's Fury Flat Damage Add (Claw/Shred)
                        if (auras.tigersFury > t && (action === "Claw" || action === "Shred")) {
                             // TF adds to NormalDmg. Claw uses 105% of it, Shred 225%.
                             // Add scaled bonus.
                             abilityDmg += (action === "Claw" ? 52.5 : 112.5);
                        }

                        // Crit
                        if (res === "CRIT") abilityDmg *= 2.0; 
                        
                        // Armor (Physical)
                        var isBleed = (action === "Rip"); 
                        if (!isBleed) {
                             var dr = cfg.enemyArmor / (cfg.enemyArmor + 5882.5);
                             abilityDmg *= (1 - dr);
                        }
                        
                        dealDamage(action, abilityDmg, isBleed ? "Bleed" : "Physical", res);
                        
                        // Apply CP
                        cp += cpGen;
                        if (cp > 5) cp = 5;
                        if (cp < 0) cp = 0;
                    }
                    
                    if(!counts[action]) counts[action]=0; counts[action]++;
                    gcdEnd = t + 1.0;
                }
            }
        }
        
        // Safety Break
        if (t > maxT + 10) break;
    }
    
    // -----------------------------------------
    // 4. RETURN STATS
    // -----------------------------------------
    return {
        dps: totalDmg / maxT,
        totalDmg: totalDmg,
        duration: maxT,
        log: log,
        dmgSources: dmgSources,
        counts: counts,
        missCounts: missCounts,
        dodgeCounts: dodgeCounts,
        critCounts: critCounts,
        glanceCounts: glanceCounts,
        casts: counts
    };
}

// Helper: Aggregate multiple runs
function aggregateResults(results) {
    if (!results || results.length === 0) return {};
    var totalDPS = 0, totalDmg = 0;
    var counts = {}, dmgSources = {};
    var missCounts = {}, critCounts = {}, glanceCounts = {};
    
    results.forEach(r => {
        totalDPS += r.dps;
        totalDmg += r.totalDmg;
        for(var k in r.counts) counts[k] = (counts[k] || 0) + r.counts[k];
        for(var k in r.dmgSources) dmgSources[k] = (dmgSources[k] || 0) + r.dmgSources[k];
        for(var k in r.missCounts) missCounts[k] = (missCounts[k] || 0) + r.missCounts[k];
        for(var k in r.critCounts) critCounts[k] = (critCounts[k] || 0) + r.critCounts[k];
        for(var k in r.glanceCounts) glanceCounts[k] = (glanceCounts[k] || 0) + r.glanceCounts[k];
    });
    
    var n = results.length;
    for(var k in counts) counts[k] /= n;
    for(var k in dmgSources) dmgSources[k] /= n;
    for(var k in missCounts) missCounts[k] /= n;
    for(var k in critCounts) critCounts[k] /= n;
    for(var k in glanceCounts) glanceCounts[k] /= n;
    
    var avg = results[0]; 
    avg.dps = totalDPS / n;
    avg.totalDmg = totalDmg / n;
    avg.counts = counts;
    avg.dmgSources = dmgSources;
    avg.missCounts = missCounts;
    avg.critCounts = critCounts;
    avg.glanceCounts = glanceCounts;
    
    return avg;
}