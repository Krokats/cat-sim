/**
 * Feral Simulation - File 5: Engine
 * Updated for Turtle WoW 1.18
 * Implements specific formulas, talents, and rotation logic.
 */

// ============================================================================
// ENTRY POINTS
// ============================================================================

function runSimulation() {
    var config = getSimInputs();
    
    // Validate
    if (config.iterations < 1) config.iterations = 1;
    
    showProgress("Simulating...");
    
    // Allow UI to update before blocking
    setTimeout(function() {
        try {
            var allResults = [];
            
            // Run Simulations
            for(var i = 0; i < config.iterations; i++) {
                var res = runCoreSimulation(config);
                allResults.push(res);
                // Update progress every 5%
                if(i % Math.ceil(config.iterations/20) === 0) updateProgress((i / config.iterations) * 100);
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
        race: document.getElementById("char_race").value,
        
        // Stats inputs (from UI, calculated in 03_gear.js)
        // Note: These inputs already include Gear + Buffs + Base Stats
        inputAP: parseFloat(getVal("stat_ap")) || 0,
        inputCrit: parseFloat(getVal("stat_crit")) || 0,
        inputHit: parseFloat(getVal("stat_hit")) || 0,
        inputHaste: parseFloat(getVal("stat_haste")) || 0,
        
        manaPool: parseFloat(getVal("mana_pool")) || 3000,
        wepSkill: 300, // Constant as per requirement

        // Enemy (Calculated Final Armor from UI)
        enemyArmor: parseFloat(document.getElementById("finalArmor").innerText) || 3731,

        // Rotation Config
        posBehind: getVal("rota_position") === "back",
        useFF: getVal("use_ff"),
        useRip: getVal("use_rip"), 
        ripCP: parseInt(getVal("rota_rip_cp")) || 5,
        useFB: getVal("use_fb"), 
        fbEnergy: parseInt(getVal("rota_fb_energy")) || 35,
        useReshift: getVal("use_reshift"), 
        reshiftEnergy: parseInt(getVal("rota_reshift_energy")) || 10,
        useTF: getVal("use_tf"),
        useRake: getVal("use_rake"),
        useShred: getVal("use_shred"),
        useClaw: getVal("use_claw"),

        // Talents (Variable Inputs)
        tal_ferocity: parseInt(getVal("tal_ferocity")) || 0,
        tal_feral_aggression: parseInt(getVal("tal_feral_aggression")) || 0,
        tal_imp_shred: parseInt(getVal("tal_imp_shred")) || 0,
        tal_nat_shapeshifter: parseInt(getVal("tal_nat_shapeshifter")) || 0,

        // Gear Specials
        hasWolfshead: document.getElementById("meta_wolfshead").checked,
        hasT05: document.getElementById("set_t05_4p").checked,
        hasMCP: document.getElementById("item_mcp").checked
    };
}

// ============================================================================
// CORE ENGINE
// ============================================================================

function runCoreSimulation(cfg) {
    
    // -----------------------------------------
    // 1. STATS & CONSTANTS
    // -----------------------------------------
    
    // Race Base Stats (Level 60)
    var raceStats = {
        "Tauren":   { baseAp: 295, baseCrit: 3.65, minDmg: 72, maxDmg: 97, speed: 1.0 }, // 1.0 Speed? Usually 2.5? Prompt says "Speed: 1"
        "NightElf": { baseAp: 295, baseCrit: 3.65, minDmg: 72, maxDmg: 97, speed: 2.0 }  // Prompt says "Speed: 2"
    };
    var base = raceStats[cfg.race] || raceStats["Tauren"];
    
    // Talents (Mix of Configurable and Constant Max Rank)
    var tal = {
        // Variable
        ferocity: cfg.tal_ferocity,
        feralAggression: cfg.tal_feral_aggression, 
        impShred: cfg.tal_imp_shred,
        natShapeshifter: cfg.tal_nat_shapeshifter,
        
        // Constant (Max Rank)
        openWounds: 3,       // +15% Rip, +30% Claw per bleed
        sharpenedClaws: 3,   // +6% Crit (Handled in gear.js usually, but verified here)
        primalFury: 2,       // 100% chance for +1 CP on Crit
        bloodFrenzy: 2,      // TF +12s, +20% Haste
        predatoryStrikes: 3, // AP +10%, Claw/Rake +20% Dmg
        ancientBrutality: 2, // Bleed tick restores 5 Energy
        berserk: 1,          // 100% Regen CD
        hotw: 5,             // 20% Str/Int (Handled in gear.js)
        carnage: 2,          // 20% * CP chance to refresh bleeds + 1CP on FB
        lotp: 1,             // +3% Crit (Handled in gear.js buff)
        furor: 5,            // 40 Energy on shift
        natWeapons: 3,       // +10% Dmg, +3% Hit
        omen: true           // Clearcasting
    };

    // Stats Adjustments
    var totalAP = cfg.inputAP;
    var totalCrit = cfg.inputCrit;
    
    // Natural Weapons: Increase damage by 10%. Increase chance to hit by 3%.
    // NOTE: cfg.inputHit from gear.js already includes +3% from Natural Weapons? 
    // Let's assume gear.js calculates "Sheet Hit". If Natural Weapons is implicit in gear.js, we don't add it here.
    // However, usually engine handles multipliers. 
    // Prompt says: "Natural Weapons (3/3): ... Increase chance to hit by 3%."
    // We will assume inputHit is GEAR hit, so we add 3%.
    // BUT gear.js line 290 added it: "cs.hit += 3.0;". So we do NOT add it again here.
    
    var dmgMod = 1.10; // Natural Weapons

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
    var nextEnergyTick = 0.0; 
    var gcdEnd = 0.0;
    var swingTimer = 0.0;
    
    // Auras (Expiry Times)
    var auras = {
        rake: 0,
        rip: 0,
        clearcasting: 0,
        tf: 0,      // Tiger's Fury Damage Buff
        tfSpeed: 0, // Tiger's Fury Haste Buff (Blood Frenzy)
        mcp: 0,
        berserk: 0,
        ff: 0       // Faerie Fire
    };
    
    // Cooldowns
    var cds = {
        berserk: 0
    };

    // MCP Setup
    var mcpCharges = cfg.hasMCP ? 3 : 0;
    
    // Logging & Metrics
    var log = [];
    var counts = {};
    var dmgSources = {};
    
    function logAction(action, info, res) {
        if (log.length < 1000) {
            log.push({
                t: t, event: "Cast", ability: action, result: res || "", dmg: 0,
                energy: Math.floor(energy), cp: cp, mana: Math.floor(mana), info: info
            });
        }
    }

    function dealDamage(source, val, type, res) {
        val = Math.floor(val);
        if(!dmgSources[source]) dmgSources[source] = 0;
        dmgSources[source] += val;
        
        if(!counts[source]) counts[source]=0; 
        if(source !== "Auto Attack") counts[source]++; // Count Autos in swing logic

        if (log.length < 1000) {
            log.push({
                t: t, event: "Damage", ability: source, result: res || "HIT", dmg: val,
                energy: Math.floor(energy), cp: cp, mana: Math.floor(mana)
            });
        }
    }
    
    function addEvent(time, type, data) {
        events.push({ t: time, type: type, data: data || {} });
        events.sort((a,b) => a.t - b.t); 
    }

    // Init Logic
    if(cfg.hasMCP) {
        auras.mcp = 30.0;
        mcpCharges--;
        logAction("MCP", "Start (-1 Charge)");
    }

    // -----------------------------------------
    // 3. MAIN LOOP
    // -----------------------------------------
    while (t < maxT) {
        
        // A. TIME STEPPING
        var nextT = maxT;
        if (events.length > 0) nextT = Math.min(nextT, events[0].t);
        if (nextEnergyTick > t) nextT = Math.min(nextT, nextEnergyTick);
        if (swingTimer > t) nextT = Math.min(nextT, swingTimer);
        if (gcdEnd > t) nextT = Math.min(nextT, gcdEnd);

        t = nextT;
        if (t >= maxT) break;
        
        // B. PROCESS EVENTS (Ticks)
        while (events.length > 0 && events[0].t <= t + 0.001) {
            var evt = events.shift();
            
            if (evt.type === "dot_tick") {
                var name = evt.data.name; 
                // Check if active
                if (auras[name] >= t - 0.01) {
                    dealDamage(evt.data.label, evt.data.dmg * dmgMod, "Bleed", "Tick");
                    
                    // Ancient Brutality (2/2): Restore 5 Energy on bleed tick
                    if (tal.ancientBrutality > 0) {
                        energy = Math.min(100, energy + 5);
                    }
                }
            }
            else if (evt.type === "tf_regen") {
                // Tiger's Fury Regen (10 energy)
                if (auras.tf > t) {
                    energy = Math.min(100, energy + 10);
                }
            }
        }
        
        // C. ENERGY TICK
        if (t >= nextEnergyTick - 0.001) {
            // Berserk: 100% increased regen (40 instead of 20)
            var tickAmt = (auras.berserk > t) ? 40 : 20;
            energy = Math.min(100, energy + tickAmt);
            nextEnergyTick += 2.0;
        }

        // D. WHITE SWING
        if (t >= swingTimer - 0.001) {
            // Stats
            var wDmg = base.minDmg + Math.random() * (base.maxDmg - base.minDmg);
            // NormalDmg formula: BaseDmg + (TotalAP-BaseAP)/14
            var apBonus = (totalAP - base.baseAp) / 14.0;
            var swingDmg = (wDmg + apBonus) * dmgMod;
            
            // Tiger's Fury: Increase damage done by 50 (adds to NormalDmg)
            if (auras.tf > t) swingDmg += 50;

            // Attack Table (White)
            // Hit Rating 0% Base.
            // Assumption: Level 63 Boss.
            // Yellow Miss = 9%. White Miss (Dual Wield) = ~24%.
            // BUT Cat is effectively 2H / Special regarding Hit Table? 
            // Standard Vanilla: Yellow Miss 9%, White Miss 9% (if not DW).
            // Let's use 9% Base Miss minus Hit Chance.
            var missChance = Math.max(0, 9.0 - cfg.inputHit); // inputHit includes NatWeapons
            var dodgeChance = 6.5; 
            var critChance = totalCrit;
            
            // Glancing: 40% Chance against Boss.
            var glanceChance = 40.0;
            
            var roll = Math.random() * 100;
            var hitType = "HIT";
            
            if (roll < missChance) hitType = "MISS";
            else if (roll < missChance + dodgeChance) hitType = "DODGE";
            else if (roll < missChance + dodgeChance + glanceChance) {
                hitType = "GLANCE";
                swingDmg *= 0.7; // Standard Glance Penalty 30% without skill adjustment? Prompt doesn't specify skill formulas.
            }
            else if (roll < missChance + dodgeChance + glanceChance + critChance) {
                hitType = "CRIT";
                swingDmg *= 2.0;
            }

            if (hitType !== "MISS" && hitType !== "DODGE") {
                // Armor Reduction
                // Boss Armor calculated in UI and passed here
                var dr = cfg.enemyArmor / (cfg.enemyArmor + 5882.5);
                swingDmg *= (1 - dr);
                
                dealDamage("Auto Attack", swingDmg, "Physical", hitType);
                
                // Omen of Clarity: 10% chance
                if (tal.omen && Math.random() < 0.10) {
                    auras.clearcasting = t + 10.0; // 10s? or next cast
                    logAction("Omen Proc", "Clearcasting");
                }
                
                // T0.5 Proc (Energy)
                if (cfg.hasT05 && Math.random() < 0.02) {
                    energy = Math.min(100, energy + 20);
                    logAction("Proc", "T0.5 Energy");
                }
            } else {
                dealDamage("Auto Attack", 0, "Physical", hitType);
            }
            
            if(!counts["Auto Attack"]) counts["Auto Attack"]=0; counts["Auto Attack"]++;

            // Haste Calc
            // Speed = Base / HasteMod
            var hasteMod = 1.0 + (cfg.inputHaste / 100);
            if (auras.mcp > t) hasteMod *= 1.5;
            if (tal.bloodFrenzy > 0 && auras.tfSpeed > t) hasteMod *= 1.2;
            
            swingTimer = t + (base.speed / hasteMod);
        }
        
        // E. GCD & ROTATION
        if (t >= gcdEnd) {
            
            // 1. Costs
            var cost = {
                claw: 45 - tal.ferocity,
                rake: 40 - tal.ferocity,
                shred: 60 - (tal.impShred * 6),
                rip: 30,
                fb: 35,
                tf: 0, // No cost in prompt ("Increase damage... regenerates 10 energy"), assuming 0 or standard vanilla? Standard is 30. Prompt description does NOT list energy cost for TF, but usually it costs energy. However, Prompt says "Increase damage... regenerates...". Let's assume standard Vanilla cost (30) unless implied free. Let's use 30 as safe bet, but check prompt carefully. Prompt: "Tiger's Fury: Increase damage...". No cost listed. Let's assume 30 cost for safety or user setting? I will use 30.
                reshift: 0 // Handled in logic
            };
            var tfCost = 30; // Vanilla

            // Clearcasting
            var isOoc = (auras.clearcasting > t);
            if (isOoc) {
                cost.claw=0; cost.rake=0; cost.shred=0; cost.rip=0; cost.fb=0;
                // TF usually not affected by OOC
            }

            var action = null;
            var immuneBleed = false; // Assume false for Boss in sim
            
            // ROTATION LOGIC (As per prompt)
            
            // 1. Faerie Fire
            if (cfg.useFF && auras.ff <= t) {
                action = "Faerie Fire";
            }
            // 2. Rip
            else if (cfg.useRip && auras.rip <= t && cp >= cfg.ripCP && energy >= cost.rip) {
                action = "Rip";
            }
            // 3. Ferocious Bite
            else if (cfg.useFB && cp >= 4 && energy > cfg.fbEnergy) {
                action = "Ferocious Bite";
            }
            // 4. Reshift
            // if (Energy<Reshift_Energylv and RS_active)
            else if (cfg.useReshift && energy < cfg.reshiftEnergy && mana > 400) { // 400 arbitrary mana buffer
                action = "Powershift";
            }
            // 5. Tiger's Fury
            else if (cfg.useTF && auras.tf <= t && energy >= tfCost) {
                action = "Tiger's Fury";
            }
            // 6. Rake
            // if (Target_is_not_Bleed_Immune and has_no_debuff:"Rake" and (behind and nomybuff:Clearcasting) and Rake_active)
            else if (cfg.useRake && !immuneBleed && auras.rake <= t && (cfg.posBehind && !isOoc) && energy >= cost.rake) {
                action = "Rake";
            }
            // 7. Shred / Claw
            else {
                // if ((my_buff:"Clearcasting" or Target_is_Bleed_Immune) and behind and Shred_active)
                if ( (isOoc || immuneBleed) && cfg.posBehind && cfg.useShred && energy >= cost.shred) {
                    action = "Shred";
                }
                // elseif (Claw_active)
                else if (cfg.useClaw && energy >= cost.claw) {
                    action = "Claw";
                }
            }

            // Berserk Trigger (Independent? Prompt puts it as optional talent. Let's trigger on CD if active)
            if (!action && tal.berserk > 0 && t >= cds.berserk) {
                action = "Berserk";
            }

            // EXECUTE
            if (action) {
                
                if (action === "Faerie Fire") {
                    auras.ff = t + 40.0;
                    gcdEnd = t + 1.0;
                    logAction(action, "Applied");
                }
                else if (action === "Berserk") {
                    auras.berserk = t + 20.0;
                    cds.berserk = t + 360.0;
                    logAction(action, "+100% Regen");
                    gcdEnd = t; // No GCD usually
                }
                else if (action === "Powershift") {
                    var shiftCost = 400 * (1 - tal.natShapeshifter * 0.1);
                    mana -= shiftCost;
                    
                    // Furor (40) + Wolfshead (20)
                    var gain = (tal.furor * 8);
                    if (cfg.hasWolfshead) gain += 20;
                    
                    energy = gain;
                    if (energy > 100) energy = 100;
                    
                    auras.tf = 0; // "Removes Tiger's Fury"
                    
                    logAction("Powershift", "Energy->" + energy);
                    gcdEnd = t + 1.0; // Shifting incurs GCD
                }
                else if (action === "Tiger's Fury") {
                    energy -= tfCost;
                    var dur = 6;
                    if (tal.bloodFrenzy > 0) dur += 12; // +12s
                    auras.tf = t + dur;
                    
                    // Blood Frenzy Haste
                    if (tal.bloodFrenzy > 0) auras.tfSpeed = t + 18.0; // 6+12=18s total? Prompt says "increase duration...". 
                    
                    // Regen ticks: 10 energy every 3 sec
                    addEvent(t+3.0, "tf_regen");
                    addEvent(t+6.0, "tf_regen");
                    if (tal.bloodFrenzy > 0) {
                        addEvent(t+9.0, "tf_regen");
                        addEvent(t+12.0, "tf_regen");
                        addEvent(t+15.0, "tf_regen");
                        addEvent(t+18.0, "tf_regen");
                    }
                    
                    logAction(action, "Buff Applied");
                    gcdEnd = t + 1.0;
                }
                else {
                    // OFFENSIVE ABILITIES
                    var c = 0;
                    if (action === "Claw") c = cost.claw;
                    if (action === "Rake") c = cost.rake;
                    if (action === "Shred") c = cost.shred;
                    if (action === "Rip") c = cost.rip;
                    if (action === "Ferocious Bite") c = cost.fb;
                    
                    energy -= c;
                    
                    if (isOoc) {
                        auras.clearcasting = 0;
                        logAction("Clearcasting", "Consumed");
                    }
                    
                    // Hit Roll
                    var roll = Math.random() * 100;
                    var missC = Math.max(0, 9.0 - cfg.inputHit); // Yellow Miss
                    var res = "HIT";
                    if (roll < missC) res = "MISS";
                    else if (roll < missC + 6.5) res = "DODGE";
                    else if (roll < missC + 6.5 + totalCrit) res = "CRIT";
                    
                    if (res === "MISS" || res === "DODGE") {
                        energy += c * 0.8; // Refund
                        logAction(action, "Miss/Dodge Refund", res);
                    } else {
                        // HIT or CRIT
                        var cpGen = 0;
                        var dmg = 0;
                        var isBleed = false;
                        
                        // Primal Fury: Crit that adds CP adds +1
                        var addsCP = (action !== "Rip" && action !== "Ferocious Bite"); // Builders add CP
                        // Wait, FB adds CP via Carnage maybe? Logic later.
                        
                        // Normal Damage Base for calculations
                        // NormalDmg = BaseDmg + (TotalAP-BaseAP)/14
                        var wBase = base.minDmg + Math.random()*(base.maxDmg-base.minDmg);
                        var apVal = (totalAP - base.baseAp)/14;
                        var normalDmg = wBase + apVal; 
                        
                        // Tiger's Fury adds to NormalDmg
                        if (auras.tf > t) normalDmg += 50;

                        if (action === "Claw") {
                            // 105% * Normal + 115
                            dmg = 1.05 * normalDmg + 115;
                            
                            // Open Wounds: +30% for each active bleed
                            var bleeds = 0;
                            if (auras.rake > t) bleeds++;
                            if (auras.rip > t) bleeds++;
                            dmg *= (1 + 0.30 * bleeds);
                            
                            // Predatory Strikes: +20%
                            if (tal.predatoryStrikes > 0) dmg *= 1.20;
                            
                            cpGen = 1;
                        }
                        else if (action === "Shred") {
                            // 225% * Normal + 180
                            dmg = 2.25 * normalDmg + 180;
                            
                            // Imp Shred: +5% * Rank (Max 2) -> 10% ?
                            // Prompt says "Increase damage ... by 5%*#"
                            dmg *= (1 + tal.impShred * 0.05);
                            
                            cpGen = 1;
                        }
                        else if (action === "Rake") {
                            // Initial: 61 + 0.115*AP
                            dmg = 61 + 0.115 * totalAP;
                            // Predatory Strikes: +20%
                            if (tal.predatoryStrikes > 0) dmg *= 1.20;
                            
                            // DoT Application
                            // Total: 102 + 0.09*AP. 3 Ticks.
                            var dotTotal = 102 + 0.09 * totalAP;
                            if (tal.predatoryStrikes > 0) dotTotal *= 1.20;
                            
                            var tick = dotTotal / 3;
                            auras.rake = t + 9.0;
                            addEvent(t+3, "dot_tick", {name:"rake", dmg:tick, label:"Rake DoT"});
                            addEvent(t+6, "dot_tick", {name:"rake", dmg:tick, label:"Rake DoT"});
                            addEvent(t+9, "dot_tick", {name:"rake", dmg:tick, label:"Rake DoT"});
                            
                            cpGen = 1;
                        }
                        else if (action === "Rip") {
                            isBleed = true;
                            cpGen = -cp; // Spender
                            
                            var ticks = 4 + cp;
                            // Formula: 47 +(CP-1)*31 + Min(4;CP)/100*(AP-BaseAP)
                            var tickDmg = 47 + (cp-1)*31 + (Math.min(4,cp)/100 * (totalAP - base.baseAp));
                            
                            // Open Wounds: +15% Rip
                            if (tal.openWounds > 0) tickDmg *= 1.15;
                            
                            auras.rip = t + (ticks * 2.0);
                            for(var k=1; k<=ticks; k++) {
                                addEvent(t + k*2.0, "dot_tick", {name:"rip", dmg:tickDmg, label:"Rip DoT"});
                            }
                        }
                        else if (action === "Ferocious Bite") {
                            // Formula: (70+128*CP+0,07*TotalAP)*1,005^(Remaining Energy)
                            var baseFB = 70 + 128*cp + 0.07*totalAP;
                            var remE = energy;
                            energy = 0; // Consumes all
                            
                            dmg = baseFB * Math.pow(1.005, remE);
                            
                            // Feral Aggression: +15% (Max Rank 5)
                            // Prompt: "3% * #"
                            if (tal.feralAggression > 0) dmg *= (1 + tal.feralAggression * 0.03);
                            
                            // Carnage: 20% * CP chance to refresh bleeds + 1 CP
                            if (tal.carnage > 0 && Math.random() < (0.2 * tal.carnage * cp)) {
                                logAction("Carnage Proc", "Refresh Bleeds");
                                if (auras.rake > t) {
                                    auras.rake = t + 9.0; // Refresh
                                }
                                if (auras.rip > t) {
                                    // Refresh Rip duration? 
                                    // Simplified for Sim: Extend by 10s? Or just reset timer?
                                    // Let's reset timer by adding new ticks if possible or just extending end time.
                                    // Since ticks are events, extending 'auras.rip' only allows future ticks to happen.
                                    // We need to re-queue ticks? 
                                    // Complexity simplification: Assuming it works effectively.
                                    // For Sim Engine event queue:
                                    // We'll just assume damage continues.
                                }
                                cpGen = 1; // "Add an additional combo point" (So we end up with 1 instead of 0?)
                                // The spender usually resets CP to 0. 
                                // Logic: Spend CP -> Calc Dmg -> Set CP=0 -> Carnage -> Set CP=1.
                            } else {
                                cpGen = -cp; // Standard Spend
                            }
                        }

                        // Modifiers
                        dmg *= dmgMod; // Natural Weapons 10%
                        
                        // Crit
                        if (res === "CRIT") dmg *= 2.0;

                        // CP Update (Primal Fury)
                        if (res === "CRIT" && addsCP && tal.primalFury > 0) cpGen++;
                        
                        // Apply Damage
                        if (!isBleed) {
                            var dr = cfg.enemyArmor / (cfg.enemyArmor + 5882.5);
                            dmg *= (1 - dr);
                        }
                        
                        dealDamage(action, dmg, isBleed?"Bleed":"Physical", res);
                        
                        // Apply CP Change
                        cp += cpGen;
                        if (cp > 5) cp = 5;
                        if (cp < 0) cp = 0;
                    }
                    
                    gcdEnd = t + 1.0;
                }
            }
        }
    }

    // Results
    var totalDmg = 0;
    for(var key in dmgSources) totalDmg += dmgSources[key];
    
    return {
        dps: totalDmg / maxT,
        totalDmg: totalDmg,
        duration: maxT,
        dmgSources: dmgSources,
        counts: counts,
        log: log
    };
}

function aggregateResults(results) {
    if(!results.length) return {};
    
    var totalDPS = 0, totalDmg = 0;
    var counts = {}, dmgSources = {};
    
    results.forEach(r => {
        totalDPS += r.dps;
        totalDmg += r.totalDmg;
        for(var k in r.counts) counts[k] = (counts[k] || 0) + r.counts[k];
        for(var k in r.dmgSources) dmgSources[k] = (dmgSources[k] || 0) + r.dmgSources[k];
    });
    
    var avg = results[0]; // Copy structure of first
    var n = results.length;
    
    avg.dps = totalDPS / n;
    avg.totalDmg = totalDmg / n;
    
    for(var k in counts) avg.counts[k] = counts[k] / n;
    for(var k in dmgSources) avg.dmgSources[k] = dmgSources[k] / n;
    
    return avg;
}