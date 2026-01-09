/**
 * Feral Simulation - File 5: Simulation Engine & Math
 * Updated for Turtle WoW 1.18 (Feral Cat)
 * Event-based engine: Handles GCD, Energy Ticks, Swing Timer, and resource management.
 */

// ============================================================================
// SIMULATION ENTRY POINT
// ============================================================================

function runSimulation() {
    // 1. Fetch Inputs
    var config = getSimInputs();
    
    // 2. Validate
    if (config.iterations < 1) config.iterations = 1;
    
    // 3. Run
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
            
            // Update UI
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
    // Collect all inputs from UI and Globals
    return {
        // Sim Settings
        simTime: parseFloat(getVal("simTime")) || 60,
        iterations: parseInt(getVal("simCount")) || 1000,
        calcMethod: document.getElementById("calcMethod") ? document.getElementById("calcMethod").value : "avg",

        // Player Stats (Base + Gear)
        minDmg: parseFloat(getVal("stat_wep_dmg_min")) || 55,
        maxDmg: parseFloat(getVal("stat_wep_dmg_max")) || 85,
        ap: parseFloat(getVal("stat_ap")) || 0,
        crit: parseFloat(getVal("stat_crit")) || 0,
        hit: parseFloat(getVal("stat_hit")) || 0,
        haste: parseFloat(getVal("stat_haste")) || 0,
        wepSkill: parseFloat(getVal("stat_wep_skill")) || 300,
        manaPool: parseFloat(getVal("mana_pool")) || 4000,

        // Enemy
        enemyLevel: parseFloat(getVal("enemy_level")) || 63,
        enemyArmor: parseFloat(getVal("enemy_armor")) || 3731,
        canBleed: getVal("enemy_can_bleed") === 1,

        // Rotation Config
        posBehind: getVal("rota_position") === "back",
        usePowershift: getVal("rota_powershift") === 1,
        useRake: getVal("rota_rake") === 1,
        useBite: getVal("rota_bite") === 1,
        aggressiveShift: getVal("rota_aggressive_shift") === 1,

        // Specials
        hasWolfshead: document.getElementById("meta_wolfshead").checked,
        hasT05_4p: document.getElementById("set_t05_4p").checked,
        hasMCP: document.getElementById("item_mcp").checked,
        hasOmen: true, // Assuming Omen talent is standard
        hasFuror: true // Assuming Furor talent is standard
    };
}

// ============================================================================
// CORE ENGINE
// ============================================================================

function runCoreSimulation(cfg) {
    // --- STATE INITIALIZATION ---
    var t = 0.0; // Current Time
    var maxT = cfg.simTime;
    
    // Resources
    var energy = 100;
    var mana = cfg.manaPool;
    var cp = 0; // Combo Points

    // Timers (Next Event timestamps)
    var nextEnergyTick = 0.0; // Ticks happen at T=0, 2, 4... (Start at 0 to sync, actually first tick after start is usually 2s relative to server, but we assume start at 0 is a fresh tick boundary)
    // Actually, in WoW, you enter combat at arbitrary tick time. Let's randomize start tick offset slightly or assume 0 for consistent "fresh" start.
    // Let's set first tick at 2.0s
    nextEnergyTick = 2.0; 

    var nextGCD = 0.0;
    var nextSwing = 0.0;
    var duration = 0;

    // Cooldowns & Auras
    var auras = {
        "Clearcasting": 0, // Omen
        "Tiger's Fury": 0,
        "Rip": 0,
        "Rake": 0,
        "HasteBuff": 0, // MCP
    };
    
    var cds = {
        "TigersFury": 0,
        "MCP": 0
    };

    // Damage Log
    var log = [];
    var dmgSources = {};
    var counts = {}; // Cast counts
    var missCounts = {};
    var dodgeCounts = {};
    var critCounts = {};
    var glanceCounts = {};
    var totalDmg = 0;
    
    // Stats Cache
    var hitChance = Math.min(cfg.hit, cfg.enemyLevel === 63 ? 8.0 : 5.0); // Hard cap 8% yellow
    var armorReduction = getArmorReduction(cfg.enemyArmor, 60);
    
    // Glancing Logic
    // Base chance 40% vs lvl 63.
    // Penalty depends on skill. 300 skill vs 315 def = 0.65 factor (-35%).
    // 305 skill vs 315 def = ~0.85 factor (-15%).
    var skillDiff = (cfg.enemyLevel * 5) - cfg.wepSkill; // 315 - 300 = 15
    var glanceChance = 0.40;
    var glancePenaltyFactor = 0.65; // Default for 300 skill
    
    // Approximation of Glancing Penalty based on Skill Delta
    if (skillDiff <= 10) glancePenaltyFactor = 0.85; // 305 skill
    if (skillDiff <= 5) glancePenaltyFactor = 0.95; // 310 skill
    if (cfg.enemyLevel <= 60) { glanceChance = 0.10; glancePenaltyFactor = 1.0; } // Non-Boss

    // Helper: Add Damage
    function dealDamage(source, amount, type, resultInfo) {
        if (!dmgSources[source]) dmgSources[source] = 0;
        dmgSources[source] += amount;
        totalDmg += amount;
        
        // Log
        if (log.length < 500) { // Limit log size for performance
            log.push({
                t: t,
                event: "Damage",
                ability: source,
                result: resultInfo || "HIT",
                dmg: amount,
                energy: energy,
                cp: cp,
                mana: mana
            });
        }
    }
    
    function logEvent(evt, ability, info, res) {
        if (log.length < 500) {
            log.push({
                t: t,
                event: evt,
                ability: ability,
                result: res || "",
                dmg: 0,
                energy: energy,
                cp: cp,
                mana: mana,
                info: info
            });
        }
    }

    // Use MCP at start if enabled
    var mcpCharges = cfg.hasMCP ? 3 : 0;
    if (cfg.hasMCP) {
        auras["HasteBuff"] = 30.0;
        cds["MCP"] = 0; // Immediate use logic for sim
        mcpCharges--;
        logEvent("Buff", "MCP Haste", "Charges: " + mcpCharges);
    }

    // --- MAIN LOOP ---
    while (t < maxT) {
        // 1. Determine Time Step (Jump to next event)
        // Events: GCD, Swing, Energy Tick, Aura Expiry, Sim End
        var events = [
            nextGCD, 
            nextSwing, 
            nextEnergyTick, 
            maxT
        ];
        
        // Add Aura expiries to events
        for(var a in auras) { if(auras[a] > t) events.push(auras[a]); }

        // Find earliest future event
        var nextT = maxT;
        for(var i=0; i<events.length; i++) {
            if(events[i] > t + 0.0001 && events[i] < nextT) nextT = events[i];
        }
        
        t = nextT;
        if (t >= maxT) break;

        // 2. Process Passive Events (Ticks, Buffs falling off)
        
        // Energy Tick
        if (t >= nextEnergyTick - 0.001) {
            energy = Math.min(100, energy + 20);
            nextEnergyTick += 2.0;
            // logEvent("Tick", "Energy", "+20"); // Too spammy
        }

        // Auto Attack (Swing)
        if (t >= nextSwing - 0.001) {
            // Calculate Damage
            // (DPS + AP/14) * speed. Speed is 1.0.
            // DPS = (Min+Max)/2 / 1.0 (since inputs are dmg range)
            var baseWepDmg = (cfg.minDmg + Math.random() * (cfg.maxDmg - cfg.minDmg));
            var apBonus = (cfg.ap / 14.0) * 1.0;
            var swingDmg = baseWepDmg + apBonus;
            
            // Multipliers
            swingDmg *= 1.0; // DMG mod (e.g. 10% dmg buff) - simplified here
            
            // Attack Table
            var roll = Math.random() * 100;
            var result = "HIT";
            var dmgFinal = 0;
            
            // Table Priorities: Miss > Dodge > Glance > Crit > Hit
            var missChance = Math.max(0, 8.0 - cfg.hit); // 8% base vs boss
            var dodgeChance = 6.5; 
            var critChance = cfg.crit;
            // Glancing is handled separately for white hits
            
            if (roll < missChance) {
                result = "MISS";
                if (!missCounts["Auto Attack"]) missCounts["Auto Attack"] = 0; missCounts["Auto Attack"]++;
            } else if (roll < missChance + dodgeChance) {
                result = "DODGE";
                if (!dodgeCounts["Auto Attack"]) dodgeCounts["Auto Attack"] = 0; dodgeCounts["Auto Attack"]++;
            } else {
                // Landed (Glance, Crit, or Hit)
                // Glancing check (only white hits)
                var isGlance = (Math.random() < glanceChance);
                
                if (isGlance) {
                    result = "GLANCE";
                    swingDmg *= glancePenaltyFactor;
                    if (!glanceCounts["Auto Attack"]) glanceCounts["Auto Attack"] = 0; glanceCounts["Auto Attack"]++;
                } else {
                    // Crit Check (Crit Cap exists due to Glancing, but usually unreachable for Feral in this simplified model)
                    if (Math.random() * 100 < critChance) {
                        result = "CRIT";
                        swingDmg *= 2.0;
                        if (!critCounts["Auto Attack"]) critCounts["Auto Attack"] = 0; critCounts["Auto Attack"]++;
                        
                        // Primal Fury (Talent): 100% chance to gain 5 rage? No, wait. 
                        // Feral Cat doesn't gain resource on crit white hit unless specific set/talent?
                        // "Omen of Clarity" triggers on HIT (White)
                    }
                }
                
                // Armor Reduction
                dmgFinal = swingDmg * (1 - armorReduction);
                dealDamage("Auto Attack", dmgFinal, "Physical", result);
                
                // Omen of Clarity Proc (On Hit)
                // Approx 2.0 PPM. Speed 1.0 => 3.3%? 
                // Wait, standard Clearcasting is PPM. Let's use 10% generous estimate or PPM.
                // Using flat 6% per hit for now.
                if (cfg.hasOmen && Math.random() < 0.06) {
                    auras["Clearcasting"] = t + 10.0; // 10s duration
                    logEvent("Buff", "Clearcasting", "Free Spell");
                }
                
                // T0.5 Set Bonus (Energy Proc)
                if (cfg.hasT05_4p && Math.random() < 0.04) { // ~4% chance on hit
                    energy = Math.min(100, energy + 20);
                    logEvent("Proc", "Energy Restore", "+20 (Set)");
                }
            }
            
            if (!counts["Auto Attack"]) counts["Auto Attack"] = 0; counts["Auto Attack"]++;

            // Schedule Next Swing
            // Haste affects swing speed
            var speed = 1.0;
            if (auras["HasteBuff"] > t) speed /= 1.5; // MCP 50%
            if (cfg.haste > 0) speed /= (1 + (cfg.haste / 100));
            
            nextSwing += speed;
            // Catchup if lag
            if (nextSwing < t) nextSwing = t + speed;
        }

        // Cleanup Auras
        for (var a in auras) { if (auras[a] <= t) auras[a] = 0; }
        
        // MCP Refresh Logic
        if (cfg.hasMCP && auras["HasteBuff"] <= 0 && mcpCharges > 0 && t > cds["MCP"]) {
            // Usually MCP has no GCD, instant.
            auras["HasteBuff"] = t + 30.0;
            mcpCharges--;
            logEvent("Buff", "MCP Haste", "Charges: " + mcpCharges);
        }

        // 3. DECISION ENGINE (ROTATION)
        // Only if GCD is ready
        if (t >= nextGCD) {
            
            // -- POWERSHIFT CHECK --
            // Logic: Energy low? Mana high? Shift.
            // Cost: Mana. Gain: Energy to 60. GCD: 1.0s.
            var shiftThreshold = 10;
            if (cfg.aggressiveShift) {
                // Aggressive: Shift if we can't cast Shred/Claw (e.g. < 40 energy) 
                // and next tick is far away (> 1.0s)? 
                // Simplified: Shift if < 20 energy.
                shiftThreshold = 20;
            }
            
            // Don't shift if we have 5 CP (Use finisher first)
            var canShift = cfg.usePowershift && mana > 500 && cp < 5; 
            
            // Special Rule: Wait for tick?
            // If nextTick is very close (< 0.5s), maybe wait for it instead of shifting?
            var timeToTick = nextEnergyTick - t;
            
            if (canShift && energy <= shiftThreshold) {
                // Execute Shift
                // In Turtle: "Reshift" spell uses mana and sets energy.
                // Assuming Furor (40) + Wolfshead (20) = 60 Energy.
                
                mana -= 400; // Approx cost reduced by talents
                energy = 60; // Instant 60
                
                if (!counts["Powershift"]) counts["Powershift"] = 0; counts["Powershift"]++;
                logEvent("Cast", "Powershift", "Energy -> 60");
                
                // Trigger GCD
                nextGCD = t + 1.0; // Shifting incurs global cooldown
                continue; // Action taken, loop again
            }

            // -- ENERGY ABILITY PRIORITY --
            
            var action = null;
            var cost = 0;
            
            // Cost Modifiers
            var costShred = 48; // Talented
            var costClaw = 40;  // Talented
            var costRake = 35;  // Talented
            var costRip = 30;
            var costBite = 35;
            
            // Clearcasting Check
            var isClearcast = (auras["Clearcasting"] > t);
            if (isClearcast) {
                costShred = 0; costClaw = 0; costRake = 0; costRip = 0; costBite = 0;
            }

            // 1. FINISHERS (5 CP)
            if (cp >= 5) {
                // Priority: Rip > Bite
                // Condition: Target can bleed for Rip
                
                var ripActive = (auras["Rip"] > t);
                
                if (cfg.canBleed && !ripActive) {
                    // CAST RIP
                    if (energy >= costRip) {
                        action = "Rip";
                        cost = costRip;
                    }
                } else if (cfg.useBite) {
                    // CAST BITE
                    if (energy >= costBite) {
                        action = "Ferocious Bite";
                        cost = costBite;
                    }
                } else {
                    // If Bite disabled and Rip active, we might waste CP or just Claw/Shred?
                    // Vanilla behavior: Continue building (waste CP) or pool?
                    // Let's assume we pool or wait. But simplified: Do nothing, let Swing happen.
                }
            }
            
            // 2. BUILDERS
            if (!action) {
                // Priority: Rake (if not active & bleed allowed) > Shred/Claw
                
                var rakeActive = (auras["Rake"] > t);
                
                if (cfg.useRake && cfg.canBleed && !rakeActive) {
                    if (energy >= costRake) {
                        action = "Rake";
                        cost = costRake;
                    }
                }
                
                if (!action) {
                    // Shred or Claw
                    var spell = cfg.posBehind ? "Shred" : "Claw";
                    var c = cfg.posBehind ? costShred : costClaw;
                    
                    if (energy >= c) {
                        action = spell;
                        cost = c;
                    }
                }
            }
            
            // EXECUTE ACTION
            if (action) {
                // Deduct Cost
                energy -= cost;
                
                // Consume Clearcasting
                if (isClearcast) {
                    auras["Clearcasting"] = 0;
                    logEvent("Buff", "Clearcasting", "Consumed");
                }
                
                // Perform Attack
                var dmg = 0;
                var res = "HIT";
                
                // Roll Hit/Crit/Dodge/Miss (Yellow Hit)
                // Yellow Hit Cap is 8%.
                // Table: Miss > Dodge > Crit > Hit (No Glancing for Yellow)
                var roll = Math.random() * 100;
                var missC = Math.max(0, 8.0 - cfg.hit); // Yellow Cap 8% assumed
                
                if (roll < missC) {
                    res = "MISS";
                    energy += (cost * 0.8); // Refund 80% on miss
                    if (!missCounts[action]) missCounts[action] = 0; missCounts[action]++;
                } else if (roll < missC + dodgeChance) {
                    res = "DODGE";
                    energy += (cost * 0.8); // Refund 80% on dodge
                    if (!dodgeCounts[action]) dodgeCounts[action] = 0; dodgeCounts[action]++;
                } else {
                    // HIT or CRIT
                    var isCrit = (Math.random() * 100 < cfg.crit);
                    if (action === "Rip") isCrit = false; // DoTs don't crit in Classic
                    
                    if (isCrit) {
                        res = "CRIT";
                        if (!critCounts[action]) critCounts[action] = 0; critCounts[action]++;
                        
                        // Primal Fury: Crit grants 2 CP total (1 base + 1 bonus)
                        // Only for generators
                        if (action === "Shred" || action === "Claw" || action === "Rake") {
                            cp += 1; // Bonus point
                        }
                    }
                    
                    // Damage Calculation
                    var dmgBase = 0;
                    var ap = cfg.ap;
                    // Apply AP mods here
                    
                    if (action === "Shred") {
                        // (Wep * 2.25) + 180
                        var wep = (cfg.minDmg + cfg.maxDmg) / 2; // Avg weapon dmg
                        dmgBase = (wep * 2.25) + 180;
                        cp++;
                    } else if (action === "Claw") {
                        // Wep + 115
                        var wep = (cfg.minDmg + cfg.maxDmg) / 2;
                        dmgBase = wep + 115;
                        
                        // OPEN WOUNDS (Turtle): +10% per bleed
                        var bleeds = 0;
                        if (auras["Rake"] > t) bleeds++;
                        if (auras["Rip"] > t) bleeds++;
                        if (bleeds > 0) dmgBase *= (1 + (0.10 * bleeds));
                        
                        cp++;
                    } else if (action === "Rake") {
                        // Initial Dmg: Wep * 0.5 + 20 (Low)
                        var wep = (cfg.minDmg + cfg.maxDmg) / 2;
                        dmgBase = (wep * 0.5) + 20;
                        cp++;
                        
                        // Apply DoT
                        if (res !== "MISS" && res !== "DODGE") {
                            auras["Rake"] = t + 9.0;
                            // DoT Ticks calculation handled implicitly? 
                            // No, we need to schedule ticks or deal full DoT dmg? 
                            // Simulating ticks is better.
                            // Simplified: Just add total DoT dmg divided over time?
                            // Let's implement DoT ticks in future updates. 
                            // For now: Add total expected DoT dmg immediately to keep engine simple (DPM Map style) 
                            // OR handle tick events. 
                            // Let's Add DoT damage flat here for simplicity of the prototype.
                            var rakeDoT = (9/3) * (19 + ap * 0.06); // 3 ticks, base ~19 + AP scaling
                            dealDamage("Rake (DoT)", rakeDoT * (1 - armorReduction), "Bleed", "DoT"); 
                        }
                    } else if (action === "Rip") {
                        // Finisher. High DoT.
                        // Base (5 CP) ~ 1000? Formula: Base + 0.24 * AP
                        // Rank 6 Rip (Level 60): 834 over 12 sec?
                        // Let's use AP formula: (Base + 24% AP) / Ticks?
                        // Approx: 12 sec = 6 ticks.
                        // Total Dmg = 684 + (2454 * 0.24)? Need valid formula.
                        // Using provided prompt info: "Basiswert + (0.24 * AP)"
                        var ripBase = 600 + (ap * 0.24 * 5); // Rough Scaling
                        if (res !== "MISS" && res !== "DODGE") {
                             auras["Rip"] = t + 12.0;
                             dealDamage("Rip", ripBase, "Bleed", "DoT"); // Instant full credit for simplicity
                             cp = 0; // Reset CP
                        }
                    } else if (action === "Ferocious Bite") {
                        // Consumes all energy.
                        // Base (5 CP) ~ 200 + AP * 0.15
                        // Plus dmg per extra energy
                        var extraEnergy = energy; // All remaining
                        energy = 0;
                        
                        dmgBase = 200 + (ap * 0.15);
                        dmgBase += (extraEnergy * 2.0); // +2 dmg per point
                        
                        cp = 0;
                    }
                    
                    // Crit Multiplier
                    if (isCrit) dmgBase *= 2.0; // Standard Melee Crit
                    
                    // Armor
                    // Bleeds ignore armor
                    var isBleed = (action === "Rip" || action.includes("DoT"));
                    if (!isBleed) dmgBase *= (1 - armorReduction);
                    
                    // Deal Damage
                    dealDamage(action, dmgBase, "Physical", res);
                }
                
                if (!counts[action]) counts[action] = 0; counts[action]++;
                
                // CP Cap
                if (cp > 5) cp = 5;
                
                // GCD Trigger
                nextGCD = t + 1.0;
            }
        }
    }
    
    // --- END STATS ---
    var dps = totalDmg / maxT;
    
    return {
        dps: dps,
        totalDmg: totalDmg,
        duration: maxT,
        log: log,
        dmgSources: dmgSources,
        counts: counts,
        missCounts: missCounts,
        critCounts: critCounts,
        glanceCounts: glanceCounts,
        dodgeCounts: dodgeCounts,
        casts: counts // Alias
    };
}

// ============================================================================
// HELPERS
// ============================================================================

function getArmorReduction(armor, attackerLvl) {
    // DR% = Armor / (Armor + 400 + 85 * (AttackerLevel + 4.5 * (AttackerLevel - 59)))
    // For Level 60 attacker:
    // Constant = 400 + 85 * (60 + 4.5) = 400 + 85 * 64.5 = 400 + 5482.5 = 5882.5
    var c = 5882.5;
    return armor / (armor + c);
}

function aggregateResults(results) {
    if (!results || results.length === 0) return {};
    
    var totalDPS = 0;
    var totalDmg = 0;
    var dmgSources = {};
    var counts = {};
    var critCounts = {};
    var missCounts = {};
    var glanceCounts = {};
    var dodgeCounts = {};
    
    // Sum up
    results.forEach(function(r) {
        totalDPS += r.dps;
        totalDmg += r.totalDmg;
        
        for(var k in r.dmgSources) {
            dmgSources[k] = (dmgSources[k] || 0) + r.dmgSources[k];
        }
        for(var k in r.counts) {
            counts[k] = (counts[k] || 0) + r.counts[k];
        }
        for(var k in r.critCounts) {
            critCounts[k] = (critCounts[k] || 0) + r.critCounts[k];
        }
        for(var k in r.missCounts) {
            missCounts[k] = (missCounts[k] || 0) + r.missCounts[k];
        }
        for(var k in r.glanceCounts) {
            glanceCounts[k] = (glanceCounts[k] || 0) + r.glanceCounts[k];
        }
        for(var k in r.dodgeCounts) {
            dodgeCounts[k] = (dodgeCounts[k] || 0) + r.dodgeCounts[k];
        }
    });
    
    var n = results.length;
    
    // Average out
    for(var k in dmgSources) dmgSources[k] /= n;
    for(var k in counts) counts[k] /= n;
    for(var k in critCounts) critCounts[k] /= n;
    for(var k in missCounts) missCounts[k] /= n;
    for(var k in glanceCounts) glanceCounts[k] /= n;
    for(var k in dodgeCounts) dodgeCounts[k] /= n;
    
    // Return Avg structure
    return {
        dps: totalDPS / n,
        totalDmg: totalDmg / n,
        duration: results[0].duration,
        log: results[0].log, // Return log of first sim for visualization
        dmgSources: dmgSources,
        counts: counts,
        critCounts: critCounts,
        missCounts: missCounts,
        glanceCounts: glanceCounts,
        dodgeCounts: dodgeCounts,
        casts: counts
    };
}