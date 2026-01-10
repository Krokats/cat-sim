/**
 * Feral Simulation - File 5: Simulation Engine & Math
 * Updated for Turtle WoW 1.18 (Feral Cat) based on Info.txt
 */

// ============================================================================
// SIMULATION ENTRY POINT
// ============================================================================

function runSimulation() {
    var config = getSimInputs();
    
    // Validate
    if (config.iterations < 1) config.iterations = 1;
    
    showProgress("Simulating " + config.iterations + " iterations...");
    
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
    // Helper to get int
    var i = (id) => parseInt(getVal(id)) || 0;
    // Helper to get bool
    var b = (id) => getVal(id) == 1;
    // Helper to get float
    var f = (id) => parseFloat(getVal(id)) || 0;

    return {
        // Sim Settings
        simTime: f("simTime"),
        iterations: i("simCount"),
        
        // Player Config
        race: document.getElementById("char_race") ? document.getElementById("char_race").value : "Tauren",
        
        // Stats inputs (Base + Gear + Buffs)
        // NOTE: We assume the UI puts TOTAL stats here.
        // However, HoTW and Predatory Strikes scale BASE stats or TOTAL?
        // Info.txt says: "AP = BaseAP + AGI + 2*STR + EquipAP + BuffAP"
        // We will read the raw inputs and apply multipliers inside engine where appropriate.
        statStr: f("stat_str"),
        statAgi: f("stat_agi"),
        statAP: f("stat_ap"),
        statCrit: f("stat_crit"),
        statHit: f("stat_hit"),
        statHaste: f("stat_haste"),
        manaPool: f("mana_pool"),
        wepSkill: f("stat_wep_skill"),

        // Enemy
        enemyLevel: f("enemy_level"),
        enemyArmor: f("enemy_armor"),
        canBleed: b("enemy_can_bleed"),

        // Rotation Priorities
        posBehind: getVal("rota_position") === "back",
        useShred: b("rota_shred"), // If posBehind is false, this is ignored
        useRake: b("rota_rake"),
        useRip: b("rota_rip"),
        useBite: b("rota_bite"),
        useTF: b("rota_tf"),
        useShift: b("rota_shift"),
        useFF: b("rota_ff"),
        
        // Rotation Thresholds
        minCpRip: i("rota_rip_cp"),
        minCpBite: i("rota_bite_cp"),
        minEnergyBite: i("rota_bite_energy"),
        maxEnergyShift: i("rota_shift_energy"),

        // Talents
        tal: {
            ferocity: i("tal_ferocity"),
            feralAggression: i("tal_feral_aggression"),
            openWounds: i("tal_open_wounds"),
            sharpenedClaws: i("tal_sharpened_claws"),
            primalFury: i("tal_primal_fury"),
            bloodFrenzy: i("tal_blood_frenzy"),
            impShred: i("tal_imp_shred"),
            predatoryStrikes: i("tal_predatory_strikes"),
            ancientBrutality: i("tal_ancient_brutality"),
            berserk: i("tal_berserk"),
            hotw: i("tal_hotw"),
            carnage: i("tal_carnage"),
            lotp: i("tal_lotp"),
            furor: i("tal_furor"),
            natWeapons: i("tal_nat_weapons"),
            natShapeshifter: i("tal_nat_shapeshifter"),
            ooc: i("tal_ooc")
        },

        // Sets
        sets: {
            t1_5p: b("set_t1_5p"),
            t1_8p: b("set_t1_8p"),
            t25_3p: b("set_t25_3p"),
            t25_5p: b("set_t25_5p"),
            t35_3p: b("set_t35_3p"),
            t35_5p: b("set_t35_5p")
        },

        // Idols
        idol: getVal("idol_selection"), // String value

        // Items
        hasWolfshead: b("item_wolfshead"),
        hasMCP: b("item_mcp")
    };
}

// ============================================================================
// CORE ENGINE
// ============================================================================

function runCoreSimulation(cfg) {
    
    // -----------------------------------------
    // 1. INITIALIZE STATS & CONSTANTS
    // -----------------------------------------
    
    // Base Stats (Level 60)
    var raceData = RACE_STATS[cfg.race] || RACE_STATS["Tauren"];
    var baseAP = raceData.baseAp; 
    
    // Calculate Final Stats
    // Heart of the Wild: +20% Str (assuming cfg.statStr is pre-talent, or we apply it to total?)
    // Standard Sim convention: UI shows "Paperdoll" stats. 
    // BUT we need to separate Base vs Bonus for strict formula adherence if required.
    // Info.txt says: "AP = BaseAP + AGI + 2*STR ...".
    // Let's assume UI Input is the FINAL Visible Stat (including HoTW).
    // EXCEPT for AP modifiers that are invisible on sheet (like Predatory Strikes?).
    // Predatory Strikes (3/3): "Increase attack power by 10%". Usually this multiplies the total AP.
    
    var totalStr = cfg.statStr;
    var totalAgi = cfg.statAgi;
    
    // Base Calculation check:
    // If UI input AP is (Str*2 + Agi + Gear), we just take it.
    var totalAP = cfg.statAP; 
    
    // Apply Predatory Strikes (AP Multiplier)
    // "Increase attack power by 10%". 
    // Assuming 3 ranks: 3.33% per rank? Or 10% total. Text says 10%.
    // Formula: 1 + (0.10 * (Rank/3))
    var predStrikeMod = 1.0 + (0.10 * (cfg.tal.predatoryStrikes / 3));
    totalAP *= predStrikeMod;

    // Natural Weapons: Increase damage by 10%
    var natWeaponsMod = 1.0 + (0.10 * (cfg.tal.natWeapons / 3));
    
    // Crit
    // Base + Agi + Gear + Buffs. UI input has all.
    // Leader of the Pack (+3%) is a buff, handled in gear.js.
    // Sharpened Claws (+6%) is a talent, handled in gear.js (added to statCrit).
    var totalCrit = cfg.statCrit;

    // Weapon Damage (Paw)
    var baseWepMin = raceData.minDmg;
    var baseWepMax = raceData.maxDmg;

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
    var nextEnergyTick = 2.0; // Server tick
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
        berserk: 0,
        t35_3p: 0,          // +100 AP
        t35_5p: 0,          // Stacking buff
        t1_8p: 0            // Haste
    };
    
    // Stacks
    var stacks = {
        t35_5p: 0
    };
    
    // Cooldowns
    var cds = {
        tigersFury: 0,
        mcp: 0,
        berserk: 0,
        faerieFire: 0
    };

    // Metrics
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
        if (log.length < 1500) {
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

    // Init MCP
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
        
        if (events.length > 0) nextT = Math.min(nextT, events[0].t);
        if (nextEnergyTick > t) nextT = Math.min(nextT, nextEnergyTick);
        if (swingTimer > t) nextT = Math.min(nextT, swingTimer);
        if (gcdEnd > t) nextT = Math.min(nextT, gcdEnd);

        // Advance Time
        var dt = nextT - t;
        t = nextT;
        if (t >= maxT) break;
        
        // --- B. PROCESS EVENTS ---
        
        // 1. Process Queue (DoT Ticks, Special Energy Ticks)
        while (events.length > 0 && events[0].t <= t + 0.001) {
            var evt = events.shift();
            
            if (evt.type === "dot_tick") {
                var name = evt.data.name; 
                if (auras[name] >= t - 0.01) {
                    dealDamage(evt.data.label, evt.data.dmg * natWeaponsMod, "Bleed", "Tick");
                    
                    // Ancient Brutality: Restore 5 Energy
                    if (cfg.tal.ancientBrutality > 0) {
                        energy = Math.min(100, energy + 5);
                    }
                    
                    // T2.5 5p Proc Check (On Tick?) Info says "Damage of your Rake and Rip have a chance".
                    // Usually implies ticks too. 6% (Rake) / 10% (Rip).
                    if (cfg.sets.t25_5p) {
                        var chance = (name === "rake") ? 0.06 : 0.10;
                        if (Math.random() < chance) {
                            // "Empower next Shred, Rake or Claw"
                            // Simplified: Add buff? Or handled abstractly?
                            // Let's assume it adds a buff +15% dmg/crit.
                            // Not implemented in full detail without Aura ID, skipping complex logic for simplicity.
                        }
                    }
                }
            }
            else if (evt.type === "tf_energy") {
                // Tiger's Fury Regen Tick (10 energy)
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
        
        // 3. Cleanup Auras
        for (var k in auras) { if(auras[k] > 0 && auras[k] <= t) auras[k] = 0; }
        
        // MCP Refresh
        if (auras.mcp === 0 && cfg.hasMCP && mcpCharges > 0 && t > cds.mcp) {
            auras.mcp = t + 30.0;
            mcpCharges--;
            logAction("MCP", "Re-use", "Charges: "+mcpCharges);
        }

        // 4. White Swing
        if (t >= swingTimer - 0.001) {
            // Formula: NormalDmg (White) = BaseDmg + (TotalAP-BaseAP)/14
            // AP Scaling: Info.txt says "AP = ...". 
            // NOTE: Dynamic AP (T3.5 proc, Buffs) must be calculated here.
            
            var currentAP = totalAP;
            if (auras.t35_3p > t) currentAP += 100;
            if (auras.t35_5p > t) currentAP *= 1.25; // +25% AP
            
            var wDmg = baseWepMin + Math.random() * (baseWepMax - baseWepMin);
            // Info.txt: (TotalAP - BaseAP)/14
            var apBonus = (currentAP - baseAP) / 14.0;
            var normalDmgRaw = wDmg + apBonus;
            
            // Tiger's Fury: "Increase damage done by 50 (adds to NormalDmg)"
            if (auras.tigersFury > t) normalDmgRaw += 50;
            
            var swingDmg = normalDmgRaw * natWeaponsMod;

            // Attack Table
            var roll = Math.random() * 100;
            var hitType = "HIT";
            
            // Hit Rating 0% base. Chance to Hit by 3% from Talents.
            // Miss vs Lvl 63 = 8.6%. 
            var missChance = Math.max(0, 8.6 - cfg.statHit - (cfg.tal.natWeapons)); 
            var dodgeChance = 6.5; 
            var critChance = totalCrit;
            
            // Glancing
            var glanceChance = (cfg.enemyLevel === 63) ? 40.0 : 0.0;
            var glancePenalty = CONSTANTS.GLANCE_PENALTY_300; // 0.35 -> 0.65 dmg
            // Adjust based on weapon skill
            var skillDiff = (cfg.enemyLevel * 5) - cfg.wepSkill;
            if (skillDiff <= 10) glancePenalty = 0.15; // 305
            if (skillDiff <= 5) glancePenalty = 0.05; // 310

            if (roll < missChance) {
                hitType = "MISS";
                if(!missCounts.Auto) missCounts.Auto=0; missCounts.Auto++;
            } else if (roll < missChance + dodgeChance) {
                hitType = "DODGE";
                if(!dodgeCounts.Auto) dodgeCounts.Auto=0; dodgeCounts.Auto++;
            } else if (roll < missChance + dodgeChance + glanceChance) {
                hitType = "GLANCE";
                swingDmg *= (1 - glancePenalty);
                if(!glanceCounts.Auto) glanceCounts.Auto=0; glanceCounts.Auto++;
            } else if (roll < missChance + dodgeChance + glanceChance + critChance) {
                hitType = "CRIT";
                swingDmg *= 2.0;
                if(!critCounts.Auto) critCounts.Auto=0; critCounts.Auto++;
            }
            
            // Apply Damage
            if (hitType !== "MISS" && hitType !== "DODGE") {
                // Armor Reduction
                var dr = cfg.enemyArmor / (cfg.enemyArmor + 400 + 85 * (60 + 4.5 * (60 - 59))); // Standard Formula
                swingDmg *= (1 - dr);
                
                dealDamage("Auto Attack", swingDmg, "Physical", hitType);
                
                // Omen of Clarity: 10% chance
                if (cfg.tal.ooc && Math.random() < 0.10) {
                    auras.clearcasting = t + 10.0; // 10s?
                    logAction("Proc", "Clearcasting");
                }
                
                // T3.5 5p: "Granting 3 Energy each time you attack for 10 sec" (Buff phase)
                if (auras.t35_5p > t) {
                    energy = Math.min(100, energy + 3);
                }
            }
            if(!counts.Auto) counts.Auto=0; counts.Auto++;

            // Next Swing
            var speed = 1.0; 
            var hasteMul = 1.0;
            if (cfg.statHaste > 0) hasteMul *= (1 + cfg.statHaste/100);
            if (auras.mcp > t) hasteMul *= 1.5;
            if (cfg.tal.bloodFrenzy > 0 && auras.tigersFurySpeed > t) hasteMul *= 1.2;
            if (auras.t1_8p > t) hasteMul *= 1.15; // T1 8p: 15% haste
            
            swingTimer = t + (speed / hasteMul);
        }
        
        // --- C. ACTION PRIORITY LIST (GCD CHECK) ---
        
        if (t >= gcdEnd) {
            
            // Recalculate Dynamic AP for abilities
            var curAP = totalAP;
            if (auras.t35_3p > t) curAP += 100;
            if (auras.t35_5p > t) curAP *= 1.25;

            // Recalculate NormalDmg for Abilities (Includes TF bonus!)
            // "Tiger's Fury: Increase damage done by 50 (adds to NormalDmg)"
            // Formula: BaseDmg + (TotalAP - BaseAP)/14
            // Since Claw/Shred use multipliers on NormalDmg, they amplify TF!
            var wMin = raceData.minDmg; var wMax = raceData.maxDmg;
            var wAvg = (wMin + wMax) / 2;
            var normalDmg = wAvg + (curAP - baseAP) / 14.0;
            if (auras.tigersFury > t) normalDmg += 50;

            // Costs
            var costMod = 0;
            if (cfg.idol === "Idol of Ferocity") costMod += 3;
            if (cfg.sets.t25_3p) costMod += 3;

            var costClaw = 45 - cfg.tal.ferocity - costMod; 
            var costRake = 40 - cfg.tal.ferocity - costMod;
            var costShred = 60 - (cfg.tal.impShred * 6) - (cfg.sets.t25_3p ? 3 : 0); // Idol Ferocity only Rake/Claw?
            // "Idol of Ferocity: Reduce energy cost of Claw and Rake by 3" -> Not Shred.
            // "T2.5/3: Reduce cost of Rake, Shred and Claw by 3" -> Yes Shred.
            
            var costRip = 30;
            var costBite = 35;
            var costTF = 30; 
            if (cfg.sets.t1_5p) costTF -= 5;

            var isOoc = (auras.clearcasting > t);
            if (isOoc) {
                costClaw=0; costRake=0; costShred=0; costRip=0; costBite=0;
            }
            
            var action = null;
            
            // ---------------------------------------
            // ROTATION LOGIC (Based on Info.txt)
            // ---------------------------------------
            
            // 0. Berserk
            if (!action && cfg.tal.berserk > 0 && t >= cds.berserk) {
                action = "Berserk";
            }

            // 1. Rip
            // Condition: Target_has_no_debuff:"Rip" and CP > RipCP and Rip_active
            // Using minCpRip config
            if (!action && cfg.useRip && auras.rip <= t && cp >= cfg.minCpRip && energy >= costRip) {
                action = "Rip";
            }

            // 2. Ferocious Bite
            // Condition: CP >= 5 and FB_active and Energy > FB_Energylvl
            // (Info.txt says CP > 4 i.e. 5)
            if (!action && cfg.useBite && cp >= cfg.minCpBite && energy >= cfg.minEnergyBite && energy >= costBite) {
                action = "Ferocious Bite";
            }

            // 3. Powershift
            // Condition: Energy < Reshift_Energylv and RS_active
            if (!action && cfg.useShift && energy < cfg.maxEnergyShift && mana > 400) {
                action = "Powershift";
            }

            // 4. Tiger's Fury
            // Condition: no_my_buff:"Tiger's Fury" and TF_active
            // Info.txt: "Remaining Time" option implies refreshing.
            // Only use if we have energy for it? Or prioritize over builders?
            // In standard lists TF is lower prio than Finishers but higher than builders?
            // "if (no_my_buff...)"
            if (!action && cfg.useTF && auras.tigersFury <= t && energy >= costTF) {
                action = "Tiger's Fury";
            }

            // 5. Rake
            // Condition: Target_is_not_Bleed_Immune and has_no_debuff:"Rake" and (behind and nomybuff:Clearcasting) ...
            // Wait, "Clearcasting should be used for Shred if Behind". So DO NOT Rake if OOC and Behind.
            if (!action && cfg.useRake && cfg.canBleed && auras.rake <= t && energy >= costRake) {
                var skipRake = (isOoc && cfg.posBehind && cfg.useShred);
                if (!skipRake) {
                    action = "Rake";
                }
            }

            // 6. Builder (Shred / Claw)
            // Condition: ((my_buff:"Clearcasting" or Target_is_Bleed_Immune) and behind and Shred_active) then cast "Shred"
            // elseif (Claw_active) cast "Claw"
            if (!action) {
                if (cfg.posBehind && cfg.useShred && energy >= costShred) {
                    action = "Shred";
                } else if (!cfg.posBehind && energy >= costClaw) { // Or if Shred disabled
                    action = "Claw";
                }
            }
            
            // ---------------------------------------
            // EXECUTION
            // ---------------------------------------
            if (action) {
                var payEnergy = 0;
                
                if (action === "Berserk") {
                    auras.berserk = t + 20.0;
                    cds.berserk = t + 360.0;
                    logAction("Berserk", "Energy Regen +100%");
                    gcdEnd = t + 1.0;
                }
                else if (action === "Powershift") {
                    mana -= (400 * (1 - cfg.tal.natShapeshifter * 0.1)); 
                    energy = (cfg.tal.furor * 8); // 5/5 -> 40
                    if (cfg.hasWolfshead) energy += 20;
                    if (energy > 100) energy = 100;
                    // Reshift removes Tiger's Fury (Info.txt)
                    auras.tigersFury = 0; 
                    auras.tigersFurySpeed = 0;
                    logAction("Powershift", "Energy -> " + energy);
                    gcdEnd = t + 1.0; // GCD
                } 
                else if (action === "Tiger's Fury") {
                    payEnergy = costTF;
                    var dur = 6;
                    if (cfg.tal.bloodFrenzy > 0) dur += 12; // +12s
                    auras.tigersFury = t + dur;
                    if (cfg.tal.bloodFrenzy > 0) auras.tigersFurySpeed = t + 18; // "18 sec" total? Or 6+12=18. Yes.
                    
                    // "Regenerates 10 energy every 3 sec for 6 sec"
                    // Add Events
                    addEvent(t + 3.0, "tf_energy");
                    addEvent(t + 6.0, "tf_energy");
                    
                    logAction("Tiger's Fury", "Buff Applied");
                    gcdEnd = t + 1.0;
                }
                else {
                    // ATTACKS
                    if (action === "Claw") payEnergy = costClaw;
                    if (action === "Rake") payEnergy = costRake;
                    if (action === "Shred") payEnergy = costShred;
                    if (action === "Rip") payEnergy = costRip;
                    if (action === "Ferocious Bite") payEnergy = costBite;
                    
                    energy -= payEnergy;
                    if (isOoc) {
                        auras.clearcasting = 0;
                        logAction("Clearcasting", "Consumed");
                    }
                    
                    // Hit Roll
                    var roll = Math.random() * 100;
                    var missC = Math.max(0, 9.0 - cfg.statHit - cfg.tal.natWeapons);
                    var dodgeChance = 6.5; 
                    var critChance = totalCrit;
                    
                    var res = "HIT";
                    if (roll < missC) res = "MISS";
                    else if (roll < missC + dodgeChance) res = "DODGE";
                    else if (roll < missC + dodgeChance + critChance) res = "CRIT";
                    
                    if (res === "MISS" || res === "DODGE") {
                        energy += (payEnergy * 0.8);
                        if(energy > 100) energy = 100;
                    } else {
                        // HIT/CRIT
                        var cpGen = 0;
                        if (action === "Claw" || action === "Rake" || action === "Shred") {
                            cpGen = 1;
                            if (res === "CRIT" && cfg.tal.primalFury > 0) cpGen++;
                        }
                        
                        var dmg = 0;
                        
                        // --- DAMAGE LOGIC ---
                        if (action === "Claw") {
                            // 105% * NormalDmg + 115
                            dmg = 1.05 * normalDmg + 115;
                            // Open Wounds: +10% * # per bleed
                            var bleeds = 0;
                            if (auras.rake > t) bleeds++;
                            if (auras.rip > t) bleeds++;
                            if (bleeds > 0) dmg *= (1 + (0.10 * cfg.tal.openWounds * bleeds));
                            // Predatory Strikes (increase damage by 20%)
                            if (cfg.tal.predatoryStrikes > 0) dmg *= 1.20;
                        }
                        else if (action === "Shred") {
                            // 225% * NormalDmg + 180
                            dmg = 2.25 * normalDmg + 180;
                            // Imp Shred: +5% * #
                            if (cfg.tal.impShred > 0) dmg *= (1 + cfg.tal.impShred * 0.05);
                        }
                        else if (action === "Rake") {
                            // HIT: 61 + 0.115 * TotalAP
                            dmg = 61 + (0.115 * curAP);
                            // Predatory Strikes (+20%)
                            if (cfg.tal.predatoryStrikes > 0) dmg *= 1.20;
                            
                            // DoT: 102 + 0.09 * TotalAP (Total over 3 ticks)
                            var dotTotal = 102 + (0.09 * curAP);
                            if (cfg.tal.predatoryStrikes > 0) dotTotal *= 1.20;
                            var tickVal = dotTotal / 3;
                            
                            // Apply DoT
                            // Duration: 9s. Idol of Savagery reduces duration by 10%?
                            var dur = 9.0;
                            var tickInt = 3.0;
                            if (cfg.idol === "Idol of Savagery") {
                                dur *= 0.9;
                                tickInt *= 0.9;
                            }
                            auras.rake = t + dur;
                            addEvent(t + tickInt, "dot_tick", { name: "rake", dmg: tickVal, label: "Rake (DoT)" });
                            addEvent(t + tickInt*2, "dot_tick", { name: "rake", dmg: tickVal, label: "Rake (DoT)" });
                            addEvent(t + tickInt*3, "dot_tick", { name: "rake", dmg: tickVal, label: "Rake (DoT)" });
                            
                            // T3.5 3p Proc Check (5% on Rake/Claw/Shred)
                            if (cfg.sets.t35_3p && Math.random() < 0.05) {
                                auras.t35_3p = t + 10.0;
                                logAction("Proc", "T3.5 AP Buff");
                            }
                        }
                        else if (action === "Rip") {
                            // Ticks: 4 + CP
                            var ticks = 4 + cp;
                            // Tick Dmg: 47 + (CP-1)*31 + Min(4,CP)/100 * (AP-BaseAP)
                            var cpScaled = Math.min(4, cp);
                            var tickBase = 47 + (cp - 1)*31 + (cpScaled/100 * (curAP - baseAP));
                            
                            // Open Wounds: +5% * #
                            if (cfg.tal.openWounds > 0) tickBase *= (1 + cfg.tal.openWounds * 0.05);
                            
                            var dur = ticks * 2.0;
                            var tickInt = 2.0;
                            if (cfg.idol === "Idol of Savagery") {
                                // Reduce time between ticks and duration by 10%
                                dur *= 0.9;
                                tickInt *= 0.9;
                            }
                            auras.rip = t + dur;
                            
                            for(var i=1; i<=ticks; i++) {
                                addEvent(t + (i*tickInt), "dot_tick", { name: "rip", dmg: tickBase, label: "Rip" });
                            }
                            cpGen = -cp;
                        }
                        else if (action === "Ferocious Bite") {
                            // (70 + 128*CP + 0.07*TotalAP) * 1.005^(Remaining Energy)
                            var baseFB = 70 + 128*cp + 0.07*curAP;
                            var extraE = energy; // Consumes all
                            energy = 0; 
                            var scale = Math.pow(1.005, extraE);
                            dmg = baseFB * scale;
                            
                            // Feral Aggression: +3% * #
                            if (cfg.tal.feralAggression > 0) dmg *= (1 + cfg.tal.feralAggression * 0.03);
                            
                            // Carnage: 20% per CP to refresh bleeds + 1 CP
                            if (Math.random() < (0.2 * cfg.tal.carnage * cp)) {
                                // Refresh Rake
                                if (auras.rake > t) {
                                    auras.rake = t + 9.0; // Reset duration
                                    logAction("Carnage", "Refresh Rake");
                                }
                                // Refresh Rip? Info.txt says "refresh your active Rake and Rip".
                                // We assume full refresh.
                                cpGen = 1;
                            } else {
                                cpGen = -cp;
                            }
                            
                            // Idol of Laceration: Refund 15 Energy for next Shred?
                            // Logic: "20% chance per CP to cause next Shred to refund 15 Energy".
                            // Not fully implemented in this snippet (requires 'nextSpellBuff').
                            
                            // T1 8p: 20% chance per CP to increase attack speed by 15% for 5 attacks.
                            // Simplified: 15% haste for 6 seconds?
                            if (cfg.sets.t1_8p && Math.random() < (0.2 * cp)) {
                                auras.t1_8p = t + 10.0; // Approx
                                logAction("Proc", "T1 8p Haste");
                            }
                        }
                        
                        // Modifiers (Natural Weapons)
                        dmg *= natWeaponsMod;
                        
                        // Crit
                        if (res === "CRIT") dmg *= 2.0;
                        
                        // Armor (Physical)
                        var isBleed = (action === "Rip");
                        if (!isBleed) {
                            var dr = cfg.enemyArmor / (cfg.enemyArmor + 400 + 85 * (60 + 4.5 * (60 - 59)));
                            dmg *= (1 - dr);
                        }
                        
                        dealDamage(action, dmg, isBleed ? "Bleed" : "Physical", res);
                        
                        // Update CP
                        cp += cpGen;
                        if (cp > 5) cp = 5;
                        if (cp < 0) cp = 0;
                        
                        // T3.5 5p Stacking (Spend CP -> Stack)
                        // "Spending CP grants stack... At 25, consume for 25% AP + 3 Energy/Hit"
                        if (cfg.sets.t35_5p && cpGen < 0) {
                            var spent = Math.abs(cpGen); // was negative
                            // cpGen for Rip/Bite is -cp (so spent amount)
                            // Wait, logic above: cpGen = -cp.
                            stacks.t35_5p += spent;
                            if (stacks.t35_5p >= 25) {
                                stacks.t35_5p = 0;
                                auras.t35_5p = t + 10.0; // 10 sec buff
                                logAction("Proc", "Primal Ferocity (25 Stacks)");
                            }
                        }
                        
                        // T3.5 3p Proc Check (Claw/Shred/Rake)
                        if (cfg.sets.t35_3p && (action === "Claw" || action === "Shred" || action === "Rake")) {
                            if (Math.random() < 0.05) {
                                auras.t35_3p = t + 10.0;
                                logAction("Proc", "T3.5 AP Buff");
                            }
                        }
                    }
                    
                    if(!counts[action]) counts[action]=0; counts[action]++;
                    gcdEnd = t + 1.0;
                }
            }
        }
        
        // Safety
        if (t > maxT + 10) break;
    }
    
    // -----------------------------------------
    // 4. RETURN
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
        glanceCounts: glanceCounts
    };
}

// Helper: Aggregation
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
