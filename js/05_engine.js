/**
 * Feral Simulation - File 5: Simulation Engine & Math
 * Updated for Turtle WoW 1.18 (Feral Cat)
 * Features: Event-based Engine, Stochastic Calculations (RNG), Patch 1.18 Formulas
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
    // Helper to safely get UI values
    var getCheck = (id) => { var el = document.getElementById(id); return el ? (el.checked ? 1 : 0) : 0; };
    var getNum = (id) => { var el = document.getElementById(id); return el ? (parseFloat(el.value) || 0) : 0; };
    var getSel = (id) => { var el = document.getElementById(id); return el ? el.value : ""; };

    return {
        // Sim Settings
        simTime: getNum("simTime") || 60,
        iterations: getNum("simCount") || 1000,
        
        // Player Config
        race: getSel("char_race") || "Tauren",
        
        // Stats inputs (Total displayed on UI from gear.js)
        inputStr: getNum("stat_str"),
        inputAgi: getNum("stat_agi"),
        inputAP: getNum("stat_ap"),     // Includes Base + Gear + Buffs
        inputCrit: getNum("stat_crit"), // Includes Base + Agi + Gear + Buffs
        inputHit: getNum("stat_hit"),
        inputHaste: getNum("stat_haste"),
        
        manaPool: getNum("mana_pool") || 3000,
        wepSkill: 300, // Constant as per prompt

        // Enemy
        enemyLevel: getNum("enemy_level") || 63,
        enemyArmor: getNum("enemy_armor") || 3731,
        canBleed: getCheck("enemy_can_bleed") === 1,

        // Rotation Settings (Config IDs from globals.js)
        rota_position: getSel("rota_position"), // "back" or "front"
        
        use_rip: getCheck("use_rip"),
        rip_cp: getNum("rip_cp"),
        
        use_fb: getCheck("use_fb"),
        fb_energy: getNum("fb_energy"),
        
        use_reshift: getCheck("use_reshift"),
        reshift_energy: getNum("reshift_energy"),
        
        use_tf: getCheck("use_tf"),
        use_rake: getCheck("use_rake"),
        use_shred: getCheck("use_shred"),
        use_claw: getCheck("use_claw"),
        use_ff: getCheck("use_ff"),

        // Talents
        tal_ferocity: getNum("tal_ferocity"),
        tal_feral_aggression: getNum("tal_feral_aggression"),
        tal_imp_shred: getNum("tal_imp_shred"),
        tal_nat_shapeshifter: getNum("tal_nat_shapeshifter"),
        tal_berserk: getNum("tal_berserk"),
        
        // Constant Talents (assumed active if logic dictates, but technically constant)
        tal_open_wounds: 3,
        tal_sharpened_claws: 3,
        tal_primal_fury: 2,
        tal_blood_frenzy: 2,
        tal_predatory_strikes: 3,
        tal_ancient_brutality: 2,
        tal_hotw: 5,
        tal_carnage: 2,
        tal_lotp: 1,
        tal_furor: 5,
        tal_nat_wep: 3,
        tal_omen: 1,

        // Gear / Sets
        hasWolfshead: getCheck("meta_wolfshead") === 1,
        hasT05_4p: getCheck("set_t05_4p") === 1,
        hasMCP: getCheck("item_mcp") === 1
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
        "Tauren":   { baseAp: 295, baseCrit: 3.65, minDmg: 72, maxDmg: 97, speed: 1.0 },
        "NightElf": { baseAp: 295, baseCrit: 3.65, minDmg: 72, maxDmg: 97, speed: 2.0 }
    };
    var base = raceStats[cfg.race] || raceStats["Tauren"];
    
    // Total Stats (from UI inputs which already calculated Base + Gear + Buffs)
    var totalAP = cfg.inputAP;
    var totalCrit = cfg.inputCrit;
    var totalHit = cfg.inputHit;
    
    // Natural Weapons (3/3): Increase Dmg by 10%
    var modNaturalWeapons = 1.10;
    
    // Predatory Strikes (3/3): Increase Dmg of Claw/Rake by 20%
    var modPredatoryStrikes = 1.20;

    // -----------------------------------------
    // 2. COMBAT STATE
    // -----------------------------------------
    var t = 0.0;
    var maxT = cfg.simTime;
    
    // Start Resources
    var energy = 100;
    var mana = cfg.manaPool;
    var cp = 0;
    
    var events = []; // Priority Queue {t, type, data}
    
    // Timers
    var nextEnergyTick = 0.0; // Start tick immediately or randomized? Usually synced to server. 
                              // Standard sim practice: Ticks happen every 2s independent of combat start.
                              // We'll initialize it at 0 + Math.random()*2 for realism, or fixed 2.0?
                              // Prompt says "Kampf in Sekunde 0". Let's assume first tick is at 2.0s or randomized.
                              // We will set first tick at 2.0s to ensure consistent energy flow from start.
    nextEnergyTick = 2.0; 

    var gcdEnd = 0.0;     // Ready immediately
    var swingTimer = 0.0; // Ready immediately
    
    // Auras (Expiry Times)
    var auras = {
        rake: 0,
        rip: 0,
        ff: 0,
        clearcasting: 0,
        tigersFury: 0,      // Dmg Buff
        tigersFurySpeed: 0, // Haste Buff (Blood Frenzy)
        mcp: 0,
        berserk: 0          // Energy Regen Buff
    };
    
    // Cooldowns (Ready Times)
    var cds = {
        tigersFury: 0, // No specific CD mentioned in prompt other than duration/GCD, assume GCD
        mcp: 0,
        berserk: 0,
        ff: 0
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
    
    function logAction(action, info, res, dmgVal) {
        if (log.length < 2000) {
            log.push({
                t: t, 
                event: (dmgVal !== undefined) ? "Damage" : "Cast", 
                ability: action, 
                result: res || "", 
                dmg: dmgVal || 0,
                energy: Math.floor(energy), 
                cp: cp, 
                mana: Math.floor(mana), 
                info: info
            });
        }
    }

    function dealDamage(source, val, type, res) {
        val = Math.floor(val);
        if(!dmgSources[source]) dmgSources[source] = 0;
        dmgSources[source] += val;
        totalDmg += val;
        logAction(source, type, res, val);
    }
    
    function rollDamageRange(min, max) {
        return min + Math.random() * (max - min);
    }

    // Init MCP (if equipped)
    var mcpCharges = cfg.hasMCP ? 3 : 0;
    if(cfg.hasMCP) {
        auras.mcp = 30.0;
        mcpCharges--;
        logAction("MCP", "Haste +50% (Start)");
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
                // Check if aura active (expiry > now) - DoTs snapshot? Engine assumes active aura required
                // In this engine, ticks are scheduled. We check aura timer to allow early refresh/cancel handling
                if (auras[name] >= t - 0.01) {
                    var dmgVal = evt.data.dmg; // Snapshot damage passed in event
                    dealDamage(evt.data.label, dmgVal, "Bleed", "Tick");
                    
                    // Ancient Brutality (2/2): Restore 5 Energy on bleed tick
                    // "Periodic ticks of Bleed effects restore 5 Energy."
                    if (cfg.tal_ancient_brutality > 0) {
                        energy = Math.min(100, energy + 5);
                    }
                }
            }
            else if (evt.type === "tf_energy") {
                // Tiger's Fury Regen Tick (10 energy)
                if (auras.tigersFury > t - 0.01) {
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
        // (Checked dynamically in logic, just setting 0 for clarity not strictly needed but good for debugging)
        
        // MCP Refresh Logic (Auto-use charges)
        if (auras.mcp > 0 && auras.mcp <= t) {
            auras.mcp = 0;
            if (mcpCharges > 0 && t > cds.mcp) {
                auras.mcp = t + 30.0;
                mcpCharges--;
                logAction("MCP", "Re-use", "Charges: "+mcpCharges);
            }
        }

        // 4. White Swing (Auto Attack)
        if (t >= swingTimer - 0.001) {
            // NormalDmg (White) = BaseDmg + (TotalAP-BaseAP)/14
            // BaseDamage: 72 - 97 dmg (RNG)
            var baseDmgRoll = rollDamageRange(base.minDmg, base.maxDmg);
            var apBonus = (totalAP - base.baseAp) / 14.0;
            var rawDmg = baseDmgRoll + apBonus;
            
            // Tiger's Fury: Increase damage done by 50 (adds to NormalDmg)
            if (auras.tigersFury > t) rawDmg += 50;

            // Multipliers
            rawDmg *= modNaturalWeapons; // +10%

            // Attack Table (Stochastic)
            var roll = Math.random() * 100;
            var hitType = "HIT";
            
            // Hit Rating 0% in base, but gear adds inputHit.
            // Hit Cap: 8.6% (Boss). Cat special: 8.6%
            var missChance = Math.max(0, 8.6 - totalHit - cfg.tal_nat_wep); 
            var dodgeChance = 6.5; 
            var critChance = totalCrit;
            
            // Glancing (40% chance vs Boss)
            var glanceChance = (cfg.enemyLevel === 63) ? 40.0 : 0.0;
            
            // Glancing Penalty
            // Standard Vanilla: 300 skill vs 315 def = 35% penalty (0.65 dmg)
            // 305 skill = 15% penalty (0.85 dmg)
            // 300 Skill (Const) -> 0.35 Penalty -> Factor 0.65
            var glanceFactor = 0.65; 

            if (roll < missChance) {
                hitType = "MISS";
                if(!missCounts.Auto) missCounts.Auto=0; missCounts.Auto++;
            } else if (roll < missChance + dodgeChance) {
                hitType = "DODGE";
                if(!dodgeCounts.Auto) dodgeCounts.Auto=0; dodgeCounts.Auto++;
            } else if (roll < missChance + dodgeChance + glanceChance) {
                hitType = "GLANCE";
                rawDmg *= glanceFactor;
                if(!glanceCounts.Auto) glanceCounts.Auto=0; glanceCounts.Auto++;
            } else if (roll < missChance + dodgeChance + glanceChance + critChance) {
                hitType = "CRIT";
                rawDmg *= 2.0;
                if(!critCounts.Auto) critCounts.Auto=0; critCounts.Auto++;
            } else {
                hitType = "HIT";
            }
            
            // Apply Damage
            if (hitType !== "MISS" && hitType !== "DODGE") {
                // Armor Reduct
                // DR = Armor / (Armor + 400 + 85 * (60 + 4.5 * (60 - 59))) = Armor / (Armor + 5882.5)
                var dr = cfg.enemyArmor / (cfg.enemyArmor + 5882.5);
                
                // Faerie Fire: Decrease Armor by 505
                if (auras.ff > t) {
                    var reducedArmor = Math.max(0, cfg.enemyArmor - 505);
                    dr = reducedArmor / (reducedArmor + 5882.5);
                }
                
                rawDmg *= (1 - dr);
                dealDamage("Auto Attack", rawDmg, "Physical", hitType);
                
                // Omen of Clarity Proc (10% on ANY attack, including white)
                if (cfg.tal_omen > 0 && Math.random() < 0.10) {
                    auras.clearcasting = t + 300.0; // Infinite until used
                    logAction("Proc", "Clearcasting");
                }
                
                // T0.5 Proc (Energy) (Chance approx 2% on hit)
                if (cfg.hasT05_4p && Math.random() < 0.02) { 
                    energy = Math.min(100, energy + 20);
                    logAction("Proc", "T0.5 Energy");
                }
            }
            if(!counts.Auto) counts.Auto=0; counts.Auto++;

            // Calculate Next Swing Time (Haste)
            // Base Speed: 1.0 (Tauren) or 2.0 (Elf)
            // "Attack Speed will reduce time in between White Dmg Hits"
            var currentSpeed = base.speed;
            
            // Haste calculation: Speed / ( (1 + Haste%) * (1 + MCP) * (1 + BloodFrenzy) )
            var hasteMod = 1.0;
            if (cfg.inputHaste > 0) hasteMod *= (1 + cfg.inputHaste/100);
            if (auras.mcp > t) hasteMod *= 1.5; // +50%
            if (auras.tigersFurySpeed > t) hasteMod *= 1.2; // +20% from Blood Frenzy
            
            if (cfg.buff_warchief) hasteMod *= 1.15; // Warchief's Blessing (15% haste)
            
            swingTimer = t + (currentSpeed / hasteMod);
        }
        
        // --- C. ACTION PRIORITY LIST (GCD CHECK) ---
        
        if (t >= gcdEnd) {
            
            // 1. Calculate Costs & States
            var costClaw = 45 - cfg.tal_ferocity; 
            var costRake = 40 - cfg.tal_ferocity;
            var costShred = 60 - (cfg.tal_imp_shred * 6); 
            var costRip = 30;
            var costBite = 35;
            var costTF = 30; // Standard cost assumed

            // Clearcasting Check
            // "In Clearcasting state, the the cost of the next ability will be reduced by 100%."
            var isOoc = (auras.clearcasting > t);
            if (isOoc) {
                costClaw=0; costRake=0; costShred=0; costRip=0; costBite=0; costTF=0;
            }
            
            // Helper for Conditions
            var behind = (cfg.rota_position === "back");
            var ripActive = cfg.use_rip;
            var fbActive = cfg.use_fb;
            var reshiftActive = cfg.use_reshift;
            var tfActive = cfg.use_tf;
            var rakeActive = cfg.use_rake;
            var shredActive = cfg.use_shred;
            var clawActive = cfg.use_claw;
            var ffActive = cfg.use_ff;
            
            var targetHasRip = (auras.rip > t);
            var targetHasRake = (auras.rake > t);
            var targetHasFF = (auras.ff > t);
            var bleedImmune = !cfg.canBleed;
            
            var action = null;
            
            // --- ROTATION LOGIC (Strictly from Prompt) ---
            
            // 1. Rip
            // if (Target_has_no_debuff:"Rip" and CP:>RipCP and Rip_active)
            if (!action && !targetHasRip && cp >= cfg.rip_cp && ripActive) {
                if (energy >= costRip) action = "Rip";
            }
            
            // 2. Ferocious Bite
            // if (CP:>4 and FB_active and Energy>FB_Energylvl)
            if (!action && cp > 4 && fbActive && energy > cfg.fb_energy) {
                if (energy >= costBite) action = "Ferocious Bite";
            }
            
            // 3. Reshift
            // if (Energy<Reshift_Energylv and RS_active) then cast Reshift
            // Note: Requires Mana.
            if (!action && energy < cfg.reshift_energy && reshiftActive) {
                // Mana cost check: Base ~400ish for Shift? 
                // Formula: "Reduce Mana cost of all shapeshifting by 10%*#" (Natural Shapeshifter)
                // Base Cat Shift Cost is roughly 16% of base mana? Assuming ~400 flat for sim.
                var shiftCost = 400 * (1 - cfg.tal_nat_shapeshifter * 0.1);
                if (mana >= shiftCost) action = "Reshift";
            }
            
            // 4. Tiger's Fury
            // if (no_my_buff:"Tiger's Fury" and TF_active)
            if (!action && auras.tigersFury <= t && tfActive) {
                if (energy >= costTF) action = "Tiger's Fury";
            }
            
            // 5. Rake
            // if (Target_is_not_Bleed_Immune and has_no_debuff:"Rake" and (behind and nomybuff:Clearcasting) and Rake_active)
            // Logic: Use Rake if behind ONLY if not Clearcasting? Prompt says: "(Clearcasting should be used for Shred if Behind)"
            if (!action && !bleedImmune && !targetHasRake && rakeActive) {
                // Condition: (behind and no clearcasting) OR (front? implied default logic allows rake anywhere, but prompt condition restricts it)
                // Prompt strictly: if (... and (behind and nomybuff:Clearcasting) ...)
                // This implies Rake is skipped if Behind AND Clearcasting (prefer Shred).
                // What if in Front? Prompt doesn't specify front restriction here, but Rake is available front.
                // Assuming the prompt line is the ONLY condition for Rake.
                if (behind && !isOoc) {
                    if (energy >= costRake) action = "Rake";
                } else if (!behind) {
                     // If front, maybe use Rake? The prompt condition "and (behind...)" suggests Rake is only used in this priority step if BEHIND.
                     // However, Rake is a common front opener.
                     // Strict adherence: The "IF" contains "and (behind...)". So if front, this IF fails.
                }
            }
            
            // 6. Shred / Claw
            // if ((my_buff:"Clearcasting" or Target_is_Bleed_Immune) and behind and Shred_active) then cast "Shred"
            // else if (Claw_active) cast "Claw"
            if (!action) {
                if ((isOoc || bleedImmune) && behind && shredActive) {
                    if (energy >= costShred) action = "Shred";
                } else if (clawActive) {
                    if (energy >= costClaw) action = "Claw";
                }
            }
            
            // 7. Faerie Fire
            // if (Target_has_no_debuff:"Fearie Fire" and FF_active)
            // Note: FF (Feral) usually costs 0 energy/mana but uses GCD? Or off-GCD? 
            // In 1.12 it's a spell. Assuming GCD usage, free cost.
            if (!action && !targetHasFF && ffActive) {
                action = "Faerie Fire";
            }

            // --- BERSERK CHECK (Talent) ---
            // Independent of priority list? Usually popped on CD. 
            // Prompt defines it in Talents but not in Rotation. 
            // We assume standard "Use on CD" behavior outside the GCD loop or as top priority if off GCD.
            // Berserk is usually off-GCD. Let's handle it as an instant trigger if available.
            if (cfg.tal_berserk > 0 && cds.berserk <= t) {
                auras.berserk = t + 20.0;
                cds.berserk = t + 360.0; // 6 min
                logAction("Berserk", "Energy Regen +100%");
            }

            // --- EXECUTE ACTION ---
            if (action) {
                var castCost = 0;
                var performAttack = false;
                
                if (action === "Reshift") {
                    var shiftCost = 400 * (1 - cfg.tal_nat_shapeshifter * 0.1);
                    mana -= shiftCost;
                    
                    // "Shifts out and into Cat-Form (Removes "Tiger's Fury" Buff)"
                    auras.tigersFury = 0;
                    auras.tigersFurySpeed = 0;
                    
                    // Furor (5/5): Gain 40 Energy
                    // Wolfshead Helm: +20 Energy (if equipped)
                    var newEnergy = (cfg.tal_furor * 8);
                    if (cfg.hasWolfshead) newEnergy += 20;
                    
                    energy = Math.min(100, newEnergy);
                    
                    logAction("Powershift", "Energy -> " + energy);
                    gcdEnd = t + 1.5; // GCD triggered (Shift is GCD)
                }
                else if (action === "Faerie Fire") {
                    auras.ff = t + 40.0;
                    logAction("Faerie Fire", "Armor -505");
                    gcdEnd = t + 1.0;
                }
                else if (action === "Tiger's Fury") {
                    energy -= costTF;
                    
                    // "Increase damage done by 50... and regenerates 10 Energy every 3 sec. for 6 sec"
                    // "Blood Frenzy: Increase the duration... by 12 seconds." -> Total 18s
                    var dur = 6;
                    if (cfg.tal_blood_frenzy > 0) dur += 12;
                    
                    auras.tigersFury = t + dur;
                    
                    // "Tiger Fury increase your attack speed by 20% for 18 sec" (Blood Frenzy)
                    if (cfg.tal_blood_frenzy > 0) auras.tigersFurySpeed = t + 18;

                    // Schedule Energy Ticks (3, 6, 9, 12, 15, 18)
                    for(var i=1; i*3 <= dur; i++) {
                        addEvent(t + (i*3.0), "tf_energy");
                    }
                    
                    logAction("Tiger's Fury", "Buff Applied");
                    gcdEnd = t + 1.0;
                }
                else {
                    // OFFENSIVE ABILITIES (Claw, Shred, Rake, Rip, FB)
                    performAttack = true;
                    if (action === "Claw") castCost = costClaw;
                    if (action === "Rake") castCost = costRake;
                    if (action === "Shred") castCost = costShred;
                    if (action === "Rip") castCost = costRip;
                    if (action === "Ferocious Bite") castCost = costBite; // Base cost
                }
                
                if (performAttack) {
                    energy -= castCost;
                    if (isOoc) {
                        auras.clearcasting = 0;
                        logAction("Clearcasting", "Consumed");
                    }
                    
                    // --- HIT TABLE (Yellow) ---
                    var roll = Math.random() * 100;
                    // Hit Rating (Yellow) Cap: 9%
                    var missC = Math.max(0, 9.0 - totalHit - cfg.tal_nat_wep);
                    var dodgeC = 6.5; // Boss
                    var critC = totalCrit;
                    
                    // Sharpened Claws (3/3): +6% Crit (Already in totalCrit from Gear)
                    // LotP (1/2): +3% Crit (Already in totalCrit)

                    var res = "HIT";
                    if (roll < missC) res = "MISS";
                    else if (roll < missC + dodgeC) res = "DODGE";
                    else if (roll < missC + dodgeC + critC) res = "CRIT";
                    
                    // 80% Energy Refund on Miss/Dodge
                    if (res === "MISS" || res === "DODGE") {
                        energy += (castCost * 0.8);
                        if(energy > 100) energy = 100;
                        if(!missCounts[action]) missCounts[action]=0;
                        if(res==="MISS") missCounts[action]++; else dodgeCounts[action]++;
                        
                        logAction(action, "Failed", res);
                    } else {
                        // SUCCESSFUL HIT
                        
                        // Primal Fury: Crit adds +1 CP
                        // "Your critical strikes that add combo points add an additional combo point."
                        // Applies to: Claw, Rake, Shred. (Rip/FB spend CP)
                        var cpGen = 0;
                        if (action === "Claw" || action === "Rake" || action === "Shred") cpGen = 1;
                        
                        if (res === "CRIT") {
                            if (cpGen > 0 && cfg.tal_primal_fury > 0) cpGen++;
                            if(!critCounts[action]) critCounts[action]=0; critCounts[action]++;
                        }
                        
                        // --- DAMAGE FORMULAS ---
                        // Note: "NormalDmg" includes (AP/14). We calculate a fresh NormalDmg for the Special.
                        var baseDmgRoll = rollDamageRange(base.minDmg, base.maxDmg);
                        var apBonus = (totalAP - base.baseAp) / 14.0;
                        var normalDmg = baseDmgRoll + apBonus;
                        // TF adds to NormalDmg for abilities too? 
                        // Prompt: "Tiger's Fury: Increase damage done by 50 (adds to NormalDmg)"
                        if (auras.tigersFury > t) normalDmg += 50;

                        var abilityDmg = 0;
                        var isBleed = false;

                        if (action === "Claw") {
                            // 105% * NormalDmg + 115
                            abilityDmg = 1.05 * normalDmg + 115;
                            
                            // Open Wounds (3/3): Increase Damage of Claw by 30% for each active Bleed
                            if (cfg.tal_open_wounds > 0) {
                                var bleeds = 0;
                                if (auras.rake > t) bleeds++;
                                if (auras.rip > t) bleeds++;
                                abilityDmg *= (1 + (0.30 * bleeds)); // max 60%
                            }
                            // Predatory Strikes: +20%
                            abilityDmg *= modPredatoryStrikes;
                        }
                        else if (action === "Shred") {
                            // 225% * NormalDmg + 180
                            abilityDmg = 2.25 * normalDmg + 180;
                            // Imp Shred: Increase damage by 5%*#
                            if (cfg.tal_imp_shred > 0) abilityDmg *= (1 + cfg.tal_imp_shred * 0.05);
                        }
                        else if (action === "Rake") {
                            // HIT Dmg: 61 + 0.115*(TotalAP)
                            abilityDmg = 61 + (0.115 * totalAP);
                            // Predatory Strikes: +20%
                            abilityDmg *= modPredatoryStrikes;
                            
                            // DoT Application
                            // Total Dmg (3 Ticks): 102 + 0.09*(TotalAP)
                            var dotTotal = 102 + (0.09 * totalAP);
                            dotTotal *= modPredatoryStrikes;
                            var tickVal = dotTotal / 3;
                            
                            auras.rake = t + 9.0;
                            addEvent(t + 3.0, "dot_tick", { name: "rake", dmg: tickVal, label: "Rake (DoT)" });
                            addEvent(t + 6.0, "dot_tick", { name: "rake", dmg: tickVal, label: "Rake (DoT)" });
                            addEvent(t + 9.0, "dot_tick", { name: "rake", dmg: tickVal, label: "Rake (DoT)" });
                        }
                        else if (action === "Rip") {
                            // Finisher, spends CP
                            var ticks = 4 + cp; // 4 + CP ticks, every 2 sec
                            // Tick Damage: 47 + (CP-1)*31 + Min(4;CP)/100*(AP-BaseAP)
                            var cpScaled = Math.min(4, cp);
                            var apPart = (totalAP - base.baseAp);
                            var tickDmg = 47 + (cp - 1)*31 + (cpScaled/100 * apPart);
                            
                            // Open Wounds (3/3): Increase Damage of Rip by 15%*3 = 45%?
                            // Prompt says: "Increase Damage of Rip by 15%*." (Assuming per point, max 3) -> 45%? 
                            // Or 15% total? Standard Vanilla is 30% total (10% per point).
                            // Prompt syntax "15%*." implies per point. So 45% at 3/3.
                            // However, let's assume the prompt meant "15%*#" or just "15%".
                            // Given "Open Wounds (3/3): Increase ... by 15%*." -> Likely 15% per point.
                            // Warning: 45% is huge. But sticking to prompt interpretation: "15%*" usually means * Points.
                            // If prompt meant flat 15%, it wouldn't have "*". 
                            if (cfg.tal_open_wounds > 0) tickDmg *= (1 + 0.15 * cfg.tal_open_wounds); // Max 45%
                            
                            auras.rip = t + (ticks * 2.0);
                            for(var i=1; i<=ticks; i++) {
                                addEvent(t + (i*2.0), "dot_tick", { name: "rip", dmg: tickDmg, label: "Rip (DoT)" });
                            }
                            
                            cpGen = -cp; // Consume
                            isBleed = true; // Initial hit is 0, but action is bleed type
                        }
                        else if (action === "Ferocious Bite") {
                            // Damage: (70+128*CP+0,07*TotalAP)*1,005^(Remaining Energy)
                            // Converts extra energy
                            var extraE = energy;
                            energy = 0; // Consumes all
                            
                            var baseFB = 70 + 128*cp + 0.07*totalAP;
                            var multiplier = Math.pow(1.005, extraE);
                            abilityDmg = baseFB * multiplier;
                            
                            // Feral Aggression: Increase FB by 3%*# (max 15%)
                            if (cfg.tal_feral_aggression > 0) abilityDmg *= (1 + cfg.tal_feral_aggression * 0.03);
                            
                            // Carnage (2/2): 20% chance per CP to refresh Rake/Rip and add 1 CP
                            var carnageChance = 0.20 * cfg.tal_carnage * cp; // Max 100% at 5CP? (2*0.2 = 0.4 per CP? No, 2/2 usually implies total effect or per point. 20% PER point seems strong. 5CP = 100%?)
                            // Prompt: "20% chance per combo point spent". Yes, at 5CP it is 100%.
                            if (Math.random() < carnageChance) {
                                // Refresh Rake
                                if (auras.rake > t) {
                                    auras.rake = t + 9.0;
                                    logAction("Carnage", "Refreshed Rake");
                                }
                                // Refresh Rip
                                if (auras.rip > t) {
                                    // Calculate remaining duration? Or reset to full? 
                                    // Usually "Refresh" implies resetting to full duration.
                                    // We need to re-schedule ticks? Complex in event queue.
                                    // Simplification: Update expiry, add new ticks starting from NOW.
                                    // But old ticks are still in queue. 
                                    // Engine constraint: We check aura expiry in event processing.
                                    // If we extend `auras.rip`, old ticks keep going. 
                                    // To be correct, we should add NEW ticks if the old ones run out?
                                    // Actually, standard "Refresh" resets timer.
                                    // We will extend `auras.rip` and let existing ticks play out? No, they stop at old expiry.
                                    // We need to push new ticks.
                                    // Hack: Reset duration. The `dot_tick` logic checks `auras[name] >= t`.
                                    // If we extend `auras.rip`, the old ticks continue valid.
                                    // But we need MORE ticks for the extended time.
                                    // Let's simplified: Carnage ensures uptime.
                                    // We will push new ticks starting from current `auras.rip` end time?
                                    // Or just overwrite: Set new Rip events from Now.
                                    // (This might double dip if old events exist).
                                    // Correct logic: Cancel old (set expiry to now), apply new.
                                    auras.rip = t; // Expire old
                                    // Re-cast Rip logic (free) with same CP? Carnage doesn't say "recast with 5CP strength".
                                    // Usually refreshes current power. We assume same strength as current active?
                                    // For Sim simplicity: We assume Carnage extends the duration.
                                    // Let's just Apply a fresh Rip (Events) as if cast now.
                                    var rTicks = 4 + cp; // Based on CP spent
                                    // Recalc dmg
                                    var cpS = Math.min(4, cp);
                                    var rAp = (totalAP - base.baseAp);
                                    var rDmg = 47 + (cp - 1)*31 + (cpS/100 * rAp);
                                    if (cfg.tal_open_wounds > 0) rDmg *= (1 + 0.15 * cfg.tal_open_wounds);
                                    
                                    auras.rip = t + (rTicks * 2.0);
                                    for(var i=1; i<=rTicks; i++) addEvent(t + (i*2.0), "dot_tick", { name: "rip", dmg: rDmg, label: "Rip (DoT)" });
                                    
                                    logAction("Carnage", "Refreshed Rip");
                                }
                                cpGen = 1; // Add 1 CP instead of spending? 
                                // Prompt: "and to add an additional combo point."
                                // Does it refund the spent ones? No, usually "spent to... add an additional".
                                // Means Result = 1 CP. (Spent 5, Gain 1).
                            } else {
                                cpGen = -cp; // Consume all
                            }
                        }
                        
                        // Modifiers (Natural Weapons: 10% Dmg)
                        abilityDmg *= modNaturalWeapons;

                        // Crit Multiplier (2.0 standard)
                        if (res === "CRIT") abilityDmg *= 2.0;
                        
                        // Armor Reduction (if Physical)
                        // Rip is bleed (ignore armor). Rake Initial is Physical (Armor applies). Rake DoT is Bleed.
                        // FB, Claw, Shred are Physical.
                        if (!isBleed && action !== "Rip") { 
                             var dr = cfg.enemyArmor / (cfg.enemyArmor + 5882.5);
                             // FF Check
                             if (auras.ff > t) {
                                var rA = Math.max(0, cfg.enemyArmor - 505);
                                dr = rA / (rA + 5882.5);
                             }
                             abilityDmg *= (1 - dr);
                        }
                        
                        if (abilityDmg > 0) dealDamage(action, abilityDmg, isBleed ? "Bleed" : "Physical", res);
                        
                        // Apply CP Change
                        cp += cpGen;
                        if (cp > 5) cp = 5;
                        if (cp < 0) cp = 0;
                        
                        // Omen of Clarity Proc on Special Attacks too? 
                        // "10% chance an attack (also normal white attacks)..."
                        if (cfg.tal_omen > 0 && Math.random() < 0.10) {
                             auras.clearcasting = t + 300.0;
                             logAction("Proc", "Clearcasting");
                        }
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